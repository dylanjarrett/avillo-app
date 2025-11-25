// src/app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY in environment. Add it to .env.local and Vercel."
  );
}

// Let Stripe use the default API version configured on your account
const stripe = new Stripe(stripeSecretKey);

type CheckoutBody = {
  plan?: string; // only "pro" is allowed for now
  period?: "monthly" | "annual";
};

export async function POST(req: NextRequest) {
  try {
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
    const period = body.period === "annual" ? "annual" : "monthly";

    if (plan !== "pro") {
      return NextResponse.json(
        { error: "Only the Avillo Pro plan can be purchased via checkout." },
        { status: 400 }
      );
    }

    const monthlyPriceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    const annualPriceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

    const priceId = period === "annual" ? annualPriceId : monthlyPriceId;

    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price ID not configured." },
        { status: 500 }
      );
    }

    // Lazy-import Prisma so it's not evaluated at build time
    const { prisma } = await import("@/lib/prisma");

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    // Ensure we have a Stripe customer ID for this user
    let stripeCustomerId = (dbUser as any).stripeCustomerId as
      | string
      | null
      | undefined;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email || undefined,
        name: dbUser.name || undefined,
      });

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId: customer.id as any },
      });

      stripeCustomerId = customer.id;
    }

    const baseUrl =
      process.env.NEXTAUTH_URL || "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing?status=success`,
      cancel_url: `${baseUrl}/billing?status=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json(
      { error: "Unable to start checkout right now." },
      { status: 500 }
    );
  }
}
