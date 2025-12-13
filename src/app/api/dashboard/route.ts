import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}


export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ tasksToday: [], overdueCount: 0 });

  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ tasksToday: [], overdueCount: 0 });


  const now = new Date();


  const [tasksToday, overdueCount] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId: user.id,
        status: "OPEN",
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
        userId: user.id,
        status: "OPEN",
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
      contact:
        t.contact
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