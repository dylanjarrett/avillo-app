// src/app/api/admin/stripe/sync/route.ts
// src/app/api/admin/stripe/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

type Plan = "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE";
type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();

  if (!email) {
    return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { prisma } = await import("@/lib/prisma");
  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
}

function unixToDate(x: unknown): Date | null {
  if (typeof x !== "number" || !x) return null;
  return new Date(x * 1000);
}

function statusFromStripeStatus(s: Stripe.Subscription.Status): Status {
  switch (s) {
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

function planFromBasePriceId(priceId?: string | null): Plan | null {
  if (!priceId) return null;

  const starterMonthly = process.env.STRIPE_STARTER_MONTHLY_PRICE_ID;
  const starterAnnual = process.env.STRIPE_STARTER_ANNUAL_PRICE_ID;

  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

  const foundingMonthly = process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID;
  const foundingAnnual = process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID;

  const enterpriseBaseMonthly = process.env.STRIPE_ENTERPRISE_BASE_MONTHLY_PRICE_ID;

  if (priceId === starterMonthly || priceId === starterAnnual) return "STARTER";
  if (priceId === proMonthly || priceId === proAnnual) return "PRO";
  if (priceId === foundingMonthly || priceId === foundingAnnual) return "FOUNDING_PRO";
  if (priceId === enterpriseBaseMonthly) return "ENTERPRISE";

  return null;
}

/**
 * For enterprise subscriptions, there are multiple items.
 * We prefer to identify:
 *  - basePriceId = known base plan price (starter/pro/founding/enterprise base)
 *  - seatPriceId = enterprise seat price (if present)
 */
function extractPriceIds(sub: Stripe.Subscription): { basePriceId: string | null; seatPriceId: string | null } {
  const items = sub.items?.data ?? [];

  const knownBase = new Set<string>(
    [
      process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
      process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
      process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID,
      process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID,
      process.env.STRIPE_ENTERPRISE_BASE_MONTHLY_PRICE_ID,
    ].filter(Boolean) as string[]
  );

  const seatPrice = process.env.STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID || null;

  let basePriceId: string | null = null;
  let seatPriceId: string | null = null;

  for (const it of items) {
    const pid = it.price?.id ?? null;
    if (!pid) continue;

    if (!basePriceId && knownBase.has(pid)) basePriceId = pid;
    if (!seatPriceId && seatPrice && pid === seatPrice) seatPriceId = pid;
  }

  // Fallback: if we didn't find base by env match, use first item (better than null)
  if (!basePriceId) basePriceId = items[0]?.price?.id ?? null;

  return { basePriceId, seatPriceId };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId || "").trim();
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    const { prisma } = await import("@/lib/prisma");

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const stripeCustomerId = workspace.stripeCustomerId;
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "Workspace has no stripeCustomerId (cannot sync)." },
        { status: 400 }
      );
    }

    let subscription: Stripe.Subscription | null = null;

    if (workspace.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId).catch(() => null);
    }

    if (!subscription) {
      const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 5,
        status: "all",
      });

      const preferred = subs.data.find((s) =>
        ["active", "trialing", "past_due", "unpaid"].includes(s.status)
      );
      subscription = preferred ?? subs.data[0] ?? null;
    }

    // No subscription found => mark as NONE (don’t guess a plan)
    if (!subscription) {
      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          subscriptionStatus: "NONE" as any,
          stripeSubscriptionId: null,
          stripeBasePriceId: null,
          stripeSeatPriceId: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
          // leave accessLevel as-is (you may have manual grants)
        } as any,
        select: {
          id: true,
          name: true,
          accessLevel: true,
          plan: true,
          subscriptionStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripeBasePriceId: true,
          stripeSeatPriceId: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
        },
      });

      return NextResponse.json({ ok: true, workspace: updated });
    }

    const { basePriceId, seatPriceId } = extractPriceIds(subscription);
    const mappedPlan = planFromBasePriceId(basePriceId);
    const status = statusFromStripeStatus(subscription.status);

    const trialEndsAt = unixToDate((subscription as any).trial_end);
    const currentPeriodEnd = unixToDate((subscription as any).current_period_end);

    const data: any = {
      subscriptionStatus: status as any,
      trialEndsAt: trialEndsAt ?? null,
      currentPeriodEnd: currentPeriodEnd ?? null,
      stripeSubscriptionId: subscription.id,
      stripeBasePriceId: basePriceId ?? null,
      stripeSeatPriceId: seatPriceId ?? null,
      updatedAt: new Date(),
    };

    // Match your webhook: if Stripe says this is a paid/trialing sub, ensure PAID access
    if (status === "ACTIVE" || status === "TRIALING" || status === "PAST_DUE") {
      data.accessLevel = "PAID";
    }

    // Only update plan if we can map it (avoid nuking manual plan grants)
    if (mappedPlan) data.plan = mappedPlan as any;

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data,
      select: {
        id: true,
        name: true,
        accessLevel: true,
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeBasePriceId: true,
        stripeSeatPriceId: true,
      },
    });

    return NextResponse.json({ ok: true, workspace: updated });
  } catch (err) {
    console.error("Admin Stripe sync error:", err);
    return NextResponse.json({ error: "Failed to sync from Stripe." }, { status: 500 });
  }
}
