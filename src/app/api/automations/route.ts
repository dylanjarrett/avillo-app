import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// -----------------------------------------------------
// GET → List all automations for logged-in user
// -----------------------------------------------------
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json([], { status: 200 });

  const automations = await prisma.automation.findMany({
    where: { userId: user.id },
    include: { steps: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(automations);
}

// -----------------------------------------------------
// POST → Create a new automation
// -----------------------------------------------------
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, trigger, active = true, steps = [] } = body;

  const automation = await prisma.automation.create({
    data: {
      userId: user.id,
      name,
      trigger,
      active,
    },
  });

  await prisma.automationStepGroup.create({
    data: {
      automationId: automation.id,
      steps,
    },
  });

  return NextResponse.json(automation);
}