import { prisma } from "@/lib/prisma";
import { sendAutomationEmail, sendAutomationSms } from "@/lib/automations/messaging";
import { createAutopilotTask } from "@/lib/tasks/createAutopilotTask";
import { requireEntitlement } from "@/lib/entitlements";

/* ------------------------------------
 * Types
 * -----------------------------------*/

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

async function canRunAutomations(userId: string) {
  const gate = await requireEntitlement(userId, "AUTOMATIONS_RUN");
  return gate.ok;
}

/* ------------------------------------
 * IF / Condition helpers
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

function renderTemplate(template: string, vars: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = vars[key];
    return typeof val === "string" ? val : "";
  });
}

function getConditionFieldValue(field: string, contact: any | null, listing: any | null): string | null {
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

function evaluateSingleCondition(config: ConditionConfig, contact: any | null, listing: any | null): boolean {
  const actual = getConditionFieldValue(config.field, contact, listing);
  if (actual == null) return false;

  if (config.operator === "equals") return actual === config.value;
  if (config.operator === "not_equals") return actual !== config.value;

  return actual === config.value;
}

function normalizeIfConfig(raw: any): NormalizedIfConfig {
  const join: ConditionJoin = raw?.join === "OR" || raw?.join === "AND" ? raw.join : "AND";

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

  if (!raw?.field || !raw?.value) {
    return { join: "AND", conditions: [] };
  }

  return {
    join: "AND",
    conditions: [
      {
        field: String(raw.field),
        operator: String(raw.operator ?? "equals"),
        value: String(raw.value),
      },
    ],
  };
}

function evaluateIfGroup(rawConfig: any, contact: any | null, listing: any | null): boolean {
  const { join, conditions } = normalizeIfConfig(rawConfig);
  if (!conditions.length) return false;

  const results = conditions.map((c) => evaluateSingleCondition(c, contact, listing));
  return join === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/* ------------------------------------
 * Timing helpers
 * -----------------------------------*/

function parseDueAt(raw: any): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeExplicitDueAtFromTaskConfig(config: any, base: Date): Date | null {
  const direct =
    config?.dueAt ??
    config?.taskAt ??
    config?.reminderAt ??
    config?.date ??
    config?.datetime ??
    null;

  const parsed = parseDueAt(direct);
  if (parsed) return parsed;

  const minutes = Number(config?.minutes ?? config?.dueInMinutes ?? 0);
  const hours = Number(config?.hours ?? config?.dueInHours ?? 0);
  const days = Number(config?.days ?? config?.dueInDays ?? 0);

  if (!minutes && !hours && !days) return null;

  const d = new Date(base);
  d.setMinutes(d.getMinutes() + minutes + hours * 60);
  d.setDate(d.getDate() + days);
  return d;
}

type WaitUnit = "hours" | "days" | "weeks" | "months";

function normalizeWait(config: any): { amount: number; unit: WaitUnit } | null {
  const amountRaw = config?.amount ?? config?.value ?? null;
  const unitRaw = String(config?.unit ?? "").toLowerCase().trim();
  const amount = Number(amountRaw ?? 0);

  const unit: WaitUnit | null =
    unitRaw === "hours" || unitRaw === "days" || unitRaw === "weeks" || unitRaw === "months"
      ? (unitRaw as WaitUnit)
      : null;

  if (unit && Number.isFinite(amount) && amount > 0) {
    return { amount, unit };
  }

  const legacyHours = Number(config?.hours ?? 0);
  if (Number.isFinite(legacyHours) && legacyHours > 0) {
    return { amount: legacyHours, unit: "hours" };
  }

  const legacyDays = Number(config?.days ?? 0);
  if (Number.isFinite(legacyDays) && legacyDays > 0) {
    return { amount: legacyDays, unit: "days" };
  }

  return null;
}

function addToDate(base: Date, amount: number, unit: WaitUnit): Date {
  const d = new Date(base);

  if (unit === "hours") {
    d.setTime(d.getTime() + amount * 60 * 60 * 1000);
    return d;
  }

  if (unit === "days") {
    d.setDate(d.getDate() + amount);
    return d;
  }

  if (unit === "weeks") {
    d.setDate(d.getDate() + amount * 7);
    return d;
  }

  d.setMonth(d.getMonth() + amount);
  return d;
}

/* ------------------------------------
 * Core runner
 * -----------------------------------*/

