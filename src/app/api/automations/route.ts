// src/app/api/automations/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeString(v: any, max = 200) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function safeJsonObject(v: any) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  return {};
}

type AutoEnt = {
  canRun: boolean;
  canWrite: boolean;
  lockedReason: string | null;
};

async function getAutomationEntitlements(workspaceId: string): Promise<AutoEnt> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      accessLevel: true,
      plan: true,
      subscriptionStatus: true,
    },
  });

  // If the workspace doesn’t exist, be safe.
  if (!ws) {
    return {
      canRun: false,
      canWrite: false,
      lockedReason: "Workspace not found.",
    };
  }

  // Beta can do everything (common during private beta)
  if (ws.accessLevel === "BETA") {
    return { canRun: true, canWrite: true, lockedReason: null };
  }

  // Expired cannot do anything
  if (ws.accessLevel === "EXPIRED") {
    return {
      canRun: false,
      canWrite: false,
      lockedReason: "Paused: workspace access is expired.",
    };
  }

  // PAID: gate by plan
  const paidPlansThatAllowAutomation = new Set(["PRO", "FOUNDING_PRO", "ENTERPRISE"]);

  const canRun = paidPlansThatAllowAutomation.has(ws.plan);
  const canWrite = paidPlansThatAllowAutomation.has(ws.plan);

  return {
    canRun,
    canWrite,
    lockedReason: canRun ? null : "Paused: upgrade to Avillo Pro to run automations.",
  };
}

export async function GET() {
  const ctx = await requireWorkspace();

  if (!ctx.ok) {
    return NextResponse.json(ctx.error ?? { error: "Unauthorized" }, { status: ctx.status ?? 401 });
  }

  const ent = await getAutomationEntitlements(ctx.workspaceId);

  const automations = await prisma.automation.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { steps: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    automations.map((a) => ({
      ...a,
      effectiveActive: ent.canRun ? a.active : false,
      lockedReason: ent.canRun ? null : ent.lockedReason,
    }))
  );
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const ent = await getAutomationEntitlements(ctx.workspaceId);
  if (!ent.canWrite) {
    return NextResponse.json(
      { error: ent.lockedReason ?? "Upgrade required." },
      { status: 402 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const name = safeString(body.name, 120);
  const trigger = safeString(body.trigger, 80);

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  if (!trigger) return NextResponse.json({ error: "Missing trigger" }, { status: 400 });

  const steps = body.steps;
  if (!Array.isArray(steps)) {
    return NextResponse.json({ error: "steps must be an array." }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const automation = await tx.automation.create({
      data: {
        workspaceId: ctx.workspaceId,
        createdByUserId: ctx.userId,

        name,
        description: body.description != null ? safeString(body.description, 500) || null : null,

        trigger,
        triggerConfig: safeJsonObject(body.triggerConfig),
        entryConditions: safeJsonObject(body.entryConditions),
        exitConditions: safeJsonObject(body.exitConditions),
        schedule: safeJsonObject(body.schedule),

        folder: body.folder != null ? safeString(body.folder, 120) || null : null,
        active: typeof body.active === "boolean" ? body.active : true,
        status: safeString(body.status, 40) || "draft",
        reEnroll: typeof body.reEnroll === "boolean" ? body.reEnroll : true,
        timezone: body.timezone != null ? safeString(body.timezone, 80) || null : null,
      },
      select: { id: true },
    });

    await tx.automationStepGroup.create({
      data: { automationId: automation.id, steps },
    });

    return automation;
  });

  const full = await prisma.automation.findFirst({
    where: { id: created.id, workspaceId: ctx.workspaceId },
    include: { steps: true },
  });

  if (!full) {
    return NextResponse.json({ error: "Failed to load created automation." }, { status: 500 });
  }

  // Recompute (in case plan changes, etc.)
  const entAfter = await getAutomationEntitlements(ctx.workspaceId);

  return NextResponse.json({
    ...full,
    effectiveActive: entAfter.canRun ? full.active : false,
    lockedReason: entAfter.canRun ? null : entAfter.lockedReason,
  });
}