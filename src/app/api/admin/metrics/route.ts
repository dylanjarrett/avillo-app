// src/app/api/admin/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole, SubscriptionStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");

const stripe = new Stripe(stripeSecretKey);

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

  return { ok: true };
}

type MetricsUserRow = {
  id: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus | null;
  stripePriceId: string | null;
};

async function priceToMonthlyUsd(priceId: string) {
  const price = await stripe.prices.retrieve(priceId);
  const unit = (price.unit_amount ?? 0) / 100;
  const interval = price.recurring?.interval;

  if (interval === "year") return unit / 12;
  return unit; // month or anything else treated as monthly
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const users = (await prisma.user.findMany({
      select: {
        id: true,
        role: true,
        subscriptionStatus: true,
        stripePriceId: true,
      },
    })) as MetricsUserRow[];

    const totalUsers = users.length;
    const adminCount = users.filter((u) => u.role === "ADMIN").length;

    const statuses: Record<string, number> = {};
    for (const u of users) {
      const s = u.subscriptionStatus ?? "NONE";
      statuses[s] = (statuses[s] ?? 0) + 1;
    }

    const activePaid = users.filter(
      (u) => u.subscriptionStatus === "ACTIVE" && !!u.stripePriceId
    );

    const uniquePriceIds = Array.from(new Set(activePaid.map((u) => u.stripePriceId!)));

    const priceMonthly = new Map<string, number>();
    await Promise.all(
      uniquePriceIds.map(async (pid) => {
        priceMonthly.set(pid, await priceToMonthlyUsd(pid));
      })
    );

    const mrr = activePaid.reduce((sum, u) => sum + (priceMonthly.get(u.stripePriceId!) ?? 0), 0);

    return NextResponse.json({
      totals: {
        totalUsers,
        adminCount,
        activePaidCount: activePaid.length,
      },
      statuses,
      revenue: {
        mrrUsd: Math.round(mrr * 100) / 100,
      },
    });
  } catch (err) {
    console.error("Admin metrics error:", err);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}