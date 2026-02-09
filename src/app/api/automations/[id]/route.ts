// src/app/api/automations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import {
  whereReadableAutomation,
  type VisibilityCtx,
} from "@/lib/visibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeString(v: any, max = 200) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}
function safeJson(v: any) {
  if (v == null) return {};
  if (typeof v === "object") return v;
  return {};
}
function safeBool(v: any, fallback: boolean) {
  if (typeof v === "boolean") return v;
  return fallback;
}

type AutoEnt = {
  canRun: boolean;
  canWrite: boolean;
  lockedReason: string | null;
};

async function getAutomationEntitlements(workspaceId: string): Promise<AutoEnt> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { accessLevel: true, plan: true, subscriptionStatus: true },
  });

  if (!ws) {
    return { canRun: false, canWrite: false, lockedReason: "Workspace not found." };
  }

  if (ws.accessLevel === "BETA") {
    return { canRun: true, canWrite: true, lockedReason: null };
  }

  if (ws.accessLevel === "EXPIRED") {
    return {
      canRun: false,
      canWrite: false,
      lockedReason: "Paused: workspace access is expired.",
    };
  }

  const paidPlansThatAllowAutomation = new Set(["PRO", "FOUNDING_PRO", "ENTERPRISE"]);
  const canRun = paidPlansThatAllowAutomation.has(ws.plan);
  const canWrite = paidPlansThatAllowAutomation.has(ws.plan);

  return {
    canRun,
    canWrite,
    lockedReason: canRun ? null : "Paused: upgrade to Avillo Pro to run automations.",
  };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };    

    const ent = await getAutomationEntitlements(ctx.workspaceId);

    const automation = await prisma.automation.findFirst({
      where: { id: params.id, ...whereReadableAutomation(vctx) },
      include: {
        steps: true,
        runs: {
          take: 20,
          orderBy: { executedAt: "desc" },
          include: { steps: true },
        },
      },
    });

    if (!automation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      ...automation,
      effectiveActive: ent.canRun ? automation.active : false,
      lockedReason: ent.canRun ? null : ent.lockedReason,
    });
  } catch (err) {
    console.error("/api/automations/[id] GET error:", err);
    return NextResponse.json({ error: "Failed to load automation." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    const ent = await getAutomationEntitlements(ctx.workspaceId);
    if (!ent.canWrite) {
      return NextResponse.json(
        { error: ent.lockedReason ?? "Upgrade required." },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

    const existing = await prisma.automation.findFirst({
      where: { id: params.id, ...whereReadableAutomation(vctx) },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const name = body.name != null ? safeString(body.name, 120) : undefined;
    const description =
      body.description != null ? safeString(body.description, 500) || null : undefined;
    const trigger = body.trigger != null ? safeString(body.trigger, 80) : undefined;

    const triggerConfig = body.triggerConfig != null ? safeJson(body.triggerConfig) : undefined;
    const entryConditions = body.entryConditions != null ? safeJson(body.entryConditions) : undefined;
    const exitConditions = body.exitConditions != null ? safeJson(body.exitConditions) : undefined;
    const schedule = body.schedule != null ? safeJson(body.schedule) : undefined;

    const folder = body.folder != null ? safeString(body.folder, 120) || null : undefined;
    const timezone = body.timezone != null ? safeString(body.timezone, 80) || null : undefined;

    const active = body.active != null ? safeBool(body.active, true) : undefined;
    const status = body.status != null ? safeString(body.status, 40) || "draft" : undefined;
    const reEnroll = body.reEnroll != null ? safeBool(body.reEnroll, true) : undefined;

    const steps = body.steps != null ? (Array.isArray(body.steps) ? body.steps : null) : undefined;
    if (body.steps != null && steps === null) {
      return NextResponse.json({ error: "steps must be an array." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.automation.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(trigger !== undefined ? { trigger } : {}),
          ...(triggerConfig !== undefined ? { triggerConfig } : {}),
          ...(entryConditions !== undefined ? { entryConditions } : {}),
          ...(exitConditions !== undefined ? { exitConditions } : {}),
          ...(schedule !== undefined ? { schedule } : {}),
          ...(folder !== undefined ? { folder } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(reEnroll !== undefined ? { reEnroll } : {}),
          ...(timezone !== undefined ? { timezone } : {}),
        },
      });

      if (steps !== undefined) {
        await tx.automationStepGroup.upsert({
          where: { automationId: existing.id },
          update: { steps },
          create: { automationId: existing.id, steps },
        });
      }
    });

    const updatedFull = await prisma.automation.findFirst({
      where: { id: existing.id, ...whereReadableAutomation(vctx) },
      include: {
        steps: true,
        runs: {
          take: 20,
          orderBy: { executedAt: "desc" },
          include: { steps: true },
        },
      },
    });

    const entAfter = await getAutomationEntitlements(ctx.workspaceId);

    return NextResponse.json({
      ...updatedFull,
      effectiveActive: entAfter.canRun ? (updatedFull as any)?.active : false,
      lockedReason: entAfter.canRun ? null : entAfter.lockedReason,
    });
  } catch (err) {
    console.error("/api/automations/[id] PUT error:", err);
    return NextResponse.json(
      { error: "We couldn’t update this automation. Try again, or email support@avillo.io." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    const ent = await getAutomationEntitlements(ctx.workspaceId);
    if (!ent.canWrite) {
      return NextResponse.json(
        { error: ent.lockedReason ?? "Upgrade required." },
        { status: 402 }
      );
    }

    const existing = await prisma.automation.findFirst({
      where: { id: params.id, ...whereReadableAutomation(vctx) },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.automation.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/automations/[id] DELETE error:", err);
    return NextResponse.json(
      { error: "We couldn’t delete this automation. Try again, or email support@avillo.io." },
      { status: 500 }
    );
  }
}