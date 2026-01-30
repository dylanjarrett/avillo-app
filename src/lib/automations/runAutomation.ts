// src/lib/automations/runAutomation.ts
import { prisma } from "@/lib/prisma";
import { sendAutomationEmail, sendAutomationSms } from "@/lib/automations/messaging";
import { createAutopilotTask } from "@/lib/tasks/createAutopilotTask";
import { requireEntitlement } from "@/lib/entitlements";
import { computeTaskDueAtFromConfig, normalizeToMinute } from "@/lib/time";

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

  idempotencyKey?: string;
};

type RunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";

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

    case "contact.clientRole":
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

function evaluateSingleCondition(config: ConditionConfig, contact: any | null, listing: any | null): boolean {
  const actual = getConditionFieldValue(config.field, contact, listing);
  if (actual == null) return false;

  const expected = norm(config.value);
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
    conditions: [{ field: String(raw.field), operator: String(raw.operator ?? "equals"), value: String(raw.value ?? "") }],
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

  if (!userId || !workspaceId || !automationId) return;

  // Plan gate
  if (!(await canRunAutomations(workspaceId))) return;

  // Membership guard (must be active membership)
  const membership = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId, removedAt: null },
    select: { id: true },
  });
  if (!membership) return;

  // ✅ Workspace-first: automation must belong to workspace (no legacy userId scoping)
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
    select: { id: true, name: true, active: true },
  });
  if (!automation) return;
  if (!automation.active) return;

  const contactId = safeId(ctx.contactId);
  const listingId = safeId(ctx.listingId);

  const [user, contact, listing] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    contactId ? prisma.contact.findFirst({ where: { id: contactId, workspaceId } }) : Promise.resolve(null),
    listingId ? prisma.listing.findFirst({ where: { id: listingId, workspaceId } }) : Promise.resolve(null),
  ]);

  if (!user) return;
  if (contactId && !contact) return;
  if (listingId && !listing) return;

  // HARD RULE: Partner contacts do not run automations.
  if (contact && norm((contact as any).relationshipType) === "partner") return;

  // Derive idempotency key to avoid duplicates on retries
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

  // ✅ Idempotency should be tenant-aware
  const existingRun = await prisma.automationRun.findFirst({
    where: { workspaceId, automationId, lockId },
    select: { id: true },
    orderBy: { executedAt: "desc" },
  });
  if (existingRun) return;

  // Template vars
  const contactFullName =
    (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` : "") ||
    (contact as any)?.name ||
    "";

  const contactFirstName = contact?.firstName ?? (contactFullName ? String(contactFullName).split(" ")[0] : "") ?? "";

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

  // Test mode: no contact => send to agent
  if (!contact) {
    toEmail = user?.email ?? null;
    toPhone = (user as any)?.phone ?? null;
  }

  let runStatus: RunStatus = "SUCCESS";
  let runMessage: string | null = null;

  // ✅ REQUIRED by schema: workspaceId on AutomationRun
  const run = await prisma.automationRun.create({
    data: {
      automationId,
      workspaceId,

      contactId: contactId ?? null,
      listingId: listingId ?? null,

      trigger: String(ctx.trigger ?? "UNKNOWN"),
      triggerPayload: ctx.payload ?? {},

      status: "RUNNING",
      message: null,

      lockId,
    },
  });

  let stepIndex = 0;

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

  // Relative “cursor” time
  let cursorTime = run.executedAt ?? new Date();

  const executeSteps = async (stepsToRun: AutomationStep[]) => {
    for (const step of stepsToRun) {
      try {
        // Mid-run downgrade safety
        if (!(await canRunAutomations(workspaceId))) {
          await recordStep({
            stepId: step.id,
            stepType: step.type,
            status: "SKIPPED",
            message: "Skipped: plan no longer allows automations.",
          });
          runStatus = "FAILED";
          runMessage = "Automation stopped due to plan downgrade.";
          return;
        }

        switch (step.type) {
          case "SMS": {
            if (!toPhone) throw new Error("No phone number available for SMS.");
            const body = renderTemplate(step.config?.text ?? "", templateVars);

            await sendAutomationSms({
              userId,
              workspaceId,
              to: toPhone,
              body,
              contactId: contactId ?? null,
            });

            await recordStep({
              stepId: step.id,
              stepType: "SMS",
              status: "SUCCESS",
              payload: { to: toPhone },
            });
            break;
          }

          case "EMAIL": {
            if (!toEmail) throw new Error("No email available for Email step.");

            const subject = renderTemplate(step.config?.subject ?? "", templateVars);
            const html = renderTemplate(String(step.config?.body ?? "").replace(/\n/g, "<br />"), templateVars);

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

            if (wait) {
              cursorTime = addToDate(cursorTime, wait.amount, wait.unit);
              await recordStep({
                stepId: step.id,
                stepType: "WAIT",
                status: "SUCCESS",
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
                status: "SUCCESS",
                message: "Wait recorded (missing amount/unit).",
                payload: { ...step.config, cursorAt: cursorTime.toISOString() },
              });
            }
            break;
          }

          case "TASK": {
            const titleRaw =
              step.config?.title ?? step.config?.taskTitle ?? step.config?.name ?? step.config?.text ?? "Task";

            const title = String(titleRaw ?? "").trim();
            if (!title) throw new Error("Task title is required.");

            const notes = String(step.config?.notes ?? step.config?.description ?? "").trim() || null;

            // ✅ Canonical resolver (src/lib/time.ts)
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
                dueAtSource: resolved.source, // "absolute" | "relative" | "none"
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
              status: "SUCCESS",
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
              status: "FAILED",
              message: `Unknown step type: ${String(step.type)}`,
            });
            runStatus = "FAILED";
            runMessage = `Unknown step type: ${String(step.type)}`;
            return;
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
        return;
      }
    }
  };

  try {
    await executeSteps(Array.isArray(steps) ? steps : []);
  } finally {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: { status: runStatus, message: runMessage },
    });
  }
}