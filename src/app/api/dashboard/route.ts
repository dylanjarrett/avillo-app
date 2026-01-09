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

  const now = new Date();

  const baseWhere = {
    workspaceId: ctx.workspaceId,
    assignedToUserId: ctx.userId,
    status: "OPEN" as const,
    deletedAt: null as any, // if your Prisma type is nullable Date, this is fine without `as any`
  };

  const [tasksToday, overdueCount] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...baseWhere,
        dueAt: { gte: startOfDay(now), lte: endOfDay(now) },
      },
      orderBy: { dueAt: "asc" },
      take: 20,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.task.count({
      where: {
        ...baseWhere,
        dueAt: { lt: startOfDay(now) },
      },
    }),
  ]);

  return NextResponse.json({
    overdueCount,
    tasksToday: tasksToday.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      contact: t.contact
        ? {
            id: t.contact.id,
            name:
              `${(t.contact.firstName ?? "").trim()} ${(t.contact.lastName ?? "").trim()}`.trim() ||
              t.contact.email ||
              "Contact",
          }
        : null,
    })),
  });
}