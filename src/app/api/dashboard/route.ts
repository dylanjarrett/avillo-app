// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { dayBoundsForTZ, safeIanaTZ } from "@/lib/time";
import { TaskStatus } from "@prisma/client";
import { whereReadableTask, type VisibilityCtx } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();

    // Keep old behavior: return empty dashboard data if logged out / no workspace
    if (!ctx.ok) {
      return NextResponse.json({ tasksToday: [], overdueCount: 0 });
    }

    // Extra safety: if requireWorkspace ever returns ok=true without ids, fail closed.
    if (!ctx.workspaceId || !ctx.userId) {
      return NextResponse.json({ tasksToday: [], overdueCount: 0 });
    }

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    // ✅ Canonical TZ-aware day bounds
    const url = new URL(req.url);
    const browserTZ = safeIanaTZ(url.searchParams.get("tz"));
    const { todayStart, tomorrowStart } = dayBoundsForTZ(browserTZ);

    const baseWhere = {
      ...whereReadableTask(vctx),
      status: TaskStatus.OPEN,
      deletedAt: null as Date | null,
    };

    const [tasksToday, overdueCount] = await Promise.all([
      prisma.task.findMany({
        where: {
          ...baseWhere,
          // Today = [todayStart, tomorrowStart)
          dueAt: { gte: todayStart, lt: tomorrowStart },
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
          // Only tasks with a due date before todayStart are overdue
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
  } catch (err) {
    console.error("dashboard GET error:", err);
    // Preserve “empty dashboard” behavior even on errors
    return NextResponse.json({ tasksToday: [], overdueCount: 0 });
  }
}