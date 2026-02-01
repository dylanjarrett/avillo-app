// /api/listings/[id]/activity/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeedItem = {
  id: string;
  kind: "note" | "task" | "crm" | "activity";
  at: string; // ISO
  title: string;
  subtitle?: string | null;
  meta?: any;
};

function safeISO(d: Date | string | null | undefined) {
  if (!d) return new Date().toISOString();
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    // @ts-ignore
    if (ctx?.ok === false) return NextResponse.json(ctx.error, { status: ctx.status });

    const workspaceId = (ctx as any).workspaceId ?? ctx?.workspaceId;

    const listingId = params?.id;
    if (!listingId) {
      return NextResponse.json({ error: "Listing id is required." }, { status: 400 });
    }

    const listing = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId },
      select: { id: true },
    });

    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

    const url = new URL(req.url);
    const autopilotOnly = url.searchParams.get("autopilot") === "1";

    let canReadAutomations = false;
    try {
      const autoGate: any = await requireEntitlement(workspaceId, "AUTOMATIONS_READ");
      canReadAutomations = !!autoGate?.ok;
    } catch {
      canReadAutomations = false;
    }

    // ---- AUTOPILOT-ONLY MODE (MATCH PEOPLE API SHAPE EXACTLY) ----
    // This returns: { items: runItems, tasks: autopilotTasks }
    // so the Listings UI can reuse the exact same AutopilotActivityCard logic.
    if (autopilotOnly) {
      if (!canReadAutomations) {
        return NextResponse.json({ items: [], tasks: [] }, { status: 200 });
      }

      const runs = await prisma.automationRun.findMany({
        where: { workspaceId, listingId: listing.id },
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

      const autopilotTasks = await prisma.task.findMany({
        where: {
          workspaceId,
          listingId: listing.id,
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
          status: normalizeRunStatus(s.status), // => "success"/"failed"/...
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
          status: normalizeRunStatus(r.status), // => "success"/"failed"/...
          message: r.message ?? "",
          executedAt: r.executedAt.toISOString(),
          steps,
          counts,
        };
      });

      return NextResponse.json({
        items,
        tasks: autopilotTasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueAt: t.dueAt ? t.dueAt.toISOString() : null,
          status: normalizeTaskStatus(t.status), // => "open"/"done"
          createdAt: t.createdAt.toISOString(),
          completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        })),
      });
    }

    // ---- FULL FEED MODE (unchanged consumer contract: { items: FeedItem[] }) ----
    const [notes, tasks, crm, activity, runs] = await Promise.all([
      prisma.listingNote.findMany({
        where: { listingId: listing.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, text: true, reminderAt: true, createdAt: true },
      }),
      prisma.task.findMany({
        where: { workspaceId, listingId: listing.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 150,
        select: {
          id: true,
          title: true,
          notes: true,
          status: true,
          dueAt: true,
          createdAt: true,
          source: true,
          completedAt: true,
        },
      }),
      prisma.cRMActivity.findMany({
        where: { workspaceId, listingId: listing.id },
        orderBy: { createdAt: "desc" },
        take: 150,
        select: { id: true, type: true, summary: true, createdAt: true, data: true },
      }),
      prisma.activity.findMany({
        where: { workspaceId, listingId: listing.id },
        orderBy: { createdAt: "desc" },
        take: 150,
        select: { id: true, type: true, details: true, createdAt: true },
      }),
      canReadAutomations
        ? prisma.automationRun.findMany({
            where: { workspaceId, listingId: listing.id },
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
          })
        : Promise.resolve([]),
    ]);

    const noteItems: FeedItem[] = notes.map((n) => ({
      id: `note_${n.id}`,
      kind: "note",
      at: safeISO(n.createdAt),
      title: "Note",
      subtitle: n.text,
      meta: { noteId: n.id, taskAt: n.reminderAt ? safeISO(n.reminderAt) : null },
    }));

    const taskItems: FeedItem[] = tasks.map((t) => {
      const isAutopilot = String(t.source || "") === "AUTOPILOT";
      return {
        id: `task_${t.id}`,
        kind: "task",
        at: safeISO(t.dueAt ?? t.createdAt),
        title: t.title || "Task",
        subtitle: t.status ? `Status: ${t.status}` : null,
        meta: {
          taskId: t.id,
          dueAt: t.dueAt ? safeISO(t.dueAt) : null,
          notes: t.notes ?? null,
          source: t.source ?? null,
          autopilot: isAutopilot,
          completedAt: t.completedAt ? safeISO(t.completedAt) : null,
        },
      };
    });

    const crmItems: FeedItem[] = crm.map((c) => ({
      id: `crm_${c.id}`,
      kind: "crm",
      at: safeISO(c.createdAt),
      title: c.summary || c.type || "CRM Activity",
      subtitle: null,
      meta: { crmActivityId: c.id, type: c.type, data: c.data ?? null },
    }));

    const activityItems: FeedItem[] = activity.map((a) => ({
      id: `act_${a.id}`,
      kind: "activity",
      at: safeISO(a.createdAt),
      title: a.type || "Activity",
      subtitle: a.details ?? null,
      meta: { activityId: a.id },
    }));

    const automationItems: FeedItem[] = (runs ?? []).map((r: any) => {
      const steps = (r.steps ?? []).map((s: any) => ({
        id: s.id,
        stepType: s.stepType || "STEP",
        status: normalizeRunStatus(s.status),
        message: s.message ?? "",
        executedAt: s.executedAt ? safeISO(s.executedAt) : null,
        stepIndex: s.stepIndex,
      }));

      const counts = steps.reduce((acc: Record<string, number>, s: any) => {
        const key = s.status || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const status = normalizeRunStatus(r.status);
      const name = r.automation?.name ?? "Automation";

      const subtitle =
        r.message?.trim?.() ||
        (Object.keys(counts).length
          ? `Run ${status} • ${Object.entries(counts)
              .map(([k, v]) => `${v} ${k}`)
              .join(", ")}`
          : `Run ${status}`);

      return {
        id: `auto_run_${r.id}`,
        kind: "activity",
        at: safeISO(r.executedAt),
        title: `Automation: ${name}`,
        subtitle,
        meta: {
          source: "automation",
          runId: r.id,
          automationId: r.automationId,
          automationName: name,
          status,
          executedAt: safeISO(r.executedAt),
          counts,
          steps,
        },
      };
    });

    const items = [...noteItems, ...taskItems, ...crmItems, ...activityItems, ...automationItems].sort(
      (x, y) => new Date(y.at).getTime() - new Date(x.at).getTime()
    );

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("listings/[id]/activity GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load listing activity." },
      { status: 500 }
    );
  }
}