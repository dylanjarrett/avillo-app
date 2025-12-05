import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// -----------------------------------------------------
// GET → Fetch a single automation
// -----------------------------------------------------
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const automation = await prisma.automation.findFirst({
    where: { id: params.id, userId: user.id },
    include: { steps: true },
  });

  if (!automation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(automation);
}

// -----------------------------------------------------
// PUT → Update automation + its step group
// -----------------------------------------------------
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, trigger, active, steps } = body;

  const updated = await prisma.automation.update({
    where: { id: params.id },
    data: {
      name,
      trigger,
      active,
      updatedAt: new Date(),
    },
  });

  if (steps) {
    await prisma.automationStepGroup.upsert({
      where: { automationId: params.id },
      update: { steps },
      create: { automationId: params.id, steps },
    });
  }

  return NextResponse.json(updated);
}

// -----------------------------------------------------
// DELETE → Remove automation + cascade steps/runs
// -----------------------------------------------------
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.automation.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ success: true });
}