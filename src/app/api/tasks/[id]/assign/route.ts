// src/app/api/tasks/[id]/assign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import type { VisibilityCtx } from "@/lib/visibility";
import { whereManageableTask, VisibilityError } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssignBody = {
  assignedToUserId?: string | null;
};

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
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

    const body = (await req.json().catch(() => null)) as AssignBody | null;
    const nextAssigneeId = safeId(body?.assignedToUserId);
    if (!nextAssigneeId) return NextResponse.json({ error: "assignedToUserId is required." }, { status: 400 });

    // Privacy-first: only admins can assign tasks to other users
    if (!vctx.isWorkspaceAdmin && nextAssigneeId !== vctx.userId) {
      return NextResponse.json({ error: "Only admins can assign tasks to another user." }, { status: 403 });
    }

    // Assignee must be active member of the workspace
    const assigneeMembership = await prisma.workspaceUser.findFirst({
      where: {
        workspaceId: vctx.workspaceId,
        userId: nextAssigneeId,
        removedAt: null,
      },
      select: { userId: true },
    });

    if (!assigneeMembership) {
      return NextResponse.json({ error: "Assignee is not an active member of this workspace." }, { status: 404 });
    }

    // ✅ Must be manageable to caller (preserves old behavior)
    const existing = await prisma.task.findFirst({
      where: { id: taskId, ...whereManageableTask(vctx) },
      select: {
        id: true,
        deletedAt: true,
        assignedToUserId: true,
        contactId: true,
        listingId: true,
        title: true,
      },
    });

    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (existing.deletedAt) {
      return NextResponse.json({ error: "This task is deleted. Restore it before reassigning." }, { status: 400 });
    }

    if (existing.assignedToUserId === nextAssigneeId) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data: { assignedToUserId: nextAssigneeId },
      });

      // Timeline log (contact only)
      if (existing.contactId) {
        await tx.cRMActivity.create({
          data: {
            workspaceId: vctx.workspaceId,
            actorUserId: vctx.userId,
            contactId: existing.contactId,
            type: "task_assigned",
            summary: `Task assigned: ${existing.title}`,
            data: {
              taskId: existing.id,
              listingId: existing.listingId ?? null,
              assignedToUserId: nextAssigneeId,
              previousAssignedToUserId: existing.assignedToUserId,
            },
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof VisibilityError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("/api/tasks/[id]/assign PATCH error:", err);
    return NextResponse.json({ error: "Failed to assign task." }, { status: 500 });
  }
}