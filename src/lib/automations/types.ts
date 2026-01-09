// src/lib/automations/types.ts

// ---------------------------------------------
// TRIGGERS (matches API + DB semantics)
// ---------------------------------------------
export type AutomationTrigger =
  | "NEW_CONTACT"
  | "LEAD_STAGE_CHANGE"
  | "LISTING_CREATED"
  | "LISTING_STAGE_CHANGE"
  | "MANUAL_RUN";

// ---------------------------------------------
// EXECUTION CONTEXT (workspace-first)
// ---------------------------------------------
export type AutomationContext = {
  /** Actor (used for entitlements + audit attribution) */
  userId: string;

  /** Tenant boundary (required) */
  workspaceId: string;

  contactId?: string | null;
  listingId?: string | null;

  /** Optional trigger payload (JSON-serializable) */
  payload?: Record<string, any> | null;

  /** Which trigger fired (useful for logs / debugging) */
  trigger?: AutomationTrigger | string | null;

  /** Optional stable key to dedupe runs (maps to AutomationRun.lockId) */
  idempotencyKey?: string | null;
};

// ---------------------------------------------
// CONDITION CONFIG (HubSpot-style IF)
// ---------------------------------------------
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains";

export type ConditionJoin = "AND" | "OR";

export type ConditionConfig = {
  field: string; // contact.* | listing.* (payload.* later)
  operator: ConditionOperator;
  value: string;
};

export type IfConfig = {
  join: ConditionJoin;
  conditions: ConditionConfig[];
};

// ---------------------------------------------
// STEP TYPES (matches UI + runner)
// ---------------------------------------------
export type StepType = "SMS" | "EMAIL" | "TASK" | "WAIT" | "IF";

export type SmsStepConfig = { text: string };

export type EmailStepConfig = {
  subject: string;
  body: string;
};

export type TaskStepConfig = {
  title?: string;
  text?: string;
  notes?: string;
  description?: string;

  dueAt?: string | Date | null;
  taskAt?: string | Date | null;
  reminderAt?: string | Date | null;
  date?: string | Date | null;
  datetime?: string | Date | null;

  minutes?: number;
  hours?: number;
  days?: number;

  dueInMinutes?: number;
  dueInHours?: number;
  dueInDays?: number;
};

export type WaitStepConfig = {
  amount?: number;
  unit?: "hours" | "days" | "weeks" | "months";
  hours?: number;
  days?: number;
};

export type IfStepConfig = IfConfig;

// ---------------------------------------------
// UNIFIED STEP TYPE (DB shape + runner)
// ---------------------------------------------
export type AutomationStep =
  | { id: string; type: "SMS"; config: SmsStepConfig }
  | { id: string; type: "EMAIL"; config: EmailStepConfig }
  | { id: string; type: "TASK"; config: TaskStepConfig }
  | { id: string; type: "WAIT"; config: WaitStepConfig }
  | {
      id: string;
      type: "IF";
      config: IfStepConfig;
      thenSteps?: AutomationStep[];
      elseSteps?: AutomationStep[];
    };