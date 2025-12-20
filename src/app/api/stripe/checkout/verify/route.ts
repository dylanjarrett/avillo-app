// src/app/api/stripe/checkout/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");

const stripe = new Stripe(stripeSecretKey);

type Plan = "STARTER" | "PRO" | "FOUNDING_PRO";
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

function getPrimaryPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

type VerifyBody = {
  sessionId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const email = (session?.user?.email || "").toLowerCase().trim();

    if (!email) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = ((await req.json().catch(() => ({}))) || {}) as VerifyBody;
    const sessionId = (body.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
    }

    const { prisma } = await import("@/lib/prisma");

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, stripeCustomerId: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Retrieve checkout session and subscription
    const checkout = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const customerId = typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id;
    const subscription =
      typeof checkout.subscription === "string"
        ? await stripe.subscriptions.retrieve(checkout.subscription)
        : (checkout.subscription as Stripe.Subscription | null);

    if (!customerId || !subscription) {
      return NextResponse.json(
        { error: "Checkout not complete yet. Try again in a moment." },
        { status: 409 }
      );
    }

    // Update customer id if missing (helps recover from earlier state)
    if (!dbUser.stripeCustomerId) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId: customerId as any },
      });
    }

    const priceId = getPrimaryPriceId(subscription);
    const plan = planFromPriceId(priceId) ?? "STARTER";
    const status = statusFromStripe(subscription);

    const trialEndUnix = getUnixField(subscription, "trial_end");
    const currentPeriodEndUnix = getUnixField(subscription, "current_period_end");

    const trialEndsAt = unixToDate(trialEndUnix);
    const currentPeriodEnd = unixToDate(currentPeriodEndUnix);

    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        // ✅ This is the critical fix for your “still locked on billing”
        accessLevel: "PAID" as any,

        plan: plan as any,
        subscriptionStatus: status as any,
        trialEndsAt: trialEndsAt ?? undefined,
        currentPeriodEnd: currentPeriodEnd ?? undefined,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId ?? undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[checkout-verify] error", err);
    return NextResponse.json(
      { error: err?.message || "Unable to verify checkout right now." },
      { status: 500 }
    );
  }
}