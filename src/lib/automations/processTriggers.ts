// src/lib/automations/processTriggers.ts
import { prisma } from "@/lib/prisma";
import { runAutomation } from "./runAutomation";
import type { AutomationTrigger, AutomationContext } from "./types";

export async function processTriggers(
  trigger: AutomationTrigger,
  context: AutomationContext
) {
  const automations = await prisma.automation.findMany({
    where: {
      userId: context.userId,
      trigger,
      active: true,
    },
    include: { steps: true },
  });

  for (const a of automations) {
    const steps = a.steps?.steps ? (a.steps.steps as any[]) : [];

    await runAutomation(a.id, steps, context);
  }
}