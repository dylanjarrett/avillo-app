// src/app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export async function GET() {
  const ctx = await requireWorkspace();

  // Keep old behavior: return empty dashboard data if logged out / no workspace
  if (!ctx.ok) {
    return NextResponse.json({ tasksToday: [], overdueCount: 0 });
  }

  // Extra safety: if requireWorkspace ever returns ok=true without ids, fail closed.
  if (!ctx.workspaceId || !ctx.userId) {
    return NextResponse.json({ tasksToday: [], overdueCount: 0 });
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const baseWhere = {
    workspaceId: ctx.workspaceId,
    assignedToUserId: ctx.userId,
    status: "OPEN" as const,
    deletedAt: null as Date | null, // matches Task.deletedAt DateTime?
  };

  const [tasksToday, overdueCount] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...baseWhere,
        dueAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { dueAt: "asc" },
      take: 20,
      select: {
        id: true,
        title: true,
        dueAt: true,
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),

    prisma.task.count({
      where: {
        ...baseWhere,
        // Only tasks with a due date before today are overdue
        dueAt: { lt: todayStart },
      },
    }),
  ]);

  return NextResponse.json({
    overdueCount,
    tasksToday: tasksToday.map((t) => {
      const first = (t.contact?.firstName ?? "").trim();
      const last = (t.contact?.lastName ?? "").trim();
      const fullName = `${first} ${last}`.trim();

      return {
        id: t.id,
        title: t.title,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        contact: t.contact
          ? {
              id: t.contact.id,
              name: fullName || t.contact.email || "Contact",
            }
          : null,
      };
    }),
  });
}