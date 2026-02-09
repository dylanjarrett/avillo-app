// src/app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { dayBoundsForTZ, safeIanaTZ, endOfDayForTZ, parseTaskInstant } from "@/lib/time";
import type { VisibilityCtx } from "@/lib/visibility";
import {
  VisibilityError,
  whereMyTask,
  requireReadableContact,
  requireReadableListing,
} from "@/lib/visibility";

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

function isAdminRole(role?: string | null) {
  const r = String(role ?? "").toUpperCase();
  return r === "OWNER" || r === "ADMIN";
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json({ tasks: [] }, { status: 200 });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId!,
      userId: ctx.userId!,
      isWorkspaceAdmin: isAdminRole(ctx.workspaceRole),
    };

    const url = new URL(req.url);
    const scope = normalizeScope(url.searchParams.get("scope"));
    const status = normalizeStatus(url.searchParams.get("status"));
    const contactId = clampId(url.searchParams.get("contactId"));
    const listingId = clampId(url.searchParams.get("listingId"));
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";

    const browserTZ = safeIanaTZ(url.searchParams.get("tz"));
    const { todayStart, tomorrowStart, in7Start } = dayBoundsForTZ(browserTZ);

    let dueFilter: any = {};
    if (scope === "today") dueFilter = { dueAt: { gte: todayStart, lt: tomorrowStart } };
    else if (scope === "overdue") dueFilter = { dueAt: { lt: todayStart } };
    else if (scope === "week") dueFilter = { dueAt: { gte: tomorrowStart, lt: in7Start } };

    // ✅ Preserve old behavior: "my tasks" = assignedToUserId = me
    const where: any = {
      ...whereMyTask(vctx),
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

    const shaped = await Promise.all(
      tasks.map(async (t) => {
        let contact: any = null;
        let listing: any = null;

        if (t.contactId) {
          try {
            const c = await requireReadableContact(prisma, vctx, t.contactId, {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            });
            const name =
              `${(c.firstName ?? "").trim()} ${(c.lastName ?? "").trim()}`.trim() || c.email || "Contact";
            contact = { id: c.id, name };
          } catch {
            contact = null;
          }
        }

        if (t.listingId) {
          try {
            const l = await requireReadableListing(prisma, vctx, t.listingId, { id: true, address: true });
            listing = { id: l.id, address: l.address ?? "Listing" };
          } catch {
            listing = null;
          }
        }

        return {
          id: t.id,
          title: t.title,
          notes: t.notes ?? "",
          dueAt: t.dueAt ? t.dueAt.toISOString() : null,
          status: t.status,
          source: t.source,
          assignedToUserId: t.assignedToUserId ?? null, // ✅ include for UI correctness
          contact,
          listing,
          createdAt: t.createdAt.toISOString(),
          completedAt: t.completedAt ? t.completedAt.toISOString() : null,
          deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
        };
      })
    );

    return NextResponse.json({ tasks: shaped });
  } catch (err) {
    console.error("/api/tasks GET error:", err);
    return NextResponse.json({ tasks: [] }, { status: 200 });
  }
}

type CreateTaskBody = {
  title?: string;
  notes?: string;
  dueAt?: string | null;
  dueDate?: string | null;
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

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId!,
      userId: ctx.userId!,
      isWorkspaceAdmin: isAdminRole(ctx.workspaceRole),
    };

    const body = (await req.json().catch(() => null)) as CreateTaskBody | null;
    if (!body?.title || !body.title.trim()) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }

    const title = body.title.trim();
    const notes = body.notes?.trim() || null;

    const browserTZ = safeIanaTZ(body.tz);
    const dueAtFromInstant = parseTaskInstant(body.dueAt ?? null, browserTZ);
    const dueAtFromDate = body?.dueDate ? endOfDayForTZ(browserTZ, body.dueDate) : null;
    const dueAt = dueAtFromInstant ?? dueAtFromDate;

    const source = (body.source ?? "MANUAL") as any;

    const assignedToUserId = (body.assignedToUserId ?? vctx.userId) || vctx.userId;

    // Privacy-first: only admins can create tasks for other users
    if (!vctx.isWorkspaceAdmin && assignedToUserId !== vctx.userId) {
      return NextResponse.json({ error: "Only admins can create tasks for another user." }, { status: 403 });
    }

    // Assignee must be active member
    const member = await prisma.workspaceUser.findFirst({
      where: { workspaceId: vctx.workspaceId, userId: assignedToUserId, removedAt: null },
      select: { userId: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Assignee is not an active member of this workspace." }, { status: 404 });
    }

    // ✅ References must be readable
    if (body.contactId) {
      await requireReadableContact(prisma, vctx, body.contactId, { id: true });
    }
    if (body.listingId) {
      await requireReadableListing(prisma, vctx, body.listingId, { id: true });
    }

    const task = await prisma.task.create({
      data: {
        workspaceId: vctx.workspaceId,
        createdByUserId: vctx.userId,
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
          workspaceId: vctx.workspaceId,
          actorUserId: vctx.userId,
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
  } catch (err: any) {
    if (err instanceof VisibilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("/api/tasks POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t create this task. Try again, or email support@avillo.io." },
      { status: 500 }
    );
  }
}