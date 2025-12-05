// src/lib/automations/processTriggers.ts

import { prisma } from "@/lib/prisma";
import { runAutomation } from "./runAutomation";
import type { AutomationTrigger, AutomationContext } from "./types";

export async function processTriggers(
  trigger: AutomationTrigger,
  context: AutomationContext
) {
  // Load all automations for that user matching trigger
  const automations = await prisma.automation.findMany({
    where: {
      userId: context.userId,
      trigger,
      active: true,
    },
    include: {
      steps: true,
    },
  });

  if (automations.length === 0) return;

  for (const automation of automations) {
    const stepGroup = automation.steps;

    if (!stepGroup?.steps) continue;

    const steps = stepGroup.steps as any[];

    runAutomation(automation.id, steps, context);
  }
}
