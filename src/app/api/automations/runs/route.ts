import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json([], { status: 200 });

  const runs = await prisma.automationRun.findMany({
    where: { automation: { userId: user.id } },
    include: { steps: true },
    orderBy: { executedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(runs);
}