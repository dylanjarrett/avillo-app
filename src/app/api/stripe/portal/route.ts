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

type Body = {
  // optional: admin-only override to open portal for a specific customer
  customerId?: string;
  // optional: convenience (admin-only) if you prefer passing a userId instead
  userId?: string;
  // optional: override return url
  returnTo?: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { prisma } = await import("@/lib/prisma");

    const requester = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true, stripeCustomerId: true },
    });

    if (!requester) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Read body safely (allow empty body)
    let body: Body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const return_url = `${baseUrl}${body.returnTo || "/billing"}`;

    let stripeCustomerId: string | null | undefined = requester.stripeCustomerId;

    const wantsAdminOverride = !!body.customerId || !!body.userId;

    // If an override is requested, require ADMIN and load target user's customerId if needed
    if (wantsAdminOverride) {
      if (requester.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (body.customerId) {
        stripeCustomerId = body.customerId;
      } else if (body.userId) {
        const target = await prisma.user.findUnique({
          where: { id: body.userId },
          select: { stripeCustomerId: true },
        });

        stripeCustomerId = target?.stripeCustomerId ?? null;
      }
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "Billing portal is not available yet for this account. Contact billing@avillo.io if this seems wrong.",
        },
        { status: 400 }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url,
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