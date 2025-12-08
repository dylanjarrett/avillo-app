// src/lib/automations/runAutomation.ts
import { prisma } from "@/lib/prisma";
import type { AutomationStep, AutomationContext, AutomationStepIF } from "./types";
import { evaluateCondition } from "./evaluateCondition";

export async function logStep(
  runId: string,
  step: AutomationStep,
  index: number,
  status: "SUCCESS" | "FAILED" | "SKIPPED",
  message?: string,
  payload?: any
) {
  await prisma.automationRunStep.create({
    data: {
      runId,
      stepId: step.id ?? null,
      stepIndex: index,
      stepType: step.type,
      status,
      message,
      payload,
    },
  });
}

async function executeStep(
  runId: string,
  step: AutomationStep,
  index: number,
  context: AutomationContext
) {
  try {
    // ************** IF BLOCK — branching **************
    if (step.type === "IF") {
      const cfg = (step as AutomationStepIF).config;

      const result = await evaluateCondition(cfg.condition, context);

      // Log IF decision
      await logStep(runId, step, index, "SUCCESS", result ? "THEN branch" : "ELSE branch", {
        evaluated: result,
      });

      const branch = result ? cfg.then : cfg.else ?? [];

      // Execute branch steps recursively
      for (let i = 0; i < branch.length; i++) {
        await executeStep(runId, branch[i], index + i + 1, context);
      }

      return;
    }

    // ************** SMS **************
    if (step.type === "SEND_SMS") {
      console.log("📱 SMS:", step.config.text);
      await logStep(runId, step, index, "SUCCESS", "SMS sent", step.config);
      return;
    }

    // ************** EMAIL **************
    if (step.type === "SEND_EMAIL") {
      console.log("📧 EMAIL:", step.config.subject);
      await logStep(runId, step, index, "SUCCESS", "Email sent", step.config);
      return;
    }

    // ************** UPDATE CONTACT STAGE **************
    if (step.type === "UPDATE_CONTACT_STAGE" && context.contactId) {
      await prisma.contact.update({
        where: { id: context.contactId },
        data: { stage: step.config.stage },
      });

      await logStep(runId, step, index, "SUCCESS", "Stage updated", step.config);
      return;
    }

    // ************** TASK CREATION **************
    if (step.type === "TASK") {
      await prisma.cRMActivity.create({
        data: {
          userId: context.userId,
          contactId: context.contactId ?? null,
          type: "task",
          summary: step.config.text,
          data: {},
        },
      });

      await logStep(runId, step, index, "SUCCESS", "Task created", step.config);
      return;
    }

    // ************** WAIT **************
    if (step.type === "WAIT") {
      await new Promise((resolve) => setTimeout(resolve, step.config.hours * 3600_000));

      await logStep(runId, step, index, "SUCCESS", "Wait complete", step.config);
      return;
    }

    // ************** UNKNOWN **************
    await logStep(runId, step, index, "SKIPPED", "Unknown step type");
  } catch (err: any) {
    await logStep(runId, step, index, "FAILED", err.message, { error: err });
    throw err;
  }
}

export async function runAutomation(
  automationId: string,
  steps: AutomationStep[],
  context: AutomationContext
) {
  // Create run entry
  const run = await prisma.automationRun.create({
    data: {
      automationId,
      contactId: context.contactId,
      listingId: context.listingId,
      status: "RUNNING",
    },
  });

  try {
    for (let i = 0; i < steps.length; i++) {
      await executeStep(run.id, steps[i], i, context);
    }

    await prisma.automationRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", executedAt: new Date() },
    });
  } catch (err: any) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", message: err.message ?? "Unknown error" },
    });
  }
}