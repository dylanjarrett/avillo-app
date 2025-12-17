// src/lib/automations/processTriggers.ts
import { prisma } from "@/lib/prisma";
import { runAutomation } from "./runAutomation";
import type { AutomationTrigger, AutomationContext } from "./types";
import { requireEntitlement } from "@/lib/entitlements";

export async function processTriggers(
  trigger: AutomationTrigger,
  context: AutomationContext
) {
  // ✅ Defense-in-depth: if something calls this lib directly, Starter can't run triggers.
  const gate = await requireEntitlement(context.userId, "AUTOMATIONS_TRIGGER");
  if (!gate.ok) return;

  const automations = await prisma.automation.findMany({
    where: {
      userId: context.userId,
      trigger,
      active: true,
    },
    include: { steps: true },
  });

  if (!automations.length) return;

  for (const a of automations) {
    const steps = a.steps?.steps ? (a.steps.steps as any[]) : [];

    await runAutomation(a.id, steps, {
      ...context,
      trigger,
    });
  }
}