export async function runAutomation(automationId: string, steps: AutomationStep[], ctx: RunContext) {
  // ✅ Pre-flight: if user is not entitled (ex: downgraded), bail out silently.
  if (!(await canRunAutomations(ctx.userId))) return;

  const [user, contact, listing] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId } }),
    ctx.contactId
      ? prisma.contact.findFirst({ where: { id: ctx.contactId, userId: ctx.userId } })
      : Promise.resolve(null),
    ctx.listingId
      ? prisma.listing.findFirst({ where: { id: ctx.listingId, userId: ctx.userId } })
      : Promise.resolve(null),
  ]);

  const templateVars: Record<string, string> = {
    firstName: contact?.firstName ?? (contact as any)?.name?.split(" ")[0] ?? "",
    agentName: user?.name ?? "",
    propertyAddress: (listing as any)?.address ?? (listing as any)?.fullAddress ?? (listing as any)?.streetAddress ?? "",
  };

  let toEmail: string | null = (contact as any)?.email ?? (contact as any)?.primaryEmail ?? null;
  let toPhone: string | null = (contact as any)?.phone ?? (contact as any)?.phoneNumber ?? null;

  // Test mode: if no contact, send emails to the user only
  if (!contact) {
    toEmail = user?.email ?? null;
    toPhone = null;
  }

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

  let cursorTime = run.executedAt ?? new Date();

  const stopForDowngrade = async (stepType: StepType) => {
    await recordStep({
      stepType,
      status: "skipped",
      message: "Skipped: plan no longer allows automations.",
    });
    runStatus = "failed";
    runMessage = "Automation stopped due to plan downgrade.";
  };

  const executeSteps = async (stepsToRun: AutomationStep[]) => {
    for (const step of stepsToRun) {
      try {
        switch (step.type) {
          case "SMS": {
            if (!toPhone) throw new Error("No phone number on contact.");

            if (!(await canRunAutomations(ctx.userId))) {
              await stopForDowngrade("SMS");
              return;
            }

            const body = renderTemplate(step.config?.text ?? "", templateVars);
            await sendAutomationSms({ to: toPhone, body });

            await recordStep({
              stepId: step.id,
              stepType: "SMS",
              status: "success",
              payload: { to: toPhone },
            });
            break;
          }

          case "EMAIL": {
            if (!toEmail) throw new Error("No email on contact.");

            if (!(await canRunAutomations(ctx.userId))) {
              await stopForDowngrade("EMAIL");
              return;
            }

            const subject = renderTemplate(step.config?.subject ?? "", templateVars);
            const html = renderTemplate((step.config?.body ?? "").replace(/\n/g, "<br />"), templateVars);

            await sendAutomationEmail({ to: toEmail, subject, html });

            await recordStep({
              stepId: step.id,
              stepType: "EMAIL",
              status: "success",
              payload: { to: toEmail, subject },
            });
            break;
          }

          case "WAIT": {
            const wait = normalizeWait(step.config);
            const before = cursorTime;

            if (wait) {
              cursorTime = addToDate(cursorTime, wait.amount, wait.unit);

              await recordStep({
                stepId: step.id,
                stepType: "WAIT",
                status: "success",
                message: `Advanced time by ${wait.amount} ${wait.unit}.`,
                payload: {
                  ...step.config,
                  cursorBefore: before.toISOString(),
                  cursorAfter: cursorTime.toISOString(),
                },
              });
            } else {
              await recordStep({
                stepId: step.id,
                stepType: "WAIT",
                status: "success",
                message: "Wait recorded (no timing applied — missing amount/unit).",
                payload: {
                  ...step.config,
                  cursorAt: cursorTime.toISOString(),
                },
              });
            }
            break;
          }

          case "TASK": {
            const title =
              step.config?.title ??
              step.config?.taskTitle ??
              step.config?.name ??
              step.config?.text ??
              "Task";

            const notes = step.config?.notes ?? step.config?.description ?? "";
            const explicitDueAt = computeExplicitDueAtFromTaskConfig(step.config, cursorTime);
            const dueAt = explicitDueAt ?? cursorTime;

            const created = await createAutopilotTask({
              userId: ctx.userId,
              contactId: ctx.contactId ?? null,
              listingId: ctx.listingId ?? null,
              title: String(title).trim(),
              notes: String(notes).trim() || null,
              dueAt,
              dedupeWindowMinutes: 60,
            });

            await recordStep({
              stepId: step.id,
              stepType: "TASK",
              status: "success",
              message: created ? "Task created." : "Task skipped.",
              payload: {
                taskId: created?.id ?? null,
                dueAt: dueAt ? dueAt.toISOString() : null,
                dueAtSource: explicitDueAt ? "explicit" : "cursor",
                cursorAt: cursorTime.toISOString(),
              },
            });
            break;
          }

          case "IF": {
            const result = evaluateIfGroup(step.config, contact, listing);

            await recordStep({
              stepId: step.id,
              stepType: "IF",
              status: "success",
              message: `Condition evaluated to ${result}.`,
              payload: normalizeIfConfig(step.config),
            });

            const branch = result ? step.thenSteps ?? [] : step.elseSteps ?? [];
            if (branch.length) await executeSteps(branch);
            break;
          }

          default: {
            await recordStep({
              stepId: step.id,
              stepType: step.type,
              status: "error",
              message: `Unknown step type: ${String(step.type)}`,
            });

            runStatus = "failed";
            runMessage = `Unknown step type: ${String(step.type)}`;
            return;
          }
        }
      } catch (err: any) {
        runStatus = "failed";
        runMessage = err?.message ?? "Automation step failed.";

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
    data: { status: runStatus, message: runMessage },
  });
}