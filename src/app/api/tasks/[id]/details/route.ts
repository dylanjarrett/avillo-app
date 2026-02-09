// src/app/api/tasks/[id]/details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import type { VisibilityCtx } from "@/lib/visibility";
import {
  VisibilityError,
  whereManageableTask,
  requireReadableContact,
  requireReadableListing,
} from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  contactId?: string | null;
  listingId?: string | null;
};

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function parseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAdminRole(role?: string | null) {
  const r = String(role ?? "").toUpperCase();
  return r === "OWNER" || r === "ADMIN";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId!,
      userId: ctx.userId!,
      isWorkspaceAdmin: isAdminRole(ctx.workspaceRole),
    };

    const taskId = safeId(params?.id);
    if (!taskId) return NextResponse.json({ error: "Task id is required." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

    // ✅ Must be manageable to caller (preserves old behavior)
    const existing = await prisma.task.findFirst({
      where: { id: taskId, ...whereManageableTask(vctx) },
      select: {
        id: true,
        deletedAt: true,
        contactId: true,
        listingId: true,
        title: true,
      },
    });

    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (existing.deletedAt) {
      return NextResponse.json({ error: "This task is deleted. Restore it before editing details." }, { status: 400 });
    }

    const nextTitle = typeof body.title === "string" ? body.title.trim() : undefined;
    if (nextTitle !== undefined && !nextTitle) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }

    const nextNotes =
      body.notes === undefined ? undefined : body.notes === null ? null : String(body.notes).trim() || null;

    const nextDueAt = body.dueAt === undefined ? undefined : parseDate(body.dueAt);

    const nextContactId = body.contactId === undefined ? undefined : safeId(body.contactId);
    const nextListingId = body.listingId === undefined ? undefined : safeId(body.listingId);

    // ✅ References must be READABLE (not just in workspace)
    if (nextContactId !== undefined && nextContactId) {
      await requireReadableContact(prisma, vctx, nextContactId, { id: true });
    }
    if (nextListingId !== undefined && nextListingId) {
      await requireReadableListing(prisma, vctx, nextListingId, { id: true });
    }

    const data: any = {};
    if (nextTitle !== undefined) data.title = nextTitle;
    if (nextNotes !== undefined) data.notes = nextNotes;
    if (nextDueAt !== undefined) data.dueAt = nextDueAt;
    if (nextContactId !== undefined) data.contactId = nextContactId ?? null;
    if (nextListingId !== undefined) data.listingId = nextListingId ?? null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.task.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          title: true,
          notes: true,
          dueAt: true,
          status: true,
          source: true,
          contactId: true,
          listingId: true,
          assignedToUserId: true,
          createdAt: true,
          completedAt: true,
          deletedAt: true,
        },
      });

      if (t.contactId) {
        await tx.cRMActivity.create({
          data: {
            workspaceId: vctx.workspaceId,
            actorUserId: vctx.userId,
            contactId: t.contactId,
            type: "task_updated",
            summary: `Task updated: ${t.title}`,
            data: {
              taskId: t.id,
              listingId: t.listingId ?? null,
              dueAt: t.dueAt ? t.dueAt.toISOString() : null,
              source: t.source,
              assignedToUserId: t.assignedToUserId ?? null,
              changed: Object.keys(data),
            },
          },
        });
      }

      return t;
    });

    return NextResponse.json({
      success: true,
      task: {
        id: updated.id,
        title: updated.title,
        notes: updated.notes ?? "",
        dueAt: updated.dueAt ? updated.dueAt.toISOString() : null,
        status: updated.status,
        source: updated.source,
        contactId: updated.contactId ?? null,
        listingId: updated.listingId ?? null,
        assignedToUserId: updated.assignedToUserId ?? null,
        createdAt: updated.createdAt.toISOString(),
        completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
        deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : null,
      },
    });
  } catch (err: any) {
    if (err instanceof VisibilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("/api/tasks/[id]/details PATCH error:", err);
    return NextResponse.json({ error: "Failed to update task details." }, { status: 500 });
  }
}