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
  thenSteps?: AutomationStep[];
  elseSteps?: AutomationStep[];
};

type RunContext = {
  userId: string;
  contactId?: string | null;
  listingId?: string | null;
  trigger: string;
  payload?: any;
};

/* ------------------------------------
 * Condition helpers (unchanged)
 * -----------------------------------*/

type ConditionJoin = "AND" | "OR";

type ConditionConfig = {
  field: string;
  operator: "equals" | "not_equals" | string;
  value: string;
};

type NormalizedIfConfig = {
  join: ConditionJoin;
  conditions: ConditionConfig[];
};

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

function evaluateSingleCondition(
  config: ConditionConfig,
  contact: any | null,
  listing: any | null
): boolean {
  const actual = getConditionFieldValue(config.field, contact, listing);
  if (actual == null) return false;

  if (config.operator === "equals") return actual === config.value;
  if (config.operator === "not_equals") return actual !== config.value;

  return actual === config.value;
}

function normalizeIfConfig(raw: any): NormalizedIfConfig {
  const join: ConditionJoin =
    raw?.join === "OR" || raw?.join === "AND" ? raw.join : "AND";

  if (raw && Array.isArray(raw.conditions)) {
    const conditions: ConditionConfig[] = raw.conditions.map((c: any) => ({
      field: String(c.field ?? ""),
      operator: String(c.operator ?? "equals"),
      value: String(c.value ?? ""),
    }));

    return {
      join,
      conditions: conditions.filter((c) => !!c.field && !!c.value),
    };
  }

  const field = raw?.field as string | undefined;
  const operator = (raw?.operator as string | undefined) ?? "equals";
  const value = raw?.value as string | undefined;

  if (!field || !value) {
    return { join: "AND", conditions: [] };
  }

  return {
    join: "AND",
    conditions: [{ field, operator, value }],
  };
}

function evaluateIfGroup(
  rawConfig: any,
  contact: any | null,
  listing: any | null
): boolean {
  const { join, conditions } = normalizeIfConfig(rawConfig);
  if (!conditions.length) return false;

  const results = conditions.map((c) =>
    evaluateSingleCondition(c, contact, listing)
  );

  return join === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/* ------------------------------------
 * Core runner
 * -----------------------------------*/

export async function runAutomation(
  automationId: string,
  steps: AutomationStep[],
  ctx: RunContext
) {
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

  // --- FIXED FALLBACK LOGIC ---
let toEmail: string | null =
  (contact as any)?.email ??
  (contact as any)?.primaryEmail ??
  null;

let toPhone: string | null =
  (contact as any)?.phone ??
  (contact as any)?.phoneNumber ??
  null;

// If no contact → test mode: send to user's email only
if (!contact) {
  toEmail = user?.email ?? null;
  // Users don’t have phone numbers — do NOT assign user.phone
  toPhone = null;
}

  console.log("Sending automation email to:", toEmail);

  let runStatus: "success" | "failed" = "success";
  let runMessage: string | null = null;

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
            await recordStep({
              stepId: step.id,
              stepType: "TASK",
              status: "success",
              message: step.config?.text ?? "",
            });
            break;
          }

          case "WAIT": {
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
            const result = evaluateIfGroup(step.config, contact, listing);

            await recordStep({
              stepId: step.id,
              stepType: "IF",
              status: "success",
              message: `Condition evaluated to ${
                result ? "true" : "false"
              }.`,
              payload: normalizeIfConfig(step.config),
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