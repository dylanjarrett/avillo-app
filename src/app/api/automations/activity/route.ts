//api/automations/activity/route
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitlement } from "@/lib/entitlements";
import { requireWorkspace } from "@/lib/workspace";
import {
  whereReadableAutomation,
  type VisibilityCtx,
} from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRunStatus(v: any) {
  const s = String(v || "").toLowerCase();
  if (s.includes("success") || s.includes("completed") || s === "ok") return "success";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("skip")) return "skipped";
  if (s.includes("running") || s.includes("in_progress")) return "running";
  return s || "unknown";
}

function normalizeTaskStatus(v: any) {
  const s = String(v || "").toUpperCase();
  if (s === "DONE" || s === "COMPLETED") return "done";
  return "open";
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };  

    const gate = await requireEntitlement(ctx.workspaceId, "AUTOMATIONS_READ");
    if (!gate.ok) return NextResponse.json({ items: [], tasks: [] }, { status: 200 });

    const url = new URL(req.url);
    const contactId = url.searchParams.get("contactId");
    if (!contactId) return NextResponse.json({ items: [], tasks: [] }, { status: 200 });

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId: ctx.workspaceId },
      select: { id: true, relationshipType: true },
    });

    if (!contact) return NextResponse.json({ items: [], tasks: [] }, { status: 404 });

    if (String(contact.relationshipType) === "PARTNER") {
      return NextResponse.json({ items: [], tasks: [] }, { status: 200 });
    }

    const runs = await prisma.automationRun.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        automation: whereReadableAutomation(vctx),
      },
      orderBy: { executedAt: "desc" },
      take: 15,
      include: {
        automation: { select: { id: true, name: true } },
        steps: {
          orderBy: { executedAt: "desc" },
          take: 30,
          select: {
            id: true,
            stepType: true,
            status: true,
            message: true,
            executedAt: true,
            stepIndex: true,
          },
        },
      },
    });

    const tasks = await prisma.task.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        source: "AUTOPILOT",
        deletedAt: null,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 25,
      select: {
        id: true,
        title: true,
        dueAt: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const items = runs.map((r) => {
      const steps = (r.steps ?? []).map((s) => ({
        id: s.id,
        stepType: s.stepType || "STEP",
        status: normalizeRunStatus(s.status),
        message: s.message ?? "",
        executedAt: s.executedAt.toISOString(),
        stepIndex: s.stepIndex,
      }));

      const counts = steps.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        runId: r.id,
        automationId: r.automationId,
        automationName: r.automation?.name ?? "Automation",
        status: normalizeRunStatus(r.status),
        message: r.message ?? "",
        executedAt: r.executedAt.toISOString(),
        steps,
        counts,
      };
    });

    return NextResponse.json({
      items,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        status: normalizeTaskStatus(t.status),
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    console.error("/api/automations/activity GET error:", err);
    return NextResponse.json({ items: [], tasks: [] }, { status: 200 });
  }
}