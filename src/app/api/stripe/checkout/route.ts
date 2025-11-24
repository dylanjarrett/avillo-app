// src/app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

// ---- Stripe client ----
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY in environment. Add it to .env.local (dev) and Vercel (prod)."
  );
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-11-17.clover",
});

// ---- Route handler ----
type CheckoutBody = {
  plan?: string; // e.g. "pro"
  period?: "monthly" | "annual";
};

export async function POST(req: NextRequest) {
  try {
    const body = ((await req.json().catch(() => ({}))) ||
      {}) as CheckoutBody;

    const plan = (body.plan || "pro").toLowerCase();
    const period = body.period === "annual" ? "annual" : "monthly";

    if (plan !== "pro") {
      return NextResponse.json(
        { error: "Only the Avillo Pro plan can be purchased via checkout." },
        { status: 400 }
      );
    }

    // TODO: swap these with your real Stripe price IDs
    const priceId =
      period === "annual"
        ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
        : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price ID not configured." },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/billing?status=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/billing?status=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json(
      { error: "Unable to start checkout right now." },
      { status: 500 }
    );
  }
}