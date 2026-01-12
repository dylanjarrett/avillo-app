// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET in environment.");

const stripe = new Stripe(stripeSecretKey);

type Plan = "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE";
type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

function unixToDate(x: unknown): Date | null {
  if (typeof x !== "number" || !x) return null;
  return new Date(x * 1000);
}

function getUnixField(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === "number" ? val : null;
}

function getCustomerId(
  x: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id ?? null;
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
 * Determine plan/base/seat from subscription items.
 * Enterprise is monthly-only (base monthly + seat monthly).
 */
function resolveFromSubscription(sub: Stripe.Subscription): {
  plan: Plan;
  basePriceId: string | null;
  seatPriceId: string | null;
  seatLimit: number | null;
  includedSeats: number | null;
} {
  const starterMonthly = process.env.STRIPE_STARTER_MONTHLY_PRICE_ID;
  const starterAnnual = process.env.STRIPE_STARTER_ANNUAL_PRICE_ID;

  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

  const foundingMonthly = process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID;
  const foundingAnnual = process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID;

  const enterpriseBaseMonthly = process.env.STRIPE_ENTERPRISE_BASE_MONTHLY_PRICE_ID;
  const enterpriseSeatMonthly = process.env.STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID;

  const items = sub.items?.data ?? [];
  const ids = items.map((i) => i.price?.id).filter(Boolean) as string[];

  const has = (id?: string) => !!id && ids.includes(id);

  // Enterprise
  if (has(enterpriseBaseMonthly)) {
    const includedSeats = 5;
    const seatItem = items.find((i) => i.price?.id === enterpriseSeatMonthly);
    const extraSeats = Math.max(0, Number(seatItem?.quantity ?? 0));
    const seatLimit = includedSeats + extraSeats;

    return {
      plan: "ENTERPRISE",
      basePriceId: enterpriseBaseMonthly ?? null,
      seatPriceId: enterpriseSeatMonthly ?? null,
      seatLimit,
      includedSeats,
    };
  }

  // Non-enterprise: pick the matching base price
  if (has(starterMonthly) || has(starterAnnual)) {
    const basePriceId = has(starterAnnual) ? starterAnnual! : starterMonthly!;
    return { plan: "STARTER", basePriceId, seatPriceId: null, seatLimit: null, includedSeats: null };
  }

  if (has(proMonthly) || has(proAnnual)) {
    const basePriceId = has(proAnnual) ? proAnnual! : proMonthly!;
    return { plan: "PRO", basePriceId, seatPriceId: null, seatLimit: null, includedSeats: null };
  }

  if (has(foundingMonthly) || has(foundingAnnual)) {
    const basePriceId = has(foundingAnnual) ? foundingAnnual! : foundingMonthly!;
    return {
      plan: "FOUNDING_PRO",
      basePriceId,
      seatPriceId: null,
      seatLimit: null,
      includedSeats: null,
    };
  }

  // Fallback
  return {
    plan: "STARTER",
    basePriceId: items[0]?.price?.id ?? null,
    seatPriceId: null,
    seatLimit: null,
    includedSeats: null,
  };
}

/**
 * Workspace-first billing updater (idempotent).
 * Locates workspace by:
 *  1) subscription.metadata.workspaceId, else
 *  2) Workspace.stripeCustomerId
 */
async function upsertWorkspaceBilling(params: {
  workspaceId?: string | null;
  stripeCustomerId?: string | null;
  subscription: Stripe.Subscription;
}) {
  const { workspaceId, stripeCustomerId, subscription } = params;

  const { plan, basePriceId, seatPriceId, seatLimit, includedSeats } =
    resolveFromSubscription(subscription);

  const status = statusFromStripe(subscription);
  const trialEndsAt = unixToDate(getUnixField(subscription, "trial_end"));
  const currentPeriodEnd = unixToDate(getUnixField(subscription, "current_period_end"));

  const ws =
    (workspaceId
      ? await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { id: true },
        })
      : null) ??
    (stripeCustomerId
      ? await prisma.workspace.findFirst({
          where: { stripeCustomerId },
          select: { id: true },
        })
      : null);

  if (!ws) {
    console.warn("[stripe-webhook] No workspace match", {
      workspaceId,
      stripeCustomerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  await prisma.workspace.update({
    where: { id: ws.id },
    data: {
      accessLevel: "PAID",
      plan: plan as any,
      subscriptionStatus: status as any,
      trialEndsAt: trialEndsAt ?? null,
      currentPeriodEnd: currentPeriodEnd ?? null,
      stripeCustomerId: stripeCustomerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      stripeBasePriceId: basePriceId ?? null,
      stripeSeatPriceId: seatPriceId ?? null,
      ...(plan === "ENTERPRISE"
        ? {
            includedSeats: includedSeats ?? 5,
            seatLimit: seatLimit ?? 5,
          }
        : {}),
      updatedAt: new Date(),
    } as any,
  });
}

async function handleSubscriptionDeleted(params: {
  workspaceId?: string | null;
  stripeCustomerId?: string | null;
}) {
  const { workspaceId, stripeCustomerId } = params;

  const ws =
    (workspaceId
      ? await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })
      : null) ??
    (stripeCustomerId
      ? await prisma.workspace.findFirst({
          where: { stripeCustomerId },
          select: { id: true },
        })
      : null);

  if (!ws) {
    console.warn("[stripe-webhook] No workspace found for subscription.deleted", {
      workspaceId,
      stripeCustomerId,
    });
    return;
  }

  await prisma.workspace.update({
    where: { id: ws.id },
    data: {
      accessLevel: "PAID",
      plan: "STARTER" as any,
      subscriptionStatus: "CANCELED" as any,
      trialEndsAt: null,
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
      stripeBasePriceId: null,
      stripeSeatPriceId: null,
      includedSeats: 1,
      seatLimit: 1,
      updatedAt: new Date(),
    } as any,
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const stripeCustomerId = getCustomerId(session.customer as any);

        const workspaceId =
          (session.client_reference_id as string | null | undefined) ??
          (session.metadata?.workspaceId as string | undefined) ??
          null;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await upsertWorkspaceBilling({ workspaceId, stripeCustomerId, subscription });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = getCustomerId(subscription.customer as any);

        const workspaceId = (subscription.metadata?.workspaceId as string | undefined) ?? null;

        await upsertWorkspaceBilling({ workspaceId, stripeCustomerId, subscription });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = getCustomerId(subscription.customer as any);
        const workspaceId = (subscription.metadata?.workspaceId as string | undefined) ?? null;

        await handleSubscriptionDeleted({ workspaceId, stripeCustomerId });
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
