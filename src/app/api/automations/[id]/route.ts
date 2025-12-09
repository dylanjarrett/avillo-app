import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// -------------------------------
// GET: Single automation with steps + metadata
// -------------------------------
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const automation = await prisma.automation.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      steps: true,
      runs: {
        take: 20,
        orderBy: { executedAt: "desc" },
        include: { steps: true },
      },
    },
  });

  if (!automation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(automation);
}

// -------------------------------
// PUT: Update automation + its step group
// -------------------------------
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name,
    description,
    trigger,
    triggerConfig,
    entryConditions,
    exitConditions,
    schedule,
    active,
    status,
    reEnroll,
    timezone,
    folder,
    steps,
  } = body;

  // Make sure this automation belongs to the user
  const existing = await prisma.automation.findFirst({
    where: { id: params.id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.automation.update({
    where: { id: existing.id },
    data: {
      name,
      description,
      trigger,
      triggerConfig,
      entryConditions,
      exitConditions,
      schedule,
      folder,
      active,
      status,
      reEnroll,
      timezone,
      updatedAt: new Date(),
    },
  });

  if (steps) {
    await prisma.automationStepGroup.upsert({
      where: { automationId: existing.id }, // assumes automationId is unique
      update: { steps },
      create: { automationId: existing.id, steps },
    });
  }

  // Re-fetch full automation with steps + recent runs so UI stays in sync
  const updatedFull = await prisma.automation.findFirst({
    where: { id: existing.id, userId: user.id },
    include: {
      steps: true,
      runs: {
        take: 20,
        orderBy: { executedAt: "desc" },
        include: { steps: true },
      },
    },
  });

  return NextResponse.json(updatedFull);
}

// -------------------------------
// DELETE: Cascade delete automation + logs
// -------------------------------
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.automation.deleteMany({
    where: { id: params.id, userId: user.id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Assuming Prisma schema has ON DELETE CASCADE on related runs / stepGroup
  return NextResponse.json({ success: true });
}