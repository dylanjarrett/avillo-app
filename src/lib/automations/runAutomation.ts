// src/lib/automations/runAutomation.ts
import { prisma } from "@/lib/prisma";
import { sendAutomationEmail, sendAutomationSms } from "@/lib/automations/messaging";
import { createAutopilotTask } from "@/lib/tasks/createAutopilotTask";
import { requireEntitlement } from "@/lib/entitlements";
import { computeTaskDueAtFromConfig, normalizeToMinute } from "@/lib/time";
import {
  whereReadableContact,
  whereReadableListing,
  type VisibilityCtx,
} from "@/lib/visibility";

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
  workspaceId: string;

  contactId?: string | null;
  listingId?: string | null;

  trigger: string;
  payload?: any;

  idempotencyKey?: string | null;

  // Continuation support
  existingRunId?: string | null;
  resumeOfPendingExecutionId?: string | null;
  cursorTime?: Date | string | null;
};

type RunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
type ExecuteResult = "CONTINUE" | "STOP";

/* ------------------------------------
 * Small helpers
 * -----------------------------------*/

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function norm(v: any): string {
  return String(v ?? "").trim().toLowerCase();
}

function coerceDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function canRunAutomations(workspaceId: string) {
  const gate = await requireEntitlement(workspaceId, "AUTOMATIONS_RUN");
  return gate.ok;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  if (!template) return "";
  return String(template).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = vars[key];
    return typeof val === "string" ? val : "";
  });
}

/**
 * WAIT should only create a persisted continuation when downstream steps
 * contain delayed side effects that must occur later in wall-clock time.
 *
 * We intentionally treat IF branches conservatively:
 * if either branch contains SMS/EMAIL anywhere reachable, we queue continuation.
 */
function stepsRequireDelayedResume(steps: AutomationStep[]): boolean {
  for (const step of steps) {
    if (step.type === "SMS" || step.type === "EMAIL") return true;

    if (step.type === "IF") {
      if (stepsRequireDelayedResume(step.thenSteps ?? [])) return true;
      if (stepsRequireDelayedResume(step.elseSteps ?? [])) return true;
    }
  }
  return false;
}

async function queuePendingExecution(args: {
  workspaceId: string;
  automationId: string;
  runId: string;
  userId: string;
  contactId?: string | null;
  listingId?: string | null;
  trigger: string;
  triggerPayload?: any;
  remainingSteps: AutomationStep[];
  resumeAt: Date;
  statusMessage?: string | null;
}) {
  return prisma.automationPendingExecution.create({
    data: {
      workspaceId: args.workspaceId,
      automationId: args.automationId,
      runId: args.runId,
      userId: args.userId,
      contactId: args.contactId ?? null,
      listingId: args.listingId ?? null,
      trigger: args.trigger,
      triggerPayload: args.triggerPayload ?? {},
      remainingSteps: args.remainingSteps as any,
      resumeAt: args.resumeAt,
      status: "PENDING",
      statusMessage: args.statusMessage ?? null,
    },
  });
}

/* ------------------------------------
 * IF / Condition helpers
 * -----------------------------------*/

type ConditionJoin = "AND" | "OR";
type ConditionConfig = { field: string; operator: "equals" | "not_equals" | string; value: string };
type NormalizedIfConfig = { join: ConditionJoin; conditions: ConditionConfig[] };

function getConditionFieldValue(field: string, contact: any | null, listing: any | null): string | null {
  switch (field) {
    case "contact.stage":
      return contact?.stage != null ? norm(contact.stage) : null;

    // canonical + backwards-compatible aliases
    case "contact.clientRole":
    case "contact.type":
    case "contact.role":
    case "contact.contactType":
      return contact?.clientRole != null ? norm(contact.clientRole) : null;

    case "contact.source":
      return contact?.source != null ? norm(contact.source) : null;

    case "contact.relationshipType":
      return contact?.relationshipType != null ? norm(contact.relationshipType) : null;

    case "listing.status":
      return listing?.status != null ? norm(listing.status) : null;

    default:
      return null;
  }
}

function normalizeExpectedValue(field: string, value: string): string {
  const v = norm(value);

  if (
    field === "contact.clientRole" ||
    field === "contact.type" ||
    field === "contact.role" ||
    field === "contact.contactType"
  ) {
    if (v === "buyer" || v === "buying") return "buyer";
    if (v === "seller" || v === "selling") return "seller";
    if (v === "both") return "both";
  }

  if (field === "contact.relationshipType") {
    if (v === "client") return "client";
    if (v === "partner") return "partner";
  }

  return v;
}

