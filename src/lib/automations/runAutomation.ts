// src/lib/automations/runAutomation.ts
import { prisma } from "@/lib/prisma";
import {
  sendAutomationEmail,
  sendAutomationSms,
} from "@/lib/automations/messaging";

export type StepType = "SMS" | "EMAIL" | "TASK" | "WAIT" | "IF";

export type AutomationStep = {
  id?: string;
  type: StepType;
  config: any;
  thenSteps?: AutomationStep[]; // used only when type === "IF"
  elseSteps?: AutomationStep[];
};

type RunContext = {
  userId: string;
  contactId?: string | null;
  listingId?: string | null;
  trigger: string;
  payload?: any;
};

// -----------------------------
// Helpers
// -----------------------------

// Very simple {{var}} templating
function renderTemplate(template: string, vars: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = vars[key];
    return typeof val === "string" ? val : "";
  });
}

function getConditionFieldValue(
  field: string,
  contact: any | null,
  listing: any | null
): string | null {
  switch (field) {
    case "contact.stage":
      return contact?.stage ?? null;
    case "contact.type":
      return contact?.type ?? null;
    case "contact.source":
      return contact?.source ?? null;
    case "listing.status":
      return listing?.status ?? null;
    default:
      return null;
  }
}

function evaluateCondition(
  config: { field: string; operator: string; value: string },
  contact: any | null,
  listing: any | null
): boolean {
  const actual = getConditionFieldValue(config.field, contact, listing);
  if (actual == null) return false;

  if (config.operator === "equals") return actual === config.value;
  if (config.operator === "not_equals") return actual !== config.value;

  return false;
}

// -----------------------------
// Core runner
// -----------------------------

export async function runAutomation(
  automationId: string,
  steps: AutomationStep[],
  ctx: RunContext
) {
  // Load user + contact + listing for merge vars
  const [user, contact, listing] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId } }),
    ctx.contactId
      ? prisma.contact.findFirst({
          where: { id: ctx.contactId, userId: ctx.userId },
        })
      : Promise.resolve(null),
    ctx.listingId
      ? prisma.listing.findFirst({
          where: { id: ctx.listingId, userId: ctx.userId },
        })
      : Promise.resolve(null),
  ]);

  const firstName =
    (contact as any)?.firstName ??
    (contact as any)?.name?.split(" ")[0] ??
    "";
  const agentName = user?.name ?? "";
  const propertyAddress =
    (listing as any)?.address ??
    (listing as any)?.fullAddress ??
    (listing as any)?.streetAddress ??
    "";

  const templateVars: Record<string, string> = {
    firstName,
    agentName,
    propertyAddress,
  };

  const toEmail =
    (contact as any)?.email ??
    (contact as any)?.primaryEmail ??
    user?.email ??
    null;

  const toPhone =
    (contact as any)?.phone ??
    (contact as any)?.phoneNumber ??
    (contact as any)?.mobile ??
    null;

  let runStatus: "success" | "failed" = "success";
  let runMessage: string | null = null;

  // Create the AutomationRun row
  const run = await prisma.automationRun.create({
    data: {
      automationId,
      contactId: ctx.contactId ?? null,
      listingId: ctx.listingId ?? null,
      trigger: ctx.trigger,
      triggerPayload: ctx.payload ?? {},
      status: "running",
    },
  });

  let stepIndex = 0;

  const recordStep = async (data: {
    stepId?: string;
    stepType: StepType;
    status: string;
    message?: string | null;
    payload?: any;
  }) => {
    await prisma.automationRunStep.create({
      data: {
        runId: run.id,
        stepId: data.stepId ?? null,
        stepIndex: stepIndex++,
        stepType: data.stepType,
        status: data.status,
        message: data.message ?? null,
        payload: data.payload ?? {},
      },
    });
  };

  const executeSteps = async (stepsToRun: AutomationStep[]) => {
    for (const step of stepsToRun) {
      try {
        switch (step.type) {
          case "SMS": {
            if (!toPhone) {
              await recordStep({
                stepId: step.id,
                stepType: "SMS",
                status: "error",
                message: "No phone number on contact.",
              });
              runStatus = "failed";
              runMessage = "Missing phone number for SMS step.";
              return;
            }

            const body = renderTemplate(step.config?.text ?? "", templateVars);
            await sendAutomationSms({ to: toPhone, body });

            await recordStep({
              stepId: step.id,
              stepType: "SMS",
              status: "success",
              payload: { to: toPhone, body },
            });
            break;
          }

          case "EMAIL": {
            if (!toEmail) {
              await recordStep({
                stepId: step.id,
                stepType: "EMAIL",
                status: "error",
                message: "No email on contact.",
              });
              runStatus = "failed";
              runMessage = "Missing email for EMAIL step.";
              return;
            }

            const subject = renderTemplate(
              step.config?.subject ?? "",
              templateVars
            );
            const rawBody = step.config?.body ?? "";
            const html = renderTemplate(
              rawBody.replace(/\n/g, "<br />"),
              templateVars
            );

            await sendAutomationEmail({
              to: toEmail,
              subject,
              html,
            });

            await recordStep({
              stepId: step.id,
              stepType: "EMAIL",
              status: "success",
              payload: { to: toEmail, subject },
            });
            break;
          }

          case "TASK": {
            // TODO: later, persist to a Task table. For now just log it.
            await recordStep({
              stepId: step.id,
              stepType: "TASK",
              status: "success",
              message: step.config?.text ?? "",
            });
            break;
          }

          case "WAIT": {
            // No real delay yet; just log intention.
            const hours = step.config?.hours ?? null;
            await recordStep({
              stepId: step.id,
              stepType: "WAIT",
              status: "success",
              message: hours
                ? `Logical wait of ${hours} hours (no runtime delay in test mode).`
                : "Wait step recorded.",
              payload: { hours },
            });
            break;
          }

          case "IF": {
            const cond = step.config as {
              field: string;
              operator: string;
              value: string;
            };

            const result = evaluateCondition(cond, contact, listing);

            await recordStep({
              stepId: step.id,
              stepType: "IF",
              status: "success",
              message: `Condition evaluated to ${result ? "true" : "false"}.`,
              payload: cond,
            });

            const branchSteps = result
              ? step.thenSteps ?? []
              : step.elseSteps ?? [];

            if (branchSteps.length > 0) {
              await executeSteps(branchSteps);
            }
            break;
          }
        }
      } catch (err: any) {
        console.error("[runAutomation] Step error", err);
        runStatus = "failed";
        runMessage =
          err?.message ?? `Automation step of type ${step.type} failed.`;

        await recordStep({
          stepId: step.id,
          stepType: step.type,
          status: "error",
          message: runMessage,
        });

        return;
      }
    }
  };

  await executeSteps(steps);

  await prisma.automationRun.update({
    where: { id: run.id },
    data: {
      status: runStatus,
      message: runMessage,
    },
  });
}