// src/app/api/tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskStatus = "OPEN" | "DONE";

function normalizeStatus(raw: any): TaskStatus | null {
  const v = String(raw ?? "").toUpperCase().trim();
  if (v === "OPEN" || v === "DONE") return v;
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const taskId = params?.id;
    if (!taskId) return NextResponse.json({ error: "Task id is required." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as
      | { status?: TaskStatus | string; restore?: boolean }
      | null;

    const restore = !!body?.restore;

    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspaceId: ctx.workspaceId,
        assignedToUserId: ctx.userId, // “my tasks” guard (same security behavior as before)
      },
      select: {
        id: true,
        deletedAt: true,
        status: true,
        contactId: true,
        listingId: true,
        title: true,
      },
    });

    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (restore) {
      if (!existing.deletedAt) return NextResponse.json({ success: true });

      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });

        if (existing.contactId) {
          await tx.cRMActivity.create({
            data: {
              workspaceId: ctx.workspaceId,
              actorUserId: ctx.userId,

              contactId: existing.contactId,
              type: "task_restored",
              summary: `Task restored: ${existing.title}`,
              data: { taskId: existing.id, listingId: existing.listingId ?? null },
            },
          });
        }
      });

      return NextResponse.json({ success: true });
    }

    const nextStatus = normalizeStatus(body?.status) ?? "DONE";

    if (existing.deletedAt) {
      return NextResponse.json({ error: "This task is deleted. Restore it before updating." }, { status: 400 });
    }

    const completedAt = nextStatus === "DONE" ? new Date() : null;

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data: { status: nextStatus, completedAt },
      });

      if (existing.contactId) {
        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,

            contactId: existing.contactId,
            type: nextStatus === "DONE" ? "task_completed" : "task_reopened",
            summary: nextStatus === "DONE" ? `Task completed: ${existing.title}` : `Task reopened: ${existing.title}`,
            data: {
              taskId: existing.id,
              status: nextStatus,
              listingId: existing.listingId ?? null,
            },
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/tasks/[id] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update task." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const taskId = params?.id;
    if (!taskId) return NextResponse.json({ error: "Task id is required." }, { status: 400 });

    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspaceId: ctx.workspaceId,
        assignedToUserId: ctx.userId,
      },
      select: {
        id: true,
        deletedAt: true,
        contactId: true,
        listingId: true,
        title: true,
      },
    });

    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (existing.deletedAt) return NextResponse.json({ success: true });

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      if (existing.contactId) {
        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,

            contactId: existing.contactId,
            type: "task_deleted",
            summary: `Task deleted: ${existing.title}`,
            data: { taskId: existing.id, listingId: existing.listingId ?? null },
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/tasks/[id] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete task." }, { status: 500 });
  }
}