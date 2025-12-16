import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireEntitlement } from "@/lib/entitlements";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json([], { status: 200 });

  const gate = await requireEntitlement(user.id, "AUTOMATIONS_READ");
  if (!gate.ok) return NextResponse.json([], { status: 200 });

  const runs = await prisma.automationRun.findMany({
    where: { automation: { userId: user.id } },
    include: { steps: true },
    orderBy: { executedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(runs);
}
