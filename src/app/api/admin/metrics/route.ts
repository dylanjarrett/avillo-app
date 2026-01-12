// src/app/api/admin/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");

const stripe = new Stripe(stripeSecretKey);

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

async function priceToMonthlyUsd(priceId: string) {
  const price = await stripe.prices.retrieve(priceId);
  const unit = (price.unit_amount ?? 0) / 100;
  const interval = price.recurring?.interval;
  if (interval === "year") return unit / 12;
  return unit;
}

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const { prisma } = await import("@/lib/prisma");

    const [totalUsers, adminCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "ADMIN" as any } }),
    ]);

    // Workspace subscription footprint
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        plan: true,
        subscriptionStatus: true,
        stripeBasePriceId: true,
        stripeSeatPriceId: true,
      },
    });

    const totalWorkspaces = workspaces.length;

    const statuses: Record<string, number> = {};
    for (const w of workspaces) {
      const s = String(w.subscriptionStatus || "NONE");
      statuses[s] = (statuses[s] ?? 0) + 1;
    }

    const activePaid = workspaces.filter(
      (w) => w.subscriptionStatus === ("ACTIVE" as any) && !!w.stripeBasePriceId
    );

    const uniqueBasePriceIds = Array.from(
      new Set(activePaid.map((w) => w.stripeBasePriceId!).filter(Boolean))
    );

    const priceMonthly = new Map<string, number>();
    await Promise.all(
      uniqueBasePriceIds.map(async (pid) => {
        priceMonthly.set(pid, await priceToMonthlyUsd(pid));
      })
    );

    // Base MRR (ignores seats add-on; you can extend later)
    const mrr = activePaid.reduce(
      (sum, w) => sum + (priceMonthly.get(w.stripeBasePriceId!) ?? 0),
      0
    );

    const [totalMemberships, activeMemberships] = await Promise.all([
      prisma.workspaceUser.count(),
      prisma.workspaceUser.count({ where: { removedAt: null } }),
    ]);

    return NextResponse.json({
      totals: {
        totalUsers,
        adminCount,
        totalWorkspaces,
        totalMemberships,
        activeMemberships,
        activePaidWorkspaceCount: activePaid.length,
      },
      workspaceStatuses: statuses,
      revenue: {
        baseMrrUsd: Math.round(mrr * 100) / 100,
      },
      notes: {
        mrr: "Base MRR computed from stripeBasePriceId only (seat add-ons not included).",
      },
    });
  } catch (err) {
    console.error("Admin metrics error:", err);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}
