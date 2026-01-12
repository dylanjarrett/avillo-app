// src/app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

type BillingPeriod = "monthly" | "annual";
type Plan = "starter" | "pro" | "founding_pro" | "enterprise";

type CheckoutBody = {
  plan?: Plan | string;
  period?: BillingPeriod;
  seatLimit?: number; // enterprise only
};

function isPlan(x: string): x is Plan {
  return x === "starter" || x === "pro" || x === "founding_pro" || x === "enterprise";
}

function clampInt(n: unknown, min: number, max: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const { userId, workspaceId, workspaceRole } = ctx;

    if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = ((await req.json().catch(() => ({}))) || {}) as CheckoutBody;
    const planRaw = String(body.plan ?? "pro").toLowerCase();
    const plan: Plan = isPlan(planRaw) ? planRaw : "pro";
    const period: BillingPeriod = body.period === "annual" ? "annual" : "monthly";

    // Founding Pro kill-switch (optional)
    const foundingEnabled = (process.env.FOUNDING_PRO_ENABLED ?? "true") === "true";
    if (plan === "founding_pro" && !foundingEnabled) {
      return NextResponse.json({ error: "Founding Pro is no longer available." }, { status: 400 });
    }

    // Only these env vars are allowed
    const PRICES: Record<Exclude<Plan, "enterprise">, Record<BillingPeriod, string | undefined>> = {
      starter: {
        monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
        annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
      },
      pro: {
        monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
        annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
      },
      founding_pro: {
        monthly: process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID,
        annual: process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID,
      },
    };

    const ENTERPRISE_BASE_MONTHLY = process.env.STRIPE_ENTERPRISE_BASE_MONTHLY_PRICE_ID;
    const ENTERPRISE_SEAT_MONTHLY = process.env.STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID;

    if (plan === "enterprise" && period === "annual") {
      return NextResponse.json({ error: "Enterprise annual is not available." }, { status: 400 });
    }

    const [ws, u] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          name: true,
          stripeCustomerId: true,
          type: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      }),
    ]);

    if (!ws) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (!u) return NextResponse.json({ error: "User not found." }, { status: 404 });

    // Optional: enterprise only for TEAM workspaces
    if (plan === "enterprise" && ws.type !== "TEAM") {
      return NextResponse.json(
        { error: "Enterprise checkout is only available for TEAM workspaces." },
        { status: 400 }
      );
    }

    let stripeCustomerId = ws.stripeCustomerId ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: u.email || undefined,
        name: ws.name || u.name || undefined,
        metadata: { workspaceId: ws.id, createdByUserId: u.id },
      });

      stripeCustomerId = customer.id;
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { stripeCustomerId },
      });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    let line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    if (plan === "enterprise") {
      if (!ENTERPRISE_BASE_MONTHLY || !ENTERPRISE_SEAT_MONTHLY) {
        return NextResponse.json({ error: "Enterprise Stripe prices not configured." }, { status: 500 });
      }

      const includedSeats = 5;
      const requestedSeatLimit = clampInt(body.seatLimit, 5, 500);
      const extraSeats = Math.max(0, requestedSeatLimit - includedSeats);

      line_items = [
        { price: ENTERPRISE_BASE_MONTHLY, quantity: 1 },
        { price: ENTERPRISE_SEAT_MONTHLY, quantity: extraSeats },
      ];
    } else {
      const priceId = PRICES[plan]?.[period];
      if (!priceId) return NextResponse.json({ error: "Stripe price ID not configured." }, { status: 500 });
      line_items = [{ price: priceId, quantity: 1 }];
    }

    const trialDays = clampInt(process.env.STRIPE_TRIAL_DAYS ?? 30, 0, 90);

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items,

      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: {
          workspaceId: ws.id,
          createdByUserId: u.id,
          targetPlan: plan,
          period,
        },
      },

      // scoped verify
      client_reference_id: ws.id,

      success_url: `${baseUrl}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing?status=cancelled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("[stripe-checkout] error", err);
    return NextResponse.json(
      { error: err?.message || "Unable to start checkout right now." },
      { status: 500 }
    );
  }
}
