// src/app/api/automations/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitlement, getEntitlementsForUserId } from "@/lib/entitlements";
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

export async function GET() {
  const ctx = await requireWorkspace();

  // Safer during rebuild: let errors surface with the right status
  if (!ctx.ok) {
    return NextResponse.json(ctx.error ?? [], { status: ctx.status ?? 401 });
  }

  const ent = await getEntitlementsForUserId(ctx.userId);
  const canRun = Boolean(ent?.can?.AUTOMATIONS_RUN);

  const automations = await prisma.automation.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { steps: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    automations.map((a) => ({
      ...a,
      effectiveActive: canRun ? a.active : false,
      lockedReason: canRun ? null : "Paused: upgrade to Avillo Pro to run automations.",
    }))
  );
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const gate = await requireEntitlement(ctx.userId, "AUTOMATIONS_WRITE");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

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

  const ent = await getEntitlementsForUserId(ctx.userId);
  const canRun = Boolean(ent?.can?.AUTOMATIONS_RUN);

  return NextResponse.json({
    ...full,
    effectiveActive: canRun ? full.active : false,
    lockedReason: canRun ? null : "Paused: upgrade to Avillo Pro to run automations.",
  });
}