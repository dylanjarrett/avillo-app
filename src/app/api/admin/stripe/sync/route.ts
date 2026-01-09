import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { WorkspaceRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");

const stripe = new Stripe(stripeSecretKey);

type Plan = "STARTER" | "PRO" | "FOUNDING_PRO";
type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
}

function toIso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

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

function getPrimaryPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

function buildUserPayload(u: any) {
  const memberships =
    (u.workspaceMemberships || []).map((wm: any) => ({
      workspaceId: wm.workspace?.id as string,
      workspaceName: (wm.workspace?.name as string) ?? "Untitled workspace",
      workspaceCreatedAt: wm.workspace?.createdAt
        ? new Date(wm.workspace.createdAt).toISOString()
        : null,
      role: wm.role as WorkspaceRole,
      joinedAt: toIso(wm.createdAt ?? null),
    })) ?? [];

  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email,
    brokerage: u.brokerage ?? "",
    role: u.role,

    accessLevel: u.accessLevel,
    plan: u.plan,
    subscriptionStatus: u.subscriptionStatus ?? null,
    trialEndsAt: toIso(u.trialEndsAt ?? null),
    currentPeriodEnd: toIso(u.currentPeriodEnd ?? null),

    stripeCustomerId: u.stripeCustomerId ?? null,
    stripeSubscriptionId: u.stripeSubscriptionId ?? null,
    stripePriceId: u.stripePriceId ?? null,

    openAITokensUsed: u.openAITokensUsed ?? 0,
    lastLoginAt: toIso(u.lastLoginAt ?? null),
    createdAt: u.createdAt.toISOString(),

    workspaceCount: memberships.length,
    memberships,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const userId = body?.userId as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "User has no stripeCustomerId (cannot sync)." },
        { status: 400 }
      );
    }

    const storedSubId = user.stripeSubscriptionId;

    let subscription: Stripe.Subscription | null = null;

    if (storedSubId) {
      subscription = await stripe.subscriptions.retrieve(storedSubId).catch(() => null);
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

    if (!subscription) {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: "NONE" as any,
          stripeSubscriptionId: null,
          stripePriceId: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
        } as any,
        include: {
          workspaceMemberships: {
            include: { workspace: { select: { id: true, name: true, createdAt: true } } },
          },
        },
      });

      return NextResponse.json({ user: buildUserPayload(updated) });
    }

    const priceId = getPrimaryPriceId(subscription);
    const mappedPlan = planFromPriceId(priceId);
    const status = statusFromStripeStatus(subscription.status);

    const trialEndUnix = getUnixField(subscription, "trial_end");
    const currentPeriodEndUnix =
      getUnixField(subscription, "current_period_end") ?? getUnixField(subscription, "trial_end");

    const trialEndsAt = unixToDate(trialEndUnix);
    const currentPeriodEnd = unixToDate(currentPeriodEndUnix);

    const data: any = {
      subscriptionStatus: status as any,
      trialEndsAt: trialEndsAt ?? null,
      currentPeriodEnd: currentPeriodEnd ?? null,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId ?? null,
    };

    // Only update plan if we can map from Stripe price id (prevents overwriting manual grants)
    if (mappedPlan) data.plan = mappedPlan as any;

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      include: {
        workspaceMemberships: {
          include: { workspace: { select: { id: true, name: true, createdAt: true } } },
        },
      },
    });

    return NextResponse.json({ user: buildUserPayload(updated) });
  } catch (err) {
    console.error("Admin Stripe sync error:", err);
    return NextResponse.json({ error: "Failed to sync from Stripe." }, { status: 500 });
  }
}