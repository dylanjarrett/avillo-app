import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireEntitlement } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

// GET → all automations for logged-in user (Starter OK: read-only)
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

// POST → create a new automation (Pro required)
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireEntitlement(user.id, "AUTOMATIONS_WRITE");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const body = await req.json();
  const {
    name,
    description,
    trigger,
    triggerConfig = {},
    entryConditions = {},
    exitConditions = {},
    schedule = {},
    active = true,
    status = "draft",
    reEnroll = true,
    timezone,
    folder,
    steps = [],
  } = body;

  const automation = await prisma.automation.create({
    data: {
      userId: user.id,
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
    },
  });

  await prisma.automationStepGroup.create({
    data: { automationId: automation.id, steps },
  });

  const full = await prisma.automation.findFirst({
    where: { id: automation.id, userId: user.id },
    include: { steps: true },
  });

  return NextResponse.json(full);
}