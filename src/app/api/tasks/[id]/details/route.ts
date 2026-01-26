//api/tasks/[id]/details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/tasks/:id/details
 * Body (any subset):
 *  {
 *    title?: string;
 *    notes?: string | null;
 *    dueAt?: string | null;        // ISO string or null
 *    contactId?: string | null;
 *    listingId?: string | null;
 *  }
 *
 * Rules:
 * - Caller must be in workspace (requireWorkspace)
 * - Preserve "my tasks" behavior:
 *    - Non-admins can only edit tasks assigned to them
 *    - Admins/Owners can edit any task in workspace
 * - Prevent editing deleted tasks (must restore first)
 * - Validate contact/listing belong to workspace if provided
 * - Optional: log CRMActivity if task has contactId (task_updated)
 */

type Body = {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  contactId?: string | null;
  listingId?: string | null;
};

function isAdminRole(role?: string | null) {
  const r = String(role ?? "").toUpperCase();
  return r === "OWNER" || r === "ADMIN";
}

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function parseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const taskId = safeId(params?.id);
    if (!taskId) return NextResponse.json({ error: "Task id is required." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

    const admin = isAdminRole(ctx.workspaceRole);

    // Find existing task (preserve your "my tasks" security model)
    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspaceId: ctx.workspaceId!,
        ...(admin ? {} : { assignedToUserId: ctx.userId! }),
      },
      select: {
        id: true,
        deletedAt: true,
        contactId: true,
        listingId: true,
        title: true,
        notes: true,
        dueAt: true,
        source: true,
      },
    });

    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "This task is deleted. Restore it before editing details." },
        { status: 400 }
      );
    }

    // Normalize inputs (only include fields that are provided)
    const nextTitle = typeof body.title === "string" ? body.title.trim() : undefined;
    if (nextTitle !== undefined && !nextTitle) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }

    const nextNotes =
      body.notes === undefined ? undefined : body.notes === null ? null : String(body.notes).trim() || null;

    const nextDueAt = body.dueAt === undefined ? undefined : parseDate(body.dueAt);

    const nextContactId = body.contactId === undefined ? undefined : safeId(body.contactId);
    const nextListingId = body.listingId === undefined ? undefined : safeId(body.listingId);

    // Validate referenced entities are in workspace if provided
    if (nextContactId !== undefined && nextContactId) {
      const c = await prisma.contact.findFirst({
        where: { id: nextContactId, workspaceId: ctx.workspaceId! },
        select: { id: true },
      });
      if (!c) return NextResponse.json({ error: "Contact not found in workspace." }, { status: 404 });
    }

    if (nextListingId !== undefined && nextListingId) {
      const l = await prisma.listing.findFirst({
        where: { id: nextListingId, workspaceId: ctx.workspaceId! },
        select: { id: true },
      });
      if (!l) return NextResponse.json({ error: "Listing not found in workspace." }, { status: 404 });
    }

    // Build Prisma update data (only touched fields)
    const data: any = {};
    if (nextTitle !== undefined) data.title = nextTitle;
    if (nextNotes !== undefined) data.notes = nextNotes;
    if (nextDueAt !== undefined) data.dueAt = nextDueAt;
    if (nextContactId !== undefined) data.contactId = nextContactId ?? null;
    if (nextListingId !== undefined) data.listingId = nextListingId ?? null;

    // No-op guard
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

      // Timeline log (only if task has a contact AFTER update)
      if (t.contactId) {
        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId!,
            actorUserId: ctx.userId!,
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
  } catch (err) {
    console.error("/api/tasks/[id]/details PATCH error:", err);
    return NextResponse.json({ error: "Failed to update task details." }, { status: 500 });
  }
}