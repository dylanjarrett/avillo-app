"use client";

import { useEffect, useState } from "react";

export type StepType = "SMS" | "EMAIL" | "TASK" | "WAIT" | "IF";

type BranchStep = {
  id: string;
  type: StepType;
  config: any;
};

type ConditionScope = "contact" | "listing" | "both";

type ConditionConfig = {
  field: string;
  operator: "equals" | "not_equals";
  value: string;
};

type IfConfig = {
  join: "AND" | "OR";
  conditions: ConditionConfig[];
};

type Props = {
  type: StepType | null;
  initialConfig?: any | null;
  initialThen?: BranchStep[] | null;
  initialElse?: BranchStep[] | null;
  // contact  -> only contact fields
  // listing  -> only listing fields
  // both/undefined -> show everything
  conditionScope?: ConditionScope;
  onClose: () => void;
  onSave: (
    config: any,
    thenSteps?: BranchStep[],
    elseSteps?: BranchStep[]
  ) => void;
};

/* ------------------------------------
 * Condition field + value options
 * -----------------------------------*/

// Split into groups so we can filter by scope
const CONTACT_CONDITION_FIELDS = [
  { value: "contact.stage", label: "Contact stage" },
  { value: "contact.type", label: "Contact type" },
  { value: "contact.source", label: "Contact source" },
];

const LISTING_CONDITION_FIELDS = [
  { value: "listing.status", label: "Listing status" },
];

const ALL_CONDITION_FIELDS = [
  ...CONTACT_CONDITION_FIELDS,
  ...LISTING_CONDITION_FIELDS,
];

// Dropdown values for each field
const FIELD_VALUE_OPTIONS: Record<string, string[]> = {
  "contact.stage": ["new", "warm", "hot", "past"],
  "contact.type": ["buyer", "seller", "buyer & seller"],
  "contact.source": [
    "zillow",
    "referral",
    "open house",
    "website",
    "social media",
    "other",
  ],
  "listing.status": ["draft", "active", "pending", "closed"],
};

const CONDITION_OPERATORS = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
];

// Scope helper: which fields should be visible?
function getConditionFields(scope: ConditionScope | undefined) {
  if (scope === "contact") return CONTACT_CONDITION_FIELDS;
  if (scope === "listing") return LISTING_CONDITION_FIELDS;
  return ALL_CONDITION_FIELDS;
}

