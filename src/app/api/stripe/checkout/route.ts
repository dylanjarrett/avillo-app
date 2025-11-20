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

// Let Stripe use the account's default API version (avoids TS apiVersion issues)
const stripe = new Stripe(stripeSecretKey);

// ---- Route handler ----

type CheckoutBody = {
  plan?: string; // e.g. "pro"
  period?: "monthly" | "annual";
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as CheckoutBody;

    // For now we only support the Pro plan in Stripe
    const plan = (body.plan || "pro").toLowerCase();
    const period: "monthly" | "annual" =
      body.period === "annual" ? "annual" : "monthly";

    if (plan !== "pro") {
      return NextResponse.json(
        { error: "Only the Veris Pro plan can be purchased via checkout right now." },
        { status: 400 }
      );
    }

    // Choose the correct Stripe Price ID based on billing period
    const priceId =
      period === "annual"
        ? process.env.STRIPE_PRICE_PRO_ANNUAL
        : process.env.STRIPE_PRICE_PRO_MONTHLY;

    if (!priceId) {
      return NextResponse.json(
        {
          error:
            "Stripe price ID is not configured. Make sure STRIPE_PRICE_PRO_MONTHLY and STRIPE_PRICE_PRO_ANNUAL are set.",
        },
        { status: 500 }
      );
    }

    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/billing?status=success`,
      cancel_url: `${baseUrl}/billing?status=cancelled`,
      subscription_data: {
        metadata: {
          plan,
          period,
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create Stripe checkout session URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Unexpected error while creating Stripe checkout session.",
      },
      { status: 500 }
    );
  }
}
