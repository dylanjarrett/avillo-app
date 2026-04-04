// src/app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

function toIsoOrNull(d: Date | string | null | undefined) {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function getCustomerId(x: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id ?? null;
}

function statusFromStripe(sub: Stripe.Subscription) {
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

function unixToIsoOrNull(x: unknown) {
  if (typeof x !== "number" || !x) return null;
  return new Date(x * 1000).toISOString();
}

function resolveFromSubscription(sub: Stripe.Subscription): {
  plan: "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE" | null;
  basePriceId: string | null;
  seatPriceId: string | null;
  includedSeats: number;
  seatLimit: number;
  unknown: boolean;
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
  const has = (id?: string | null) => !!id && ids.includes(id);

  if (has(enterpriseBaseMonthly)) {
    const includedSeats = 5;
    const seatItem = items.find((i) => i.price?.id === enterpriseSeatMonthly);
    const extraSeats = Math.max(0, Number(seatItem?.quantity ?? 0));
    const seatLimit = includedSeats + extraSeats;

    return {
      plan: "ENTERPRISE",
      basePriceId: enterpriseBaseMonthly ?? null,
      seatPriceId: enterpriseSeatMonthly ?? null,
      includedSeats,
      seatLimit,
      unknown: false,
    };
  }

  if (has(starterAnnual) || has(starterMonthly)) {
    return {
      plan: "STARTER",
      basePriceId: has(starterAnnual) ? (starterAnnual as string) : (starterMonthly as string),
      seatPriceId: null,
      includedSeats: 1,
      seatLimit: 1,
      unknown: false,
    };
  }

  if (has(proAnnual) || has(proMonthly)) {
    return {
      plan: "PRO",
      basePriceId: has(proAnnual) ? (proAnnual as string) : (proMonthly as string),
      seatPriceId: null,
      includedSeats: 1,
      seatLimit: 1,
      unknown: false,
    };
  }

  if (has(foundingAnnual) || has(foundingMonthly)) {
    return {
      plan: "FOUNDING_PRO",
      basePriceId: has(foundingAnnual) ? (foundingAnnual as string) : (foundingMonthly as string),
      seatPriceId: null,
      includedSeats: 1,
      seatLimit: 1,
      unknown: false,
    };
  }

  return {
    plan: null,
    basePriceId: items[0]?.price?.id ?? null,
    seatPriceId: null,
    includedSeats: 1,
    seatLimit: 1,
    unknown: true,
  };
}

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const ws = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      type: true,

      accessLevel: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,

      stripeCustomerId: true,
      stripeSubscriptionId: true,

      seatLimit: true,
      includedSeats: true,

      _count: { select: { members: true } },
    },
  });

  if (!ws) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const seatsUsed = Number(ws._count.members ?? 0);

  let outPlan = ws.plan as any;
  let outStatus = ws.subscriptionStatus as any;
  let outTrialEndsAt = toIsoOrNull(ws.trialEndsAt);
  let outCurrentPeriodEnd = toIsoOrNull(ws.currentPeriodEnd);
  let outAccessLevel = ws.accessLevel as any;

  let includedSeats = Math.max(1, Number(ws.includedSeats ?? (ws.plan === "ENTERPRISE" ? 5 : 1)));
  let seatLimit = Math.max(includedSeats, Number(ws.seatLimit ?? includedSeats));

  let stripeSource: "db" | "stripe" = "db";
  let outStripeCustomerId = ws.stripeCustomerId;
  let outStripeSubscriptionId = ws.stripeSubscriptionId;

  if (ws.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(ws.stripeSubscriptionId, {
        expand: ["items.data.price"],
      });

      const resolved = resolveFromSubscription(sub);
      const stripeStatus = statusFromStripe(sub);
      const stripeTrialEndsAt = unixToIsoOrNull((sub as any).trial_end);
      const stripePeriodEnd = unixToIsoOrNull((sub as any).current_period_end);

      stripeSource = "stripe";
      outStripeCustomerId = ws.stripeCustomerId ?? getCustomerId(sub.customer as any) ?? null;
      outStripeSubscriptionId = sub.id;

      if (resolved.unknown || !resolved.plan) {
        console.warn("[billing-status] Unknown Stripe price mapping", {
          workspaceId: ws.id,
          subscriptionId: sub.id,
          priceIds: sub.items?.data?.map((i) => i.price?.id).filter(Boolean) ?? [],
        });

        outStatus = stripeStatus;
        outTrialEndsAt = stripeTrialEndsAt ?? null;
        outCurrentPeriodEnd = stripePeriodEnd ?? null;

        if (stripeStatus === "TRIALING" || stripeStatus === "ACTIVE" || stripeStatus === "PAST_DUE") {
          outAccessLevel = "PAID";
        } else if (stripeStatus === "CANCELED") {
          outAccessLevel = "EXPIRED";
        }

        const shouldUpdateUnknown =
          String(ws.subscriptionStatus ?? "") !== String(stripeStatus ?? "") ||
          String(ws.accessLevel ?? "") !== String(outAccessLevel ?? "") ||
          String(ws.trialEndsAt ? ws.trialEndsAt.toISOString() : "") !== String(outTrialEndsAt ?? "") ||
          String(ws.currentPeriodEnd ? ws.currentPeriodEnd.toISOString() : "") !== String(outCurrentPeriodEnd ?? "") ||
          String(ws.stripeCustomerId ?? "") !== String(outStripeCustomerId ?? "");

        if (shouldUpdateUnknown) {
          await prisma.workspace.update({
            where: { id: ws.id },
            data: {
              accessLevel: outAccessLevel as any,
              subscriptionStatus: stripeStatus as any,
              trialEndsAt: stripeTrialEndsAt ? new Date(stripeTrialEndsAt) : null,
              currentPeriodEnd: stripePeriodEnd ? new Date(stripePeriodEnd) : null,
              stripeCustomerId: outStripeCustomerId ?? null,
              updatedAt: new Date(),
            } as any,
          });
        }
      } else {
        outPlan = resolved.plan;
        outStatus = stripeStatus;
        outTrialEndsAt = stripeTrialEndsAt ?? null;
        outCurrentPeriodEnd = stripePeriodEnd ?? null;

        includedSeats = resolved.includedSeats;
        seatLimit = resolved.seatLimit;

        if (stripeStatus === "TRIALING" || stripeStatus === "ACTIVE" || stripeStatus === "PAST_DUE") {
          outAccessLevel = "PAID";
        } else if (stripeStatus === "CANCELED") {
          outAccessLevel = "EXPIRED";
        }

      const shouldUpdate =
        ws.plan !== resolved.plan ||
        String(ws.subscriptionStatus ?? "") !== String(stripeStatus ?? "") ||
        String(ws.accessLevel ?? "") !== String(outAccessLevel ?? "") ||
        String(ws.trialEndsAt ? ws.trialEndsAt.toISOString() : "") !== String(outTrialEndsAt ?? "") ||
        String(ws.currentPeriodEnd ? ws.currentPeriodEnd.toISOString() : "") !== String(outCurrentPeriodEnd ?? "") ||
        Number(ws.includedSeats ?? 0) !== Number(resolved.includedSeats) ||
        Number(ws.seatLimit ?? 0) !== Number(resolved.seatLimit) ||
        String(ws.stripeCustomerId ?? "") !== String(outStripeCustomerId ?? "");

        if (shouldUpdate) {
          await prisma.workspace.update({
            where: { id: ws.id },
            data: {
              accessLevel: outAccessLevel as any,
              plan: resolved.plan as any,
              subscriptionStatus: stripeStatus as any,
              trialEndsAt: stripeTrialEndsAt ? new Date(stripeTrialEndsAt) : null,
              currentPeriodEnd: stripePeriodEnd ? new Date(stripePeriodEnd) : null,
              includedSeats: resolved.includedSeats,
              seatLimit: resolved.seatLimit,
              stripeCustomerId: outStripeCustomerId ?? null,
              updatedAt: new Date(),
            } as any,
          });
        }
      }
    } catch {
      stripeSource = "db";
    }
  }

  const extraSeats = Math.max(0, seatLimit - includedSeats);
  const isTrialingBase = String(outStatus ?? "").toUpperCase() === "TRIALING" && !!outTrialEndsAt;
  const isEnterprise = String(outPlan ?? "") === "ENTERPRISE";

  return NextResponse.json({
    workspace: {
      id: ws.id,
      type: ws.type,

      accessLevel: outAccessLevel,
      plan: outPlan,
      subscriptionStatus: outStatus,
      trialEndsAt: outTrialEndsAt,
      currentPeriodEnd: outCurrentPeriodEnd,

      seatLimit,
      includedSeats,
      seatsUsed,

      stripeCustomerId: outStripeCustomerId,
      stripeSubscriptionId: outStripeSubscriptionId,

      flags: {
        isEnterprise,
        isTrialingBase,
        stripeSource,
        syncAt: toIsoOrNull(new Date()),
      },

      trial: {
        isTrialingBase,
        endsAt: outTrialEndsAt,
        note: isEnterprise
          ? "Enterprise base + additional seats are free during trial. After trial, seat changes prorate automatically."
          : "Your plan is currently in trial.",
      },

      seats: {
        includedSeats,
        seatLimit,
        extraSeats,
        seatsUsed,
      },
    },
  });
}