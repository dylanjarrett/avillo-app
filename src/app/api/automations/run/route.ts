// src/app/api/automations/run/route.ts
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAutomation } from "@/lib/automations/runAutomation";
import type { AutomationStep } from "@/lib/automations/types";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.automationId) {
    return NextResponse.json({ error: "Missing automationId" }, { status: 400 });
  }

  const { automationId, contactId, listingId } = body;

  const automation = await prisma.automation.findUnique({
    where: { id: automationId, userId: user.id },
    select: {
      id: true,
      steps: true,
    },
  });

  if (!automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  const steps: AutomationStep[] = Array.isArray(automation.steps)
    ? automation.steps
    : JSON.parse((automation.steps as any) ?? "[]");

  await runAutomation(
    automation.id,
    steps,
    {
      userId: user.id,
      contactId,
      listingId,
    }
  );

  return NextResponse.json({ success: true });
}