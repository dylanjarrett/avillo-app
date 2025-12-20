// src/app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY in environment. Add it to .env.local and Vercel.");
}

const stripe = new Stripe(stripeSecretKey);

type BillingPeriod = "monthly" | "annual";
type Plan = "starter" | "pro" | "founding_pro";

type CheckoutBody = {
  plan?: Plan | string;
  period?: BillingPeriod;
};

function isPlan(x: string): x is Plan {
  return x === "starter" || x === "pro" || x === "founding_pro";
}

function isValidEmail(email: string) {
  // Basic sanity check; Stripe rejects obvious invalid formats.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const email = (session?.user?.email || "").toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = ((await req.json().catch(() => ({}))) || {}) as CheckoutBody;

    const planRaw = (body.plan || "pro").toString().toLowerCase();
    const plan: Plan = isPlan(planRaw) ? planRaw : "pro";
    const period: BillingPeriod = body.period === "annual" ? "annual" : "monthly";

    const foundingEnabled = (process.env.FOUNDING_PRO_ENABLED ?? "true") === "true";
    if (plan === "founding_pro" && !foundingEnabled) {
      return NextResponse.json({ error: "Founding Pro is no longer available." }, { status: 400 });
    }

    const PRICES: Record<Plan, Record<BillingPeriod, string>> = {
      starter: {
        monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? "price_1SeSegPuU4fMjEPuYJkTyNGf",
        annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "price_1SeSegPuU4fMjEPubZKAdkNu",
      },
      pro: {
        monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "price_1SeSgXPuU4fMjEPuoyfcpKQ3",
        annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "price_1SeSflPuU4fMjEPuWLykKHPr",
      },
      founding_pro: {
        monthly: process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID ?? "price_1SeShcPuU4fMjEPuwuE9sIxf",
        annual: process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID ?? "price_1SeShQPuU4fMjEPug2u9Z3KP",
      },
    };

    const priceId = PRICES?.[plan]?.[period];
    if (!priceId) {
      return NextResponse.json({ error: "Stripe price ID not configured." }, { status: 500 });
    }

    const { prisma } = await import("@/lib/prisma");

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Ensure Stripe customer exists
    let stripeCustomerId = dbUser.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        // Only send email if it looks valid (prevents StripeInvalidRequestError)
        ...(isValidEmail(dbUser.email) ? { email: dbUser.email } : {}),
        name: dbUser.name || undefined,
        metadata: { userId: dbUser.id },
      });

      stripeCustomerId = customer.id;

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId },
      });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    // IMPORTANT: add session_id so we can verify & unlock immediately on return
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,

      line_items: [{ price: priceId, quantity: 1 }],

      subscription_data: {
        trial_period_days: 30,
        metadata: {
          plan,
          period,
          userId: dbUser.id,
        },
      },

      client_reference_id: dbUser.id,

      success_url: `${baseUrl}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing?status=cancelled`,

      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("Stripe checkout error", err);
    return NextResponse.json(
      { error: err?.message || "Unable to start checkout right now." },
      { status: 500 }
    );
  }
}
