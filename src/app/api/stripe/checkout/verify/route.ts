// src/app/api/stripe/checkout/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

type Plan = "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE";
type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

function noStore(json: any, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function unixToDate(x: unknown): Date | null {
  if (typeof x !== "number" || !x) return null;
  return new Date(x * 1000);
}

function getUnixField(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === "number" ? val : null;
}

function statusFromStripe(sub: Stripe.Subscription): Status {
  switch (sub.status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "NONE";
  }
}

/**
 * Determine plan from subscription items by matching known price IDs.
 * For enterprise, we identify it by the presence of the enterprise base monthly price.
 */
function planFromSubscription(sub: Stripe.Subscription): {
  plan: Plan;
  basePriceId: string | null;
  seatPriceId: string | null;
} {
  const starterMonthly = process.env.STRIPE_STARTER_MONTHLY_PRICE_ID;
  const starterAnnual = process.env.STRIPE_STARTER_ANNUAL_PRICE_ID;

  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

  const foundingMonthly = process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID;
  const foundingAnnual = process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID;

  const enterpriseBaseMonthly = process.env.STRIPE_ENTERPRISE_BASE_MONTHLY_PRICE_ID;
  const enterpriseSeatMonthly = process.env.STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID;

  const priceIds = sub.items?.data?.map((i) => i.price?.id).filter(Boolean) as string[];

  const has = (id?: string) => !!id && priceIds.includes(id);

  // Enterprise is base + optional seats (both monthly only)
  if (has(enterpriseBaseMonthly)) {
    return {
      plan: "ENTERPRISE",
      basePriceId: enterpriseBaseMonthly ?? null,
      seatPriceId: has(enterpriseSeatMonthly) ? enterpriseSeatMonthly ?? null : enterpriseSeatMonthly ?? null,
    };
  }

  if (has(starterMonthly) || has(starterAnnual)) {
    const basePriceId = has(starterAnnual) ? starterAnnual! : starterMonthly!;
    return { plan: "STARTER", basePriceId, seatPriceId: null };
  }

  if (has(proMonthly) || has(proAnnual)) {
    const basePriceId = has(proAnnual) ? proAnnual! : proMonthly!;
    return { plan: "PRO", basePriceId, seatPriceId: null };
  }

  if (has(foundingMonthly) || has(foundingAnnual)) {
    const basePriceId = has(foundingAnnual) ? foundingAnnual! : foundingMonthly!;
    return { plan: "FOUNDING_PRO", basePriceId, seatPriceId: null };
  }

  // Fallback if none match (shouldn't happen if you only sell known prices)
  return { plan: "STARTER", basePriceId: sub.items?.data?.[0]?.price?.id ?? null, seatPriceId: null };
}

type VerifyBody = { sessionId?: string };

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return noStore(ctx.error, ctx.status);

    const { workspaceId, workspaceRole, userId } = ctx;

    if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
      return noStore({ ok: false, error: "Forbidden" }, 403);
    }

    const body = ((await req.json().catch(() => ({}))) || {}) as VerifyBody;
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) return noStore({ ok: false, error: "Missing sessionId." }, 400);

    const checkout = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const customerId =
      typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id || null;

    const subscription =
      typeof checkout.subscription === "string"
        ? await stripe.subscriptions.retrieve(checkout.subscription)
        : (checkout.subscription as Stripe.Subscription | null);

    if (!customerId || !subscription) {
      return noStore({ ok: false, error: "Checkout not complete yet. Try again in a moment." }, 409);
    }

    const refWorkspaceId =
      (checkout.client_reference_id as string | null | undefined) ??
      (checkout.metadata?.workspaceId as string | undefined) ??
      (subscription.metadata?.workspaceId as string | undefined) ??
      null;

    if (refWorkspaceId && refWorkspaceId !== workspaceId) {
      return noStore({ ok: false, error: "Checkout session does not match this workspace." }, 403);
    }

    const { plan, basePriceId, seatPriceId } = planFromSubscription(subscription);
    const status = statusFromStripe(subscription);

    const trialEndsAt = unixToDate(getUnixField(subscription, "trial_end"));
    const currentPeriodEnd = unixToDate(getUnixField(subscription, "current_period_end"));

    // For enterprise, compute seatLimit from subscription items
    const includedSeats = 5;
    let seatLimit: number | undefined = undefined;

    if (plan === "ENTERPRISE") {
      const seatItem = subscription.items.data.find(
        (i) => i.price?.id === process.env.STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID
      );
      const extraSeats = Math.max(0, Number(seatItem?.quantity ?? 0));
      seatLimit = includedSeats + extraSeats;
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        accessLevel: "PAID",
        plan: plan as any,
        subscriptionStatus: status as any,
        trialEndsAt: trialEndsAt ?? null,
        currentPeriodEnd: currentPeriodEnd ?? null,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeBasePriceId: basePriceId ?? null,
        stripeSeatPriceId: seatPriceId ?? null,
        ...(plan === "ENTERPRISE"
          ? { includedSeats, seatLimit: seatLimit ?? includedSeats }
          : {}),
        updatedAt: new Date(),
      } as any,
    });

    await prisma.user
      .update({
        where: { id: userId },
        data: { defaultWorkspaceId: workspaceId },
      })
      .catch(() => null);

    return noStore({ ok: true });
  } catch (err: any) {
    console.error("[checkout-verify] error", err);
    return noStore(
      { ok: false, error: err?.message || "Unable to verify checkout right now." },
      500
    );
  }
}
