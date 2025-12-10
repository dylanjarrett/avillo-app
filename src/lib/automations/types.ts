// ---------------------------------------------
// TRIGGERS (matches your Prisma + API layer)
// ---------------------------------------------
export type AutomationTrigger =
  | "NEW_CONTACT"
  | "LEAD_STAGE_CHANGE"
  | "NEW_LISTING"
  | "MANUAL_RUN";

// ---------------------------------------------
// EXECUTION CONTEXT (runtime info)
// ---------------------------------------------
export type AutomationContext = {
  userId: string;
  contactId?: string | null;
  listingId?: string | null;
  payload?: Record<string, any> | null;
  // NEW: allow passing which trigger fired this run
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

export type ConditionConfig = {
  /** Field to check (supports contact.*, listing.*, payload.*) */
  field: string;

  /** equals, contains, >, <, etc. */
  operator: ConditionOperator;

  /** Compare value */
  value: any;
};

// ---------------------------------------------
// STEP TYPES
// ---------------------------------------------

export type StepType =
  | "SEND_SMS"
  | "SEND_EMAIL"
  | "TASK"
  | "WAIT"
  | "UPDATE_CONTACT_STAGE"
  | "IF";

// SMS STEP
export type AutomationStepSMS = {
  id: string;
  type: "SEND_SMS";
  config: {
    text: string;
  };
};

// EMAIL STEP
export type AutomationStepEmail = {
  id: string;
  type: "SEND_EMAIL";
  config: {
    subject: string;
    body: string;
  };
};

// TASK STEP
export type AutomationStepTask = {
  id: string;
  type: "TASK";
  config: {
    text: string;
  };
};

// WAIT STEP (already converted to hours in frontend)
export type AutomationStepWait = {
  id: string;
  type: "WAIT";
  config: {
    hours: number;
    amount?: number;
    unit?: "hours" | "days" | "weeks" | "months";
  };
};

// STAGE UPDATE
export type AutomationStepUpdateStage = {
  id: string;
  type: "UPDATE_CONTACT_STAGE";
  config: {
    stage: "new" | "warm" | "hot" | "past";
  };
};

// IF / THEN / ELSE branching
export type AutomationStepIF = {
  id: string;
  type: "IF";
  config: {
    condition: ConditionConfig;

    /** Steps to run if condition is true */
    then: AutomationStep[];

    /** Steps to run if condition is false */
    else?: AutomationStep[];
  };
};

// ---------------------------------------------
// UNIFIED STEP TYPE
// ---------------------------------------------
export type AutomationStep =
  | AutomationStepSMS
  | AutomationStepEmail
  | AutomationStepTask
  | AutomationStepWait
  | AutomationStepUpdateStage
  | AutomationStepIF;