import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function normalizeStatus(v: any) {
  const s = String(v || "").toLowerCase();
  if (s.includes("success")) return "success";
  if (s.includes("fail")) return "failed";
  if (s.includes("skip")) return "skipped";
  if (s.includes("running")) return "running";
  return s || "unknown";
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ items: [], tasks: [] });

    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ items: [], tasks: [] });

    const gate = await requireEntitlement(user.id, "AUTOMATIONS_READ");
    if (!gate.ok) return NextResponse.json({ items: [], tasks: [] });

    const url = new URL(req.url);
    const contactId = url.searchParams.get("contactId");
    if (!contactId) return NextResponse.json({ items: [], tasks: [] });

    const runs = await prisma.automationRun.findMany({
      where: {
        contactId,
        automation: { userId: user.id },
      },
      orderBy: { executedAt: "desc" },
      take: 15,
      include: {
        automation: { select: { id: true, name: true } },
        steps: {
          orderBy: { executedAt: "desc" },
          take: 30,
          select: {
            id: true,
            stepType: true,
            status: true,
            message: true,
            executedAt: true,
            stepIndex: true,
          },
        },
      },
    });

    const tasks = await prisma.task.findMany({
      where: { userId: user.id, contactId, source: "AUTOPILOT" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, title: true, dueAt: true, status: true, createdAt: true },
    });

    const items = runs.map((r) => {
      const steps = (r.steps ?? []).map((s) => ({
        id: s.id,
        stepType: s.stepType || "STEP",
        status: normalizeStatus(s.status),
        message: s.message ?? "",
        executedAt: s.executedAt.toISOString(),
        stepIndex: s.stepIndex,
      }));

      const counts = steps.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        runId: r.id,
        automationId: r.automationId,
        automationName: r.automation?.name ?? "Automation",
        status: normalizeStatus(r.status),
        message: r.message ?? "",
        executedAt: r.executedAt.toISOString(),
        steps,
        counts,
      };
    });

    return NextResponse.json({
      items,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("/api/autopilot/activity GET error:", err);
    return NextResponse.json({ items: [], tasks: [] }, { status: 200 });
  }
}