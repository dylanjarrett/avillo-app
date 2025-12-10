// src/lib/automations/types.ts

// ---------------------------------------------
// TRIGGERS (matches Prisma + API layer)
// ---------------------------------------------
export type AutomationTrigger =
  | "NEW_CONTACT"
  | "LEAD_STAGE_CHANGE"
  | "LISTING_CREATED"
  | "LISTING_STAGE_CHANGE"
  | "MANUAL_RUN";

// ---------------------------------------------
// EXECUTION CONTEXT (runtime info)
// ---------------------------------------------
export type AutomationContext = {
  userId: string;
  contactId?: string | null;
  listingId?: string | null;
  payload?: Record<string, any> | null;
  /** Which trigger fired this run (used for logging / debugging) */
  trigger?: AutomationTrigger | string | null;
};

// ---------------------------------------------
// CONDITION CONFIG (HubSpot-style IF logic)
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

/** Join logic for multi-condition IF */
export type ConditionJoin = "AND" | "OR";

/** Single condition: contact.stage = "hot", listing.status != "pending", etc. */
export type ConditionConfig = {
  /** Field to check (supports contact.*, listing.*; payload.* later) */
  field: string;

  /** equals, not_equals, etc. */
  operator: ConditionOperator;

  /** Compare value (string in practice for now) */
  value: string;
};

/** Full IF config: one or more conditions + AND/OR join */
export type IfConfig = {
  join: ConditionJoin;
  conditions: ConditionConfig[];
};

// ---------------------------------------------
// STEP TYPES (matches Autopilot UI + runner)
// ---------------------------------------------
export type StepType = "SMS" | "EMAIL" | "TASK" | "WAIT" | "IF";

// Optional per-step config helper types (for clarity)

export type SmsStepConfig = {
  text: string;
};

export type EmailStepConfig = {
  subject: string;
  body: string;
};

export type TaskStepConfig = {
  text: string;
};

export type WaitStepConfig = {
  hours: number;
  amount?: number;
  unit?: "hours" | "days" | "weeks" | "months";
};

export type IfStepConfig = IfConfig;

// ---------------------------------------------
// UNIFIED STEP TYPE (matches DB + runAutomation)
// ---------------------------------------------

export type AutomationStep = {
  id: string;
  type: StepType;
  /**
   * For type:
   *  - "SMS":  SmsStepConfig
   *  - "EMAIL": EmailStepConfig
   *  - "TASK": TaskStepConfig
   *  - "WAIT": WaitStepConfig
   *  - "IF":   IfStepConfig
   *
   * Kept as `any` in most call sites for flexibility while you iterate.
   */
  config: any;
  /** Used only when type === "IF" */
  thenSteps?: AutomationStep[];
  /** Used only when type === "IF" */
  elseSteps?: AutomationStep[];
};