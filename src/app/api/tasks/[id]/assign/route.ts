//src/app/api/tasks/[id]/assign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/tasks/:id/assign
 * Body:
 *  {
 *    assignedToUserId: string; // required
 *  }
 *
 * Rules:
 * - Caller must be in workspace (requireWorkspace)
 * - New assignee must be an active workspace member (removedAt: null)
 * - Default security preserves your existing behavior:
 *    - Non-admins can only reassign tasks that are currently assigned to them
 *    - Admins/Owners can reassign any task in workspace
 * - Prevent assigning deleted tasks
 * - Logs CRMActivity if task has contactId (task_assigned)
 */

type AssignBody = {
  assignedToUserId?: string | null;
};

function isAdminRole(role?: string | null) {
  const r = String(role ?? "").toUpperCase();
  return r === "OWNER" || r === "ADMIN";
}

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const taskId = safeId(params?.id);
    if (!taskId) return NextResponse.json({ error: "Task id is required." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as AssignBody | null;
    const nextAssigneeId = safeId(body?.assignedToUserId);
    if (!nextAssigneeId) return NextResponse.json({ error: "assignedToUserId is required." }, { status: 400 });

    const admin = isAdminRole(ctx.workspaceRole);

    // Ensure assignee is an active member of the same workspace
    const assigneeMembership = await prisma.workspaceUser.findFirst({
      where: {
        workspaceId: ctx.workspaceId!,
        userId: nextAssigneeId,
        removedAt: null,
      },
      select: { userId: true },
    });

    if (!assigneeMembership) {
      return NextResponse.json({ error: "Assignee is not an active member of this workspace." }, { status: 404 });
    }

    // Preserve current behavior: non-admins can only assign tasks currently assigned to them.
    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        workspaceId: ctx.workspaceId!,
        ...(admin ? {} : { assignedToUserId: ctx.userId! }),
      },
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

      // Optional timeline log (contact only)
      if (existing.contactId) {
        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId!,
            actorUserId: ctx.userId!,

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
  } catch (err) {
    console.error("/api/tasks/[id]/assign PATCH error:", err);
    return NextResponse.json({ error: "Failed to assign task." }, { status: 500 });
  }
}
