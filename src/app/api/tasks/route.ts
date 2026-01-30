// src/app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { dayBoundsForTZ, safeIanaTZ, endOfDayForTZ, parseTaskInstant } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskStatus = "OPEN" | "DONE";
type TaskScope = "today" | "overdue" | "week" | "all";

function normalizeStatus(raw: any): TaskStatus {
  const v = String(raw ?? "").toUpperCase().trim();
  return v === "DONE" ? "DONE" : "OPEN";
}

function normalizeScope(raw: any): TaskScope {
  const v = String(raw ?? "").toLowerCase().trim();
  if (v === "today" || v === "overdue" || v === "week" || v === "all") return v;
  return "today";
}

function clampId(v: string | null) {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > 128 ? s.slice(0, 128) : s;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();

    // Keep prior behavior: dashboard may call while logged out → return empty list
    if (!ctx.ok) return NextResponse.json({ tasks: [] }, { status: 200 });

    const url = new URL(req.url);
    const scope = normalizeScope(url.searchParams.get("scope"));
    const status = normalizeStatus(url.searchParams.get("status"));
    const contactId = clampId(url.searchParams.get("contactId"));
    const listingId = clampId(url.searchParams.get("listingId"));
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";

    // ✅ TZ-aware boundaries
    const browserTZ = safeIanaTZ(url.searchParams.get("tz"));
    const { todayStart, tomorrowStart, in7Start } = dayBoundsForTZ(browserTZ);

    let dueFilter: any = {};
    if (scope === "today") {
      dueFilter = { dueAt: { gte: todayStart, lt: tomorrowStart } };
    } else if (scope === "overdue") {
      dueFilter = { dueAt: { lt: todayStart } };
    } else if (scope === "week") {
      dueFilter = { dueAt: { gte: tomorrowStart, lt: in7Start } };
    }

    const where: any = {
      workspaceId: ctx.workspaceId,
      assignedToUserId: ctx.userId,
      status,
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(contactId ? { contactId } : {}),
      ...(listingId ? { listingId } : {}),
      ...(scope === "all" ? {} : dueFilter),
    };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        listing: { select: { id: true, address: true } },
      },
    });

    const shaped = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes ?? "",
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      status: t.status,
      source: t.source,
      contact: t.contact
        ? {
            id: t.contact.id,
            name:
              `${(t.contact.firstName ?? "").trim()} ${(t.contact.lastName ?? "").trim()}`.trim() ||
              t.contact.email ||
              "Contact",
          }
        : null,
      listing: t.listing ? { id: t.listing.id, address: t.listing.address ?? "Listing" } : null,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
    }));

    return NextResponse.json({ tasks: shaped });
  } catch (err) {
    console.error("/api/tasks GET error:", err);
    return NextResponse.json({ tasks: [] }, { status: 200 });
  }
}

type CreateTaskBody = {
  title?: string;
  notes?: string;

  // datetime (preferred)
  dueAt?: string | null;

  // date-only ("YYYY-MM-DD") -> end-of-day in tz
  dueDate?: string | null;

  // timezone (IANA)
  tz?: string | null;

  contactId?: string | null;
  listingId?: string | null;
  source?: "PEOPLE_NOTE" | "AUTOPILOT" | "MANUAL";
  assignedToUserId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const body = (await req.json().catch(() => null)) as CreateTaskBody | null;
    if (!body?.title || !body.title.trim()) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }

    const title = body.title.trim();
    const notes = body.notes?.trim() || null;

    // ✅ Normalize tz
    const browserTZ = safeIanaTZ(body.tz);

    // ✅ Unified dueAt parsing (minute-stable)
    const dueAtFromInstant = parseTaskInstant(body.dueAt ?? null, browserTZ);
    const dueAtFromDate = body?.dueDate ? endOfDayForTZ(browserTZ, body.dueDate) : null;

    const dueAt = dueAtFromInstant ?? dueAtFromDate;

    // Validate referenced entities are in workspace
    if (body.contactId) {
      const c = await prisma.contact.findFirst({
        where: { id: body.contactId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!c) return NextResponse.json({ error: "Contact not found in workspace." }, { status: 404 });
    }

    if (body.listingId) {
      const l = await prisma.listing.findFirst({
        where: { id: body.listingId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!l) return NextResponse.json({ error: "Listing not found in workspace." }, { status: 404 });
    }

    const source = (body.source ?? "MANUAL") as any;
    const assignedToUserId = (body.assignedToUserId ?? ctx.userId) || ctx.userId;

    const task = await prisma.task.create({
      data: {
        workspaceId: ctx.workspaceId,
        createdByUserId: ctx.userId,
        assignedToUserId,
        contactId: body.contactId ?? null,
        listingId: body.listingId ?? null,
        title,
        notes,
        dueAt,
        source,
        status: "OPEN",
      },
    });

    if (task.contactId) {
      await prisma.cRMActivity.create({
        data: {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          contactId: task.contactId,
          type: "task_created",
          summary: `Task created: ${task.title}`,
          data: {
            source: task.source,
            taskId: task.id,
            title: task.title,
            dueAt: task.dueAt ? task.dueAt.toISOString() : null,
            listingId: task.listingId ?? null,
            assignedToUserId,
            tz: browserTZ,
            dueDate: body.dueDate ?? null,
          },
        },
      });
    }

    return NextResponse.json({
      task: {
        id: task.id,
        title: task.title,
        notes: task.notes ?? "",
        dueAt: task.dueAt ? task.dueAt.toISOString() : null,
        status: task.status,
        source: task.source,
        createdAt: task.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("/api/tasks POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t create this task. Try again, or email support@avillo.io." },
      { status: 500 }
    );
  }
}