function evaluateSingleCondition(config: ConditionConfig, contact: any | null, listing: any | null): boolean {
  const actual = getConditionFieldValue(config.field, contact, listing);
  if (actual == null) return false;

  const expected = normalizeExpectedValue(config.field, config.value);

  if (config.operator === "equals") return actual === expected;
  if (config.operator === "not_equals") return actual !== expected;

  return actual === expected;
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
      conditions: conditions.filter((c) => !!c.field && !!String(c.value ?? "").trim()),
    };
  }

  if (!raw?.field || raw?.value == null) return { join: "AND", conditions: [] };

  return {
    join: "AND",
    conditions: [
      {
        field: String(raw.field),
        operator: String(raw.operator ?? "equals"),
        value: String(raw.value ?? ""),
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
 * Timing helpers (relative only)
 * -----------------------------------*/

type WaitUnit = "hours" | "days" | "weeks" | "months";

function normalizeWait(config: any): { amount: number; unit: WaitUnit } | null {
  const amountRaw = config?.amount ?? config?.value ?? null;
  const unitRaw = String(config?.unit ?? "").toLowerCase().trim();
  const amount = Number(amountRaw ?? 0);

  const unit: WaitUnit | null =
    unitRaw === "hours" || unitRaw === "days" || unitRaw === "weeks" || unitRaw === "months"
      ? (unitRaw as WaitUnit)
      : null;

  if (unit && Number.isFinite(amount) && amount > 0) return { amount, unit };

  const legacyHours = Number(config?.hours ?? 0);
  if (Number.isFinite(legacyHours) && legacyHours > 0) return { amount: legacyHours, unit: "hours" };

  const legacyDays = Number(config?.days ?? 0);
  if (Number.isFinite(legacyDays) && legacyDays > 0) return { amount: legacyDays, unit: "days" };

  return null;
}

function addToDate(base: Date, amount: number, unit: WaitUnit): Date {
  const d = new Date(base);

  if (unit === "hours") return new Date(d.getTime() + amount * 60 * 60 * 1000);

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

export async function runAutomation(automationIdRaw: string, steps: AutomationStep[], ctx: RunContext) {
  const userId = safeId(ctx.userId);
  const workspaceId = safeId(ctx.workspaceId);
  const automationId = safeId(automationIdRaw);
  const existingRunId = safeId(ctx.existingRunId);

  if (!userId || !workspaceId || !automationId) return;

  if (!(await canRunAutomations(workspaceId))) {
    if (existingRunId) {
      throw new Error("Workspace no longer entitled to run automations.");
    }
    return;
  }

  const membership = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId, removedAt: null },
    select: { id: true },
  });

  if (!membership) {
    if (existingRunId) throw new Error("User is not an active member of this workspace.");
    return;
  }

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
    select: { id: true, name: true, active: true },
  });

  if (!automation) {
    if (existingRunId) throw new Error("Automation no longer exists in this workspace.");
    return;
  }

  if (!automation.active) {
    if (existingRunId) throw new Error("Automation is inactive.");
    return;
  }

  const contactId = safeId(ctx.contactId);
  const listingId = safeId(ctx.listingId);

  const vctx: VisibilityCtx = {
    workspaceId,
    userId,
    isWorkspaceAdmin: false,
  };

  const [user, contact, listing] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    contactId
      ? prisma.contact.findFirst({ where: { id: contactId, ...whereReadableContact(vctx) } })
      : Promise.resolve(null),
    listingId
      ? prisma.listing.findFirst({ where: { id: listingId, ...whereReadableListing(vctx) } })
      : Promise.resolve(null),
  ]);

  if (!user) {
    if (existingRunId) throw new Error("Automation owner user no longer exists.");
    return;
  }

  if (contactId && !contact) {
    if (existingRunId) throw new Error("Resume failed: contact no longer readable.");
    return;
  }

  if (listingId && !listing) {
    if (existingRunId) throw new Error("Resume failed: listing no longer readable.");
    return;
  }

  if (contact && norm((contact as any).relationshipType) === "partner") {
    if (existingRunId) throw new Error("Resume failed: partner contacts do not run automations.");
    return;
  }

  const lockId =
    safeId(ctx.idempotencyKey) ||
    [
      "auto",
      automationId,
      workspaceId,
      safeId(ctx.trigger) ?? "trigger",
      contactId ?? "no_contact",
      listingId ?? "no_listing",
      safeId(JSON.stringify(ctx.payload ?? {}))?.slice(0, 120) ?? "no_payload",
    ].join(":");

  if (!existingRunId) {
    const existingRun = await prisma.automationRun.findFirst({
      where: { workspaceId, automationId, lockId },
      select: { id: true },
      orderBy: { executedAt: "desc" },
    });

    if (existingRun) return;
  }

  const contactFullName =
    (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` : "") ||
    (contact as any)?.name ||
    "";

  const contactFirstName =
    contact?.firstName ?? (contactFullName ? String(contactFullName).split(" ")[0] : "") ?? "";

  const agentPhone = (user as any)?.phone ?? (user as any)?.phoneNumber ?? (user as any)?.mobile ?? "";
  const agentEmail = user?.email ?? "";
  const propertyAddress =
    (listing as any)?.address ?? (listing as any)?.fullAddress ?? (listing as any)?.streetAddress ?? "";

  const templateVars: Record<string, string> = {
    firstName: contactFirstName,
    fullName: contactFullName ? String(contactFullName) : "",
    lastName: (contact as any)?.lastName ?? "",
    agentName: user?.name ?? "",
    agentEmail,
    agentPhone,
    propertyAddress,
  };

  let toEmail: string | null = (contact as any)?.email ?? (contact as any)?.primaryEmail ?? null;
  let toPhone: string | null = (contact as any)?.phone ?? (contact as any)?.phoneNumber ?? null;

  if (!contact) {
    toEmail = user?.email ?? null;
    toPhone = (user as any)?.phone ?? null;
  }

  let runStatus: RunStatus = "SUCCESS";
  let runMessage: string | null = null;

  const run = existingRunId
    ? await prisma.automationRun.findFirst({
        where: {
          id: existingRunId,
          workspaceId,
          automationId,
        },
        select: {
          id: true,
          executedAt: true,
        },
      })
    : await prisma.automationRun.create({
        data: {
          automationId,
          workspaceId,
          ownerUserId: userId,
          contactId: contactId ?? null,
          listingId: listingId ?? null,
          trigger: String(ctx.trigger ?? "UNKNOWN"),
          triggerPayload: ctx.payload ?? {},
          status: "RUNNING",
          message: null,
          lockId,
        },
        select: {
          id: true,
          executedAt: true,
        },
      });

  if (!run) {
    throw new Error("Unable to load or create automation run.");
  }

  if (existingRunId) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        message: null,
      },
    });
  }

  let stepIndex = existingRunId
    ? await prisma.automationRunStep.count({ where: { runId: run.id } })
    : 0;

  const recordStep = async (data: {
    stepId?: string;
    stepType: StepType;
    status: "SUCCESS" | "FAILED" | "SKIPPED";
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

  let cursorTime = coerceDate(ctx.cursorTime) ?? run.executedAt ?? new Date();

  const executeSteps = async (stepsToRun: AutomationStep[]): Promise<ExecuteResult> => {
    for (let i = 0; i < stepsToRun.length; i++) {
      const step = stepsToRun[i];
      const remainingSteps = stepsToRun.slice(i + 1);

      try {
        if (!(await canRunAutomations(workspaceId))) {
          await recordStep({
            stepId: step.id,
            stepType: step.type,
            status: "SKIPPED",
            message: "Skipped: plan no longer allows automations.",
          });

          runStatus = "FAILED";
          runMessage = "Automation stopped due to plan downgrade.";
          return "STOP";
        }

        switch (step.type) {
          case "SMS": {
            if (!toPhone) throw new Error("No phone number available for SMS.");

            const body = renderTemplate(step.config?.text ?? "", templateVars);

            const result = await sendAutomationSms({
              userId,
              workspaceId,
              to: toPhone,
              body,
              contactId: contactId ?? null,
              listingId: listingId ?? null,
              automationRunId: run.id,
            });

            if (!result || (result as any).success === false) {
              throw new Error((result as any)?.error || "Automation SMS failed to send.");
            }

            await recordStep({
              stepId: step.id,
              stepType: "SMS",
              status: "SUCCESS",
              payload: {
                to: toPhone,
                listingId: listingId ?? null,
                automationRunId: run.id,
              },
            });

            break;
          }

          case "EMAIL": {
            if (!toEmail) throw new Error("No email available for Email step.");

            const subject = renderTemplate(step.config?.subject ?? "", templateVars);
            const html = renderTemplate(
              String(step.config?.body ?? "").replace(/\n/g, "<br />"),
              templateVars
            );

            await sendAutomationEmail({
              userId,
              workspaceId,
              to: toEmail,
              subject,
              html,
              contactId: contactId ?? null,
            });

            await recordStep({
              stepId: step.id,
              stepType: "EMAIL",
              status: "SUCCESS",
              payload: { to: toEmail, subject },
            });

            break;
          }

          case "WAIT": {
            const wait = normalizeWait(step.config);
            const before = cursorTime;

            if (!wait) {
              throw new Error("WAIT step is missing a valid amount/unit.");
            }

            cursorTime = addToDate(cursorTime, wait.amount, wait.unit);
            const resumeAt = normalizeToMinute(cursorTime);

            await recordStep({
              stepId: step.id,
              stepType: "WAIT",
              status: "SUCCESS",
              message: `Advanced time by ${wait.amount} ${wait.unit}.`,
              payload: {
                ...step.config,
                cursorBefore: before.toISOString(),
                cursorAfter: cursorTime.toISOString(),
                resumeAt: resumeAt.toISOString(),
              },
            });

            if (!remainingSteps.length) {
              break;
            }

            // Critical nuance:
            // WAIT -> TASK must remain the same as today.
            // We only queue/delay when downstream delayed side effects exist.
            const requiresResume = stepsRequireDelayedResume(remainingSteps);
            if (!requiresResume) {
              break;
            }

            await queuePendingExecution({
              workspaceId,
              automationId,
              runId: run.id,
              userId,
              contactId: contactId ?? null,
              listingId: listingId ?? null,
              trigger: String(ctx.trigger ?? "UNKNOWN"),
              triggerPayload: ctx.payload ?? {},
              remainingSteps,
              resumeAt,
              statusMessage: `Waiting until ${resumeAt.toISOString()} before continuing automation.`,
            });

            runStatus = "SUCCESS";
            runMessage = `Waiting until ${resumeAt.toISOString()} before continuing automation.`;
            return "STOP";
          }

          case "TASK": {
            const titleTemplate =
              step.config?.title ??
              step.config?.taskTitle ??
              step.config?.name ??
              step.config?.text ??
              "Task";

            const title = renderTemplate(String(titleTemplate ?? ""), templateVars).trim();
            if (!title) throw new Error("Task title is required.");

            const notesTemplate = step.config?.notes ?? step.config?.description ?? "";
            const notes = renderTemplate(String(notesTemplate ?? ""), templateVars).trim() || null;

            // KEEP THIS BEHAVIOR:
            // WAIT -> TASK still creates the task immediately, using cursorTime.
            const resolved = computeTaskDueAtFromConfig(step.config, cursorTime);
            const dueAt = resolved.dueAt ?? normalizeToMinute(cursorTime);

            const created = await createAutopilotTask({
              userId,
              workspaceId,
              contactId: contactId ?? null,
              listingId: listingId ?? null,
              title,
              notes,
              dueAt,
              dedupeWindowMinutes: 60,
            });

            await recordStep({
              stepId: step.id,
              stepType: "TASK",
              status: "SUCCESS",
              message: created ? "Task created." : "Task skipped (deduped/blocked).",
              payload: {
                taskId: created?.id ?? null,
                dueAt: dueAt ? dueAt.toISOString() : null,
                dueAtSource: resolved.source,
                cursorAt: cursorTime.toISOString(),
              },
            });

            break;
          }

          case "IF": {
            const result = evaluateIfGroup(step.config, contact, listing);
            const normalizedConfig = normalizeIfConfig(step.config);

            await recordStep({
              stepId: step.id,
              stepType: "IF",
              status: "SUCCESS",
              message: `Condition evaluated to ${result}.`,
              payload: {
                ...normalizedConfig,
                contactSnapshot: contact
                  ? {
                      id: contact.id,
                      relationshipType: contact.relationshipType ?? null,
                      clientRole: contact.clientRole ?? null,
                      stage: contact.stage ?? null,
                      source: contact.source ?? null,
                    }
                  : null,
                listingSnapshot: listing
                  ? {
                      id: listing.id,
                      status: listing.status ?? null,
                    }
                  : null,
              },
            });

            const branch = result ? step.thenSteps ?? [] : step.elseSteps ?? [];
            if (branch.length) {
              const branchResult = await executeSteps(branch);
              if (branchResult === "STOP") return "STOP";
            }

            break;
          }

          default: {
            await recordStep({
              stepId: step.id,
              stepType: step.type,
              status: "FAILED",
              message: `Unknown step type: ${String(step.type)}`,
            });

            runStatus = "FAILED";
            runMessage = `Unknown step type: ${String(step.type)}`;
            return "STOP";
          }
        }
      } catch (err: any) {
        runStatus = "FAILED";
        runMessage = err?.message ?? "Automation step failed.";

        await recordStep({
          stepId: step.id,
          stepType: step.type,
          status: "FAILED",
          message: runMessage,
        });

        return "STOP";
      }
    }

    return "CONTINUE";
  };

  try {
    await executeSteps(Array.isArray(steps) ? steps : []);
  } finally {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: runStatus,
        message: runMessage,
      },
    });
  }
}