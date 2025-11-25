// src/app/api/stripe/portal/route.ts
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

const stripe = new Stripe(stripeSecretKey);

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    const stripeCustomerId = (user as any).stripeCustomerId as
      | string
      | null
      | undefined;

    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "Billing portal is not available yet for this account. Contact billing@avillo.io if this seems wrong.",
        },
        { status: 400 }
      );
    }

    const baseUrl =
      process.env.NEXTAUTH_URL || "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${baseUrl}/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("Stripe billing portal error", err);
    return NextResponse.json(
      { error: "Unable to open billing portal right now." },
      { status: 500 }
    );
  }
}