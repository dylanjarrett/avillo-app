import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAutomation } from "@/lib/automations/runAutomation";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { automationId, contactId, listingId } = body ?? {};

  if (!automationId) {
    return NextResponse.json({ error: "Missing automationId" }, { status: 400 });
  }

  const automation = await prisma.automation.findUnique({
    where: { id: automationId, userId: user.id },
    include: { steps: true },
  });

  if (!automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  const steps = automation.steps?.steps ? (automation.steps.steps as any[]) : [];

  // Run engine (logs results via AutomationRun)
  await runAutomation(automation.id, steps, {
    userId: user.id,
    contactId,
    listingId,
    trigger: "MANUAL_RUN",
  });

  return NextResponse.json({ success: true });
}