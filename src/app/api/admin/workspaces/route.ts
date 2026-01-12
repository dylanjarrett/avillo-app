// src/app/api/admin/workspaces/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AccessLevel, SubscriptionPlan, SubscriptionStatus, WorkspaceType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function toDateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIntOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

function pickWorkspacePatch(patch: any) {
  const data: any = {};

  // Classification
  if (patch?.type && Object.values(WorkspaceType).includes(patch.type)) data.type = patch.type;

  // Billing access
  if (patch?.accessLevel && Object.values(AccessLevel).includes(patch.accessLevel)) data.accessLevel = patch.accessLevel;
  if (patch?.plan && Object.values(SubscriptionPlan).includes(patch.plan)) data.plan = patch.plan;
  if (patch?.subscriptionStatus && Object.values(SubscriptionStatus).includes(patch.subscriptionStatus)) {
    data.subscriptionStatus = patch.subscriptionStatus;
  }

  // Dates
  if ("trialEndsAt" in patch) data.trialEndsAt = toDateOrNull(patch.trialEndsAt);
  if ("currentPeriodEnd" in patch) data.currentPeriodEnd = toDateOrNull(patch.currentPeriodEnd);

  // Seats
  const seatLimit = toIntOrUndefined(patch?.seatLimit);
  const includedSeats = toIntOrUndefined(patch?.includedSeats);
  if (seatLimit !== undefined) data.seatLimit = seatLimit;
  if (includedSeats !== undefined) data.includedSeats = includedSeats;

  // Stripe identifiers (optional)
  const stripeFields = ["stripeCustomerId", "stripeSubscriptionId", "stripeBasePriceId", "stripeSeatPriceId"] as const;
  for (const f of stripeFields) {
    if (patch?.[f] === null) data[f] = null;
    if (typeof patch?.[f] === "string") data[f] = patch[f].trim() || null;
  }

  // Billing bypass (ONLY works if you add it to Workspace schema)
  // if (typeof patch?.billingBypass === "boolean") data.billingBypass = patch.billingBypass;

  return data;
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId || "").trim();
    const patch = body?.patch ?? {};

    if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });

    const { prisma } = await import("@/lib/prisma");

    const exists = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, includedSeats: true },
    });

    if (!exists) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const data = pickWorkspacePatch(patch);
    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "No valid patch fields provided." }, { status: 400 });
    }

    // Guard rails: includedSeats should not exceed seatLimit if both provided
    if (data.seatLimit !== undefined && data.includedSeats !== undefined) {
      data.includedSeats = Math.min(data.includedSeats, data.seatLimit);
    }

    // If seatLimit is lowered below existing includedSeats, clamp
    if (data.seatLimit !== undefined && data.includedSeats === undefined && exists.includedSeats > data.seatLimit) {
      data.includedSeats = data.seatLimit;
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { ...data, updatedAt: new Date() },
      select: {
        id: true,
        name: true,
        type: true,
        accessLevel: true,
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        seatLimit: true,
        includedSeats: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeBasePriceId: true,
        stripeSeatPriceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, workspace: updated });
  } catch (err) {
    console.error("[api/admin/workspaces] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update workspace." }, { status: 500 });
  }
}
