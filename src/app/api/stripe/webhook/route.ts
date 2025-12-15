// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET in environment.");

const stripe = new Stripe(stripeSecretKey);

type Plan = "STARTER" | "PRO" | "FOUNDING_PRO";
type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

function unixToDate(x: unknown): Date | null {
  if (typeof x !== "number" || !x) return null;
  return new Date(x * 1000);
}

/**
 * Stripe TS types can vary by version.
 * Stripe ALWAYS sends these on Subscription objects as unix seconds, but TS may not know them.
 * So we read them safely without fighting types.
 */
function getUnixField(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === "number" ? val : null;
}

function planFromPriceId(priceId?: string | null): Plan | null {
  if (!priceId) return null;

  const starterMonthly =
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? "price_1SeSegPuU4fMjEPuYJkTyNGf";
  const starterAnnual =
    process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "price_1SeSegPuU4fMjEPubZKAdkNu";

  const proMonthly =
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "price_1SeSgXPuU4fMjEPuoyfcpKQ3";
  const proAnnual =
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "price_1SeSflPuU4fMjEPuWLykKHPr";

  const foundingMonthly =
    process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID ?? "price_1SeShcPuU4fMjEPuwuE9sIxf";
  const foundingAnnual =
    process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID ?? "price_1SeShQPuU4fMjEPug2u9Z3KP";

  if (priceId === starterMonthly || priceId === starterAnnual) return "STARTER";
  if (priceId === proMonthly || priceId === proAnnual) return "PRO";
  if (priceId === foundingMonthly || priceId === foundingAnnual) return "FOUNDING_PRO";

  return null;
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

function getCustomerId(
  x: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id ?? null;
}

function getSubscriptionId(x: string | Stripe.Subscription | null | undefined) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id ?? null;
}

function getPrimaryPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

async function updateUserByCustomerId(params: {
  stripeCustomerId: string;
  subscription: Stripe.Subscription;
}) {
  const { stripeCustomerId, subscription } = params;

  const priceId = getPrimaryPriceId(subscription);
  const plan = planFromPriceId(priceId) ?? "STARTER";
  const status = statusFromStripe(subscription);

  // These keys are what Stripe sends in Subscription payloads
  const trialEndUnix = getUnixField(subscription, "trial_end");
  const currentPeriodEndUnix = getUnixField(subscription, "current_period_end");

  const trialEndsAt = unixToDate(trialEndUnix);
  const currentPeriodEnd = unixToDate(currentPeriodEndUnix);

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId },
    select: { id: true },
  });

  if (!user) {
    console.warn("[stripe-webhook] No user found for stripeCustomerId:", stripeCustomerId);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: plan as any,
      subscriptionStatus: status as any,
      trialEndsAt: trialEndsAt ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId ?? undefined,
    },
  });
}

async function handleCanceled(stripeCustomerId: string) {
  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId },
    select: { id: true },
  });

  if (!user) {
    console.warn("[stripe-webhook] No user found for stripeCustomerId:", stripeCustomerId);
    return;
  }

  // V1 behavior: cancel -> downgrade immediately to STARTER
  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: "STARTER" as any,
      subscriptionStatus: "CANCELED" as any,
      trialEndsAt: null,
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
    },
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
        const subscriptionId = getSubscriptionId(session.subscription as any);

        if (!stripeCustomerId || !subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await updateUserByCustomerId({ stripeCustomerId, subscription });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = getCustomerId(subscription.customer as any);
        if (!stripeCustomerId) break;

        await updateUserByCustomerId({ stripeCustomerId, subscription });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = getCustomerId(subscription.customer as any);
        if (!stripeCustomerId) break;

        await handleCanceled(stripeCustomerId);
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