export default function StepModal({
  type,
  initialConfig,
  initialThen,
  initialElse,
  conditionScope,
  onClose,
  onSave,
}: Props) {
  // For non-IF steps we just keep a simple object
  const [form, setForm] = useState<any>(initialConfig ?? {});
  const [thenSteps, setThenSteps] = useState<BranchStep[]>(initialThen ?? []);
  const [elseSteps, setElseSteps] = useState<BranchStep[]>(initialElse ?? []);

  const isEditing = !!initialConfig;
  const conditionFields = getConditionFields(conditionScope);

  function update(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  /* ------------------------------------
 * IF helpers: conditions array
 * -----------------------------------*/

function normaliseIfConfig(raw: any): IfConfig {
  const availableFields =
    conditionFields.length > 0 ? conditionFields : ALL_CONDITION_FIELDS;

  // New shape already? { join, conditions: ConditionConfig[] }
  if (raw && Array.isArray(raw.conditions)) {
    const join: "AND" | "OR" = raw.join === "OR" ? "OR" : "AND";
    const existing = raw.conditions as ConditionConfig[];

    const conditions: ConditionConfig[] =
      existing.length > 0
        ? existing
        : [
            {
              field: availableFields[0]?.value ?? "contact.stage",
              operator: "equals",
              value:
                FIELD_VALUE_OPTIONS[
                  (availableFields[0]?.value as string) || "contact.stage"
                ]?.[0] ?? "",
            },
          ];

    return { join, conditions };
  }

  // Legacy shape: { field, operator, value }
  let field = raw?.field as string | undefined;
  if (!field || !availableFields.some((f) => f.value === field)) {
    field = availableFields[0]?.value ?? "contact.stage";
  }

  const allowedVals = FIELD_VALUE_OPTIONS[field] ?? [];
  let value = raw?.value as string | undefined;
  if (!value || !allowedVals.includes(value)) {
    value = allowedVals[0] ?? "";
  }

  const operator: "equals" | "not_equals" =
    raw?.operator === "not_equals" ? "not_equals" : "equals";

  return {
    join: "AND",
    conditions: [{ field, operator, value }],
  };
}

  function addConditionRow() {
    setForm((prev: any) => {
      const cfg = normaliseIfConfig(prev || {});
      const availableFields =
        conditionFields.length > 0 ? conditionFields : ALL_CONDITION_FIELDS;
      const field = availableFields[0]?.value ?? "contact.stage";
      const value =
        FIELD_VALUE_OPTIONS[field]?.[0] ??
        FIELD_VALUE_OPTIONS["contact.stage"]?.[0] ??
        "";
      return {
        ...cfg,
        conditions: [
          ...cfg.conditions,
          {
            field,
            operator: "equals",
            value,
          },
        ],
      };
    });
  }

  function updateCondition(index: number, patch: Partial<ConditionConfig>) {
    setForm((prev: any) => {
      const cfg = normaliseIfConfig(prev || {});
      const next = [...cfg.conditions];
      next[index] = { ...next[index], ...patch };
      return {
        ...cfg,
        conditions: next,
      };
    });
  }

  function removeCondition(index: number) {
    setForm((prev: any) => {
      const cfg = normaliseIfConfig(prev || {});
      const next = [...cfg.conditions];
      next.splice(index, 1);
      return {
        ...cfg,
        conditions: next.length ? next : cfg.conditions,
      };
    });
  }

  /* ------------------------------------
   * Defaults when opening modal
   * -----------------------------------*/
  useEffect(() => {
    if (!type) return;

    // WAIT defaults
    if (type === "WAIT") {
      const hours = Number(
        (initialConfig && initialConfig.hours) ??
          (initialConfig && initialConfig.amount) ??
          24
      );
      const safeHours = Number.isNaN(hours) || hours <= 0 ? 24 : hours;
      const unit = initialConfig?.unit ?? "hours";
      const amount = initialConfig?.amount ?? safeHours;

      setForm({
        amount,
        unit,
        hours: safeHours,
      });
      return;
    }

    // IF defaults (multi-condition)
    if (type === "IF") {
      const cfg = normaliseIfConfig(initialConfig ?? {});
      setForm(cfg);
      setThenSteps(initialThen ?? []);
      setElseSteps(initialElse ?? []);
      return;
    }

    // SMS / EMAIL / TASK
    setForm(initialConfig ?? {});
  }, [
    type,
    initialConfig,
    initialThen,
    initialElse,
    conditionScope,
    conditionFields.length,
  ]);

  /* ------------------------------------
   * Save
   * -----------------------------------*/
  function handleSave() {
    if (!type) return;

    if (type === "IF") {
      const cfg = normaliseIfConfig(form ?? {});
      const cleaned = cfg.conditions.filter(
        (c) => c.field && c.value && c.operator
      );
      if (!cleaned.length) {
        alert("Add at least one condition for this IF step.");
        return;
      }

      onSave(
        {
          join: cfg.join,
          conditions: cleaned,
        },
        thenSteps,
        elseSteps
      );
      return;
    }

    if (type === "WAIT") {
      const rawAmount = form.amount;
      const amount =
        typeof rawAmount === "number"
          ? rawAmount
          : Number.parseFloat(String(rawAmount ?? ""));

      if (!amount || Number.isNaN(amount) || amount <= 0) {
        alert("Delay must be at least 1.");
        return;
      }

      const unit: "hours" | "days" | "weeks" | "months" =
        form.unit || "hours";

      const multiplier: Record<typeof unit, number> = {
        hours: 1,
        days: 24,
        weeks: 24 * 7,
        months: 24 * 30,
      };

      onSave({
        amount,
        unit,
        hours: amount * multiplier[unit],
      });
      return;
    }

    // SMS / EMAIL / TASK
    onSave(form);
  }

  /* ------------------------------------
   * Branch helpers (IF)
   * -----------------------------------*/
  function addBranchStep(branch: "then" | "else", stepType: StepType) {
    if (stepType === "IF") return; // no nested IF for now

    const newStep: BranchStep = {
      id: crypto.randomUUID(),
      type: stepType,
      config:
        stepType === "WAIT"
          ? { amount: 4, unit: "hours", hours: 4 }
          : stepType === "EMAIL"
          ? { subject: "", body: "" }
          : { text: "" },
    };

    if (branch === "then") {
      setThenSteps((p) => [...p, newStep]);
    } else {
      setElseSteps((p) => [...p, newStep]);
    }
  }

  function updateBranchStep(
    branch: "then" | "else",
    id: string,
    patch: any
  ) {
    const setter = branch === "then" ? setThenSteps : setElseSteps;
    setter((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, config: { ...s.config, ...patch } } : s
      )
    );
  }

  function removeBranchStep(branch: "then" | "else", id: string) {
    const setter = branch === "then" ? setThenSteps : setElseSteps;
    setter((prev) => prev.filter((s) => s.id !== id));
  }

  /* ------------------------------------
   * UI
   * -----------------------------------*/
  if (!type) return null;

  const selectBase =
    "bg-slate-950/90 text-[11px] text-slate-50 outline-none border border-slate-700/80 rounded-lg px-2 py-1";
  const optionClass = "bg-slate-900 text-slate-50";

  // For IF value dropdowns we need current cfg
  const ifCfg: IfConfig | null =
    type === "IF" ? normaliseIfConfig(form ?? {}) : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="
          relative w-[95%] max-w-2xl md:max-w-3xl max-h-[85vh]
          overflow-y-auto rounded-2xl border border-slate-700/70
          bg-gradient-to-b from-slate-900/90 to-slate-950
          px-6 py-6 shadow-[0_0_60px_rgba(15,23,42,0.95)]
        "
      >
        {/* Glow */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

        {/* HEADER */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold tracking-[0.02em] text-slate-50">
              {type === "SMS" && (isEditing ? "Edit SMS" : "Add SMS message")}
              {type === "EMAIL" &&
                (isEditing ? "Edit email" : "Add email step")}
              {type === "TASK" &&
                (isEditing ? "Edit task" : "Add task reminder")}
              {type === "WAIT" &&
                (isEditing ? "Edit delay" : "Add wait / delay")}
              {type === "IF" &&
                (isEditing ? "Edit branch condition" : "Add IF / branch")}
            </h3>
            <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
              {type === "SMS" &&
                "Short, conversational text. Use merge tags to personalize."}
              {type === "EMAIL" &&
                "Subject + full body. You can paste from Intelligence and tweak it here."}
              {type === "TASK" &&
                "This shows up as a to-do for you – keep it clear and action-focused."}
              {type === "WAIT" &&
                "Tell Avillo how long to pause before the next step runs."}
              {type === "IF" &&
                "Define a simple rule, then choose what should happen if it’s true or false."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)] hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        {/* SMS */}
        {type === "SMS" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Text Message
              </label>
              <textarea
                rows={4}
                className="mt-1 w-fullresize-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Hey {{firstName}}, thanks for reaching out — when are you free for a quick call?"
                value={form.text ?? ""}
                onChange={(e) => update("text", e.target.value)}
              />
              <p className="mt-1 text-[9px] text-[var(--avillo-cream-muted)]">
                Variables: <code>{"{{firstName}}"}</code>,{" "}
                <code>{"{{agentName}}"}</code>,{" "}
                <code>{"{{propertyAddress}}"}</code>
              </p>
            </div>
          </div>
        )}

        {/* EMAIL */}
        {type === "EMAIL" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Subject
              </label>
              <input
                className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Quick market update for you"
                value={form.subject ?? ""}
                onChange={(e) => update("subject", e.target.value)}
              />
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Body
              </label>
              <textarea
                rows={6}
                className="mt-1 w-full resize-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Write the full email body…"
                value={form.body ?? ""}
                onChange={(e) => update("body", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* TASK */}
        {type === "TASK" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Task Description
              </label>
              <input
                className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Call {{firstName}} to confirm search criteria"
                value={form.text ?? ""}
                onChange={(e) => update("text", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* WAIT */}
        {type === "WAIT" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Delay before next step
              </label>

              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min={1}
                  className="w-24 bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] border border-slate-700/80 rounded-lg px-2 py-1"
                  placeholder="Ex: 4"
                  value={form.amount ?? ""}
                  onChange={(e) => update("amount", e.target.value)}
                />

                <select
                  className={selectBase + " flex-1"}
                  value={form.unit ?? "hours"}
                  onChange={(e) => update("unit", e.target.value)}
                >
                  <option className={optionClass} value="hours">
                    Hours
                  </option>
                  <option className={optionClass} value="days">
                    Days
                  </option>
                  <option className={optionClass} value="weeks">
                    Weeks
                  </option>
                  <option className={optionClass} value="months">
                    Months
                  </option>
                </select>
              </div>

              <p className="mt-1 text-[9px] text-[var(--avillo-cream-muted)]">
                Example: <strong>4 hours</strong> ≈ later the same day.{" "}
                <strong>2 days</strong> ≈ 48 hours later.
              </p>
            </div>
          </div>
        )}

        {/* IF */}
        {type === "IF" && ifCfg && (
          <div className="space-y-4">
            {/* Condition builder */}
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Conditions
              </label>
              <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                Example: Contact type is <strong>buyer</strong> AND Contact
                stage is <strong>hot</strong>.
              </p>

              {/* Join selector */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                  Link conditions with
                </span>
                <select
                  className={selectBase + " w-24"}
                  value={ifCfg.join}
                  onChange={(e) =>
                    setForm((prev: any) => ({
                      ...normaliseIfConfig(prev || {}),
                      join: e.target.value === "OR" ? "OR" : "AND",
                    }))
                  }
                >
                  <option className={optionClass} value="AND">
                    AND
                  </option>
                  <option className={optionClass} value="OR">
                    OR
                  </option>
                </select>
              </div>

              {/* Condition rows */}
              <div className="mt-3 space-y-2">
                {ifCfg.conditions.map((cond, index) => {
                  const valuesForField =
                    FIELD_VALUE_OPTIONS[cond.field] ?? [];

                  return (
                    <div
                      key={index}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2"
                    >
                      <span className="text-[10px] text-[var(--avillo-cream-muted)]">
                        If
                      </span>

                      {/* FIELD */}
                      <select
                        className={selectBase + " w-40"}
                        value={cond.field}
                        onChange={(e) => {
                          const newField = e.target.value;
                          const firstVal =
                            FIELD_VALUE_OPTIONS[newField]?.[0] ?? "";
                          updateCondition(index, {
                            field: newField,
                            value: firstVal,
                          });
                        }}
                      >
                        {conditionFields.map((f) => (
                          <option
                            key={f.value}
                            value={f.value}
                            className={optionClass}
                          >
                            {f.label}
                          </option>
                        ))}
                      </select>

                      {/* OPERATOR */}
                      <select
                        className={selectBase + " w-24"}
                        value={cond.operator}
                        onChange={(e) =>
                          updateCondition(index, {
                            operator: e.target
                              .value as ConditionConfig["operator"],
                          })
                        }
                      >
                        {CONDITION_OPERATORS.map((o) => (
                          <option
                            key={o.value}
                            value={o.value}
                            className={optionClass}
                          >
                            {o.label}
                          </option>
                        ))}
                      </select>

                      {/* VALUE */}
                      <select
                        className={selectBase + " w-32"}
                        value={cond.value}
                        onChange={(e) =>
                          updateCondition(index, { value: e.target.value })
                        }
                      >
                        {valuesForField.map((v) => (
                          <option key={v} value={v} className={optionClass}>
                            {v}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="ml-auto rounded-full border border-slate-600/80 bg-slate-900/80 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)] hover:border-rose-400/80 hover:text-rose-50"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addConditionRow}
                className="mt-2 rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:text-amber-50"
              >
                + Add condition
              </button>
            </div>

            {/* THEN / ELSE branches (unchanged from your version) */}
            {/* THEN */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-900/10 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Then (condition is true)
                </p>

                <div className="mt-2 space-y-2">
                  {thenSteps.length === 0 && (
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      No steps yet. Add at least one action for the TRUE branch.
                    </p>
                  )}

                  {thenSteps.map((s, idx) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-slate-700/80 bg-slate-950/70 px-2 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold text-slate-50">
                          Step {idx + 1}: {s.type}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeBranchStep("then", s.id)}
                          className="rounded-full border border-slate-600/80 bg-slate-900/80 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--avillo-cream-muted)] hover:border-rose-400/80 hover:bg-rose-900/40 hover:text-rose-50"
                        >
                          Remove
                        </button>
                      </div>

                      {/* SMS */}
                      {s.type === "SMS" && (
                        <div className="mt-1 space-y-1">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]">
                            Text Message
                          </label>
                          <textarea
                            rows={3}
                            className="w-full resize-none bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                            placeholder="Ex: Hey {{firstName}}, thanks for reaching out — when are you free for a quick call?"
                            value={s.config?.text ?? ""}
                            onChange={(e) =>
                              updateBranchStep("then", s.id, {
                                text: e.target.value,
                              })
                            }
                          />
                          <p className="text-[8px] text-[var(--avillo-cream-muted)]">
                            Variables: <code>{"{{firstName}}"}</code>,{" "}
                            <code>{"{{agentName}}"}</code>,{" "}
                            <code>{"{{propertyAddress}}"}</code>
                          </p>
                        </div>
                      )}

                      {/* EMAIL */}
                      {s.type === "EMAIL" && (
                        <div className="mt-1 space-y-2">
                          <div>
                            <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]">
                              Subject
                            </label>
                            <input
                              className="mt-0.5 w-full bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                              placeholder="Ex: Quick market update for you"
                              value={s.config?.subject ?? ""}
                              onChange={(e) =>
                                updateBranchStep("then", s.id, {
                                  subject: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]">
                              Body
                            </label>
                            <textarea
                              rows={4}
                              className="mt-0.5 w-full resize-none bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                              placeholder="Write the full email body…"
                              value={s.config?.body ?? ""}
                              onChange={(e) =>
                                updateBranchStep("then", s.id, {
                                  body: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* TASK */}
                      {s.type === "TASK" && (
                        <input
                          className="mt-1 w-full bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                          placeholder="Branch task description…"
                          value={s.config?.text ?? ""}
                          onChange={(e) =>
                            updateBranchStep("then", s.id, {
                              text: e.target.value,
                            })
                          }
                        />
                      )}

                      {/* WAIT */}
                      {s.type === "WAIT" && (
                        <div className="mt-1 flex gap-2">
                          <input
                            type="number"
                            min={1}
                            className="w-16 bg-transparent text-[10px] text-slate-50 outline-none border border-slate-700/80 rounded-lg px-1 py-0.5"
                            value={s.config?.amount ?? ""}
                            onChange={(e) =>
                              updateBranchStep("then", s.id, {
                                amount: e.target.value,
                              })
                            }
                          />
                          <select
                            className={
                              selectBase + " flex-1 text-[10px] px-1 py-0.5"
                            }
                            value={s.config?.unit ?? "hours"}
                            onChange={(e) =>
                              updateBranchStep("then", s.id, {
                                unit: e.target.value,
                              })
                            }
                          >
                            <option className={optionClass} value="hours">
                              Hours
                            </option>
                            <option className={optionClass} value="days">
                              Days
                            </option>
                            <option className={optionClass} value="weeks">
                              Weeks
                            </option>
                            <option className={optionClass} value="months">
                              Months
                            </option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {(["SMS", "EMAIL", "TASK", "WAIT"] as StepType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addBranchStep("then", t)}
                      className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-100 hover:bg-emerald-500/20"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* ELSE */}
              <div className="rounded-xl border border-slate-600/80 bg-slate-900/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                  Else (condition is false)
                </p>

                <div className="mt-2 space-y-2">
                  {elseSteps.length === 0 && (
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      Optional. Add actions if the condition is false.
                    </p>
                  )}

                  {elseSteps.map((s, idx) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-slate-700/80 bg-slate-950/70 px-2 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold text-slate-50">
                          Step {idx + 1}: {s.type}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeBranchStep("else", s.id)}
                          className="rounded-full border border-slate-600/80 bg-slate-900/80 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--avillo-cream-muted)] hover:border-rose-400/80 hover:bg-rose-900/40 hover:text-rose-50"
                        >
                          Remove
                        </button>
                      </div>

                      {/* SMS */}
                      {s.type === "SMS" && (
                        <div className="mt-1 space-y-1">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]">
                            Text Message
                          </label>
                          <textarea
                            rows={3}
                            className="w-full resize-none bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                            placeholder="Ex: Hey {{firstName}}, thanks for reaching out — when are you free for a quick call?"
                            value={s.config?.text ?? ""}
                            onChange={(e) =>
                              updateBranchStep("else", s.id, {
                                text: e.target.value,
                              })
                            }
                          />
                          <p className="text-[8px] text-[var(--avillo-cream-muted)]">
                            Variables: <code>{"{{firstName}}"}</code>,{" "}
                            <code>{"{{agentName}}"}</code>,{" "}
                            <code>{"{{propertyAddress}}"}</code>
                          </p>
                        </div>
                      )}

                      {/* EMAIL */}
                      {s.type === "EMAIL" && (
                        <div className="mt-1 space-y-2">
                          <div>
                            <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]">
                              Subject
                            </label>
                            <input
                              className="mt-0.5 w-full bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                              placeholder="Ex: Quick market update for you"
                              value={s.config?.subject ?? ""}
                              onChange={(e) =>
                                updateBranchStep("else", s.id, {
                                  subject: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]">
                              Body
                            </label>
                            <textarea
                              rows={4}
                              className="mt-0.5 w-full resize-none bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                              placeholder="Write the full email body…"
                              value={s.config?.body ?? ""}
                              onChange={(e) =>
                                updateBranchStep("else", s.id, {
                                  body: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* TASK */}
                      {s.type === "TASK" && (
                        <input
                          className="mt-1 w-full bg-transparent text-[10px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                          placeholder="Branch task description…"
                          value={s.config?.text ?? ""}
                          onChange={(e) =>
                            updateBranchStep("else", s.id, {
                              text: e.target.value,
                            })
                          }
                        />
                      )}

                      {/* WAIT */}
                      {s.type === "WAIT" && (
                        <div className="mt-1 flex gap-2">
                          <input
                            type="number"
                            min={1}
                            className="w-16 bg-transparent text-[10px] text-slate-50 outline-none border border-slate-700/80 rounded-lg px-1 py-0.5"
                            value={s.config?.amount ?? ""}
                            onChange={(e) =>
                              updateBranchStep("else", s.id, {
                                amount: e.target.value,
                              })
                            }
                          />
                          <select
                            className={
                              selectBase + " flex-1 text-[10px] px-1 py-0.5"
                            }
                            value={s.config?.unit ?? "hours"}
                            onChange={(e) =>
                              updateBranchStep("else", s.id, {
                                unit: e.target.value,
                              })
                            }
                          >
                            <option className={optionClass} value="hours">
                              Hours
                            </option>
                            <option className={optionClass} value="days">
                              Days
                            </option>
                            <option className={optionClass} value="weeks">
                              Weeks
                            </option>
                            <option className={optionClass} value="months">
                              Months
                            </option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {(["SMS", "EMAIL", "TASK", "WAIT"] as StepType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addBranchStep("else", t)}
                      className="rounded-full border border-slate-600/80 bg-slate-900/80 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:text-amber-50"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="
              inline-flex items-center justify-center rounded-full
              border border-slate-600/80 bg-slate-900/80
              px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]
              text-[var(--avillo-cream-muted)] hover:text-slate-100 hover:border-slate-500
            "
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="
              inline-flex items-center justify-center rounded-full
              border border-amber-100/80 bg-amber-50/10
              px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]
              text-amber-100 shadow-[0_0_20px_rgba(248,250,252,0.18)]
              hover:bg-amber-50/20
            "
          >
            {isEditing ? "Update step" : "Save step"}
          </button>
        </div>
      </div>
    </div>
  );
}