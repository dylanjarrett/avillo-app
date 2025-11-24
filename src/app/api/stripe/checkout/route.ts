// src/app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

type CheckoutBody = {
  plan?: string; // e.g. "pro"
  period?: "monthly" | "annual";
};

export async function POST(req: NextRequest) {
  try {
    // Require an authenticated user
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const body = ((await req.json().catch(() => ({}))) ||
      {}) as CheckoutBody;

    const plan = (body.plan || "pro").toLowerCase();
    const period: "monthly" | "annual" =
      body.period === "annual" ? "annual" : "monthly";

    if (plan !== "pro") {
      return NextResponse.json(
        { error: "Only the Avillo Pro plan can be purchased via checkout." },
        { status: 400 }
      );
    }

    // Look up the user in Prisma
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    // Safely read stripeCustomerId from the user (ignore TS complaints)
    let stripeCustomerId =
      (user as any).stripeCustomerId as string | null | undefined;

    // If this is the user's first checkout, create a Stripe customer
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customer.id } as any,
      });

      stripeCustomerId = customer.id;
    }

    // Choose the correct price ID for monthly vs annual
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

    // Create a Stripe Checkout session
    const sessionCheckout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/billing?status=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/billing?status=cancelled`,
    });

    return NextResponse.json({ url: sessionCheckout.url });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json(
      { error: "Unable to start checkout right now." },
      { status: 500 }
    );
  }
}