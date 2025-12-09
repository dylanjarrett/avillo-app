// src/components/autopilot/StepModal.tsx
"use client";

import { useEffect, useState } from "react";

export type StepType = "SMS" | "EMAIL" | "TASK" | "WAIT" | "IF";

type BranchStep = {
  id: string;
  type: StepType;
  config: any;
};

type ConditionScope = "contact" | "listing" | "both";

type Props = {
  type: StepType | null;
  initialConfig?: any | null;
  initialThen?: BranchStep[] | null;
  initialElse?: BranchStep[] | null;
  // contact  -> only contact fields
  // listing  -> only listing fields
  // both/undefined -> show everything (manual workflows)
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

// For manual workflows we show everything
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
  return ALL_CONDITION_FIELDS; // manual / undefined
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
  const [form, setForm] = useState<any>(initialConfig ?? {});
  const [thenSteps, setThenSteps] = useState<BranchStep[]>(initialThen ?? []);
  const [elseSteps, setElseSteps] = useState<BranchStep[]>(initialElse ?? []);

  const isEditing = !!initialConfig;

  const conditionFields = getConditionFields(conditionScope);

  function update(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  // Value options for current field
  const valueOptions: string[] =
    (form.field && FIELD_VALUE_OPTIONS[form.field]) || [];

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

    // IF defaults
    if (type === "IF") {
      const availableFields =
        conditionFields.length > 0 ? conditionFields : ALL_CONDITION_FIELDS;

      // make sure existing field is allowed for this scope
      let field = initialConfig?.field as string | undefined;
      if (!field || !availableFields.some((f) => f.value === field)) {
        field = availableFields[0]?.value ?? "contact.stage";
      }

      // pick sensible value
      const allowedValues = FIELD_VALUE_OPTIONS[field] ?? [];
      let value = initialConfig?.value as string | undefined;
      if (!value || !allowedValues.includes(value)) {
        value = allowedValues[0] ?? "";
      }

      setForm({
        field,
        operator: initialConfig?.operator ?? "equals",
        value,
      });

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
      if (!form.field || !form.operator || !form.value) {
        alert("Select a field, operator, and value.");
        return;
      }

      onSave(
        {
          field: form.field,
          operator: form.operator,
          value: form.value,
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

  // shared select styling
  const selectBase =
    "bg-slate-950/90 text-[11px] text-slate-50 outline-none border border-slate-700/80 rounded-lg px-2 py-1";
  const optionClass = "bg-slate-900 text-slate-50";

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
                className="mt-1 w-full resize-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
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
        {type === "IF" && (
          <div className="space-y-4">
            {/* Condition */}
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Condition
              </label>
              <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                Example: If <strong>Contact stage</strong> is{" "}
                <strong>hot</strong>, then send a text. Otherwise, create a
                task.
              </p>

              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                {/* FIELD (scope aware) */}
                <select
                  className={selectBase + " flex-1"}
                  value={
                    form.field ?? conditionFields[0]?.value ?? "contact.stage"
                  }
                  onChange={(e) => {
                    const newField = e.target.value;
                    update("field", newField);
                    const firstVal = FIELD_VALUE_OPTIONS[newField]?.[0] ?? "";
                    update("value", firstVal);
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
                  className={selectBase + " flex-1"}
                  value={form.operator ?? "equals"}
                  onChange={(e) => update("operator", e.target.value)}
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

                {/* VALUE (dropdown locked to valid values) */}
                <select
                  className={selectBase + " flex-1"}
                  value={form.value ?? valueOptions[0] ?? ""}
                  onChange={(e) => update("value", e.target.value)}
                >
                  {valueOptions.map((v) => (
                    <option key={v} value={v} className={optionClass}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* THEN / ELSE branches */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* THEN */}
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

                      {/* BRANCH SMS – full editor style */}
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

                      {/* BRANCH EMAIL – subject + body */}
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

                      {/* BRANCH SMS – full editor style */}
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

                      {/* BRANCH EMAIL – subject + body */}
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