// src/app/(portal)/autopilot/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import StepModal, { StepType } from "@/components/autopilot/StepModal";
import { FilterPill } from "@/components/ui/filter-pill";

/* ------------------------------------
 * Types
 * -----------------------------------*/

type BranchStep = {
  id: string;
  type: StepType; // we won't nest IF inside IF in the UI, but shape allows it
  config: any;
};

type AutomationStep = {
  id: string;
  type: StepType;
  config: any;
  thenSteps?: BranchStep[];
  elseSteps?: BranchStep[];
};

type AutomationWorkflow = {
  id?: string;
  name: string;
  description: string;
  trigger: string | null;
  active: boolean;
  steps: AutomationStep[];
  createdAt?: string;
  updatedAt?: string;
};

/* ------------------------------------
 * Constants
 * -----------------------------------*/

const TRIGGERS = [
  {
    id: "NEW_CONTACT",
    label: "New contact created",
    desc: "Runs whenever a new contact is added to your CRM.",
  },
  {
    id: "LEAD_STAGE_CHANGE",
    label: "Stage changes (new → warm → hot)",
    desc: "Runs when a contact’s stage is updated.",
  },
  {
    id: "NEW_LISTING",
    label: "New listing added",
    desc: "Runs when you create a new listing.",
  },
  {
    id: "MANUAL_RUN",
    label: "Manual run",
    desc: "You trigger this workflow manually from a contact or listing.",
  },
];

const RECOMMENDED_TEMPLATES: {
  id: string;
  label: string;
  description: string;
  trigger: string;
  build: () => AutomationWorkflow;
}[] = [
  {
    id: "new-lead-24h",
    label: "New lead 24–48h follow-up",
    description:
      "Welcome SMS, same-day email, then a 24h follow-up task so no web lead slips through.",
    trigger: "NEW_CONTACT",
    build: () => ({
      name: "New lead 24–48h follow-up",
      description:
        "Automatically welcome new leads, send a follow-up email, and create a call task.",
      trigger: "NEW_CONTACT",
      active: true,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "SMS",
          config: {
            text:
              "Hey {{firstName}}, thanks for reaching out. I’d love to learn more about your plans — when are you free for a quick call?",
          },
        },
        {
          id: crypto.randomUUID(),
          type: "WAIT",
          config: { hours: 4, amount: 4, unit: "hours" },
        },
        {
          id: crypto.randomUUID(),
          type: "EMAIL",
          config: {
            subject: "Quick follow-up & next steps",
            body:
              "Hi {{firstName}},\n\nThanks again for reaching out. I pulled a few options that match what you’re looking for — when is a good time for a call to walk through them?\n\nBest,\n{{agentName}}",
          },
        },
        {
          id: crypto.randomUUID(),
          type: "WAIT",
          config: { hours: 24, amount: 24, unit: "hours" },
        },
        {
          id: crypto.randomUUID(),
          type: "TASK",
          config: {
            text: "Call {{firstName}} to confirm search criteria and timeline.",
          },
        },
      ],
    }),
  },
  {
    id: "hot-buyer-nurture",
    label: "Hot buyer weekly touches",
    description:
      "For hot buyers: a light weekly touch — market update, new listings, and a check-in.",
    trigger: "LEAD_STAGE_CHANGE",
    build: () => ({
      name: "Hot buyer weekly touches",
      description:
        "Keep hot buyers close with a weekly email and a scheduled call reminder.",
      trigger: "LEAD_STAGE_CHANGE",
      active: true,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "EMAIL",
          config: {
            subject: "New homes that match what you’re looking for",
            body:
              "Hi {{firstName}},\n\nA few new homes hit the market this week that match what you described. Want me to send over a short list and set up showings?\n\nBest,\n{{agentName}}",
          },
        },
        {
          id: crypto.randomUUID(),
          type: "WAIT",
          config: { hours: 72, amount: 72, unit: "hours" },
        },
        {
          id: crypto.randomUUID(),
          type: "TASK",
          config: {
            text:
              "Text or call {{firstName}} to see if they want to tour any of the new listings.",
          },
        },
      ],
    }),
  },
  {
    id: "past-client-checkin",
    label: "Past client quarterly check-in",
    description:
      "Quarterly touchpoint with past clients to keep referrals and repeat business flowing.",
    trigger: "MANUAL_RUN",
    build: () => ({
      name: "Past client quarterly check-in",
      description:
        "A quarterly email and reminder task to stay top-of-mind with your past clients.",
      trigger: "MANUAL_RUN",
      active: false,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "EMAIL",
          config: {
            subject: "Checking in — how’s everything going?",
            body:
              "Hi {{firstName}},\n\nI was thinking about you and wanted to check in. How are you liking the home, and how has the neighborhood been treating you?\n\nIf you ever have questions about the market, value, or future plans, I’m always here to help.\n\nBest,\n{{agentName}}",
          },
        },
        {
          id: crypto.randomUUID(),
          type: "WAIT",
          config: { hours: 48, amount: 48, unit: "hours" },
        },
        {
          id: crypto.randomUUID(),
          type: "TASK",
          config: {
            text:
              "Log response from {{firstName}} and note any upcoming plans (move, reno, refi, etc.).",
          },
        },
      ],
    }),
  },
];

/* ------------------------------------
 * Helpers
 * -----------------------------------*/

function triggerPlainSentence(trigger: string | null): string | null {
  switch (trigger) {
    case "NEW_CONTACT":
      return "When I add a new contact, I want this workflow to run.";
    case "LEAD_STAGE_CHANGE":
      return "When I move a contact to a new stage (new, warm, hot), I want this workflow to run.";
    case "NEW_LISTING":
      return "When I add a new listing, I want this workflow to run.";
    case "MANUAL_RUN":
      return "When I choose a contact or listing and hit “Run workflow”, I want this workflow to run.";
    default:
      return null;
  }
}

// maps trigger → which fields should be visible in IF step
function getConditionScopeForTrigger(
  trigger: string | null
): "contact" | "listing" | "both" | undefined {
  if (!trigger) return undefined;

  if (trigger === "NEW_LISTING") {
    return "listing";
  }

  if (trigger === "NEW_CONTACT" || trigger === "LEAD_STAGE_CHANGE") {
    return "contact";
  }

  if (trigger === "MANUAL_RUN") {
    // workflow can be run from contact OR listing
    return "both";
  }

  return undefined;
}

/* ------------------------------------
 * Page
 * -----------------------------------*/

export default function AutomationPage() {
  const [filter, setFilter] = useState<"all" | "active" | "paused">("active");
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [activeWorkflow, setActiveWorkflow] =
    useState<AutomationWorkflow | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workspaceOpenMobile, setWorkspaceOpenMobile] = useState(false);
  const [stepModalType, setStepModalType] = useState<StepType | null>(null);
  const [editingStep, setEditingStep] = useState<AutomationStep | null>(null);

  // ---------- Derived counts for workflow filter pills ----------
  const totalWorkflows = workflows.length;
  const activeWorkflowsCount = workflows.filter((w) => w.active).length;
  const pausedWorkflowsCount = workflows.filter((w) => !w.active).length;

  // ---------- Builder completeness (for the mini progress rail) ----------
  const builderHasName = !!activeWorkflow?.name.trim();
  const builderHasTrigger = !!activeWorkflow?.trigger;
  const builderHasSteps = (activeWorkflow?.steps.length ?? 0) > 0;

  // ------- Helpers -------

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth < 1024;

  function openWorkspaceForSelection() {
    if (isMobile()) {
      setWorkspaceOpenMobile(true);
    }
  }

  function backToList() {
    setWorkspaceOpenMobile(false);
    setActiveWorkflow(null);
    setSelectedId(null);
  }

  function startNewWorkflow() {
    const fresh: AutomationWorkflow = {
      id: undefined,
      name: "",
      description: "",
      trigger: null,
      active: true,
      steps: [],
    };
    setActiveWorkflow(fresh);
    setSelectedId("new");
    openWorkspaceForSelection();
  }

  function selectWorkflow(id: string | "new") {
    if (id === "new") {
      startNewWorkflow();
      return;
    }
    const found = workflows.find((w) => w.id === id) ?? null;
    setSelectedId(id);
    setActiveWorkflow(
      found
        ? {
            ...found,
            steps: found.steps ?? [],
          }
        : null
    );
    openWorkspaceForSelection();
  }

  function openStepModal(type: StepType, step?: AutomationStep) {
    if (step) {
      setEditingStep(step);
      setStepModalType(step.type);
    } else {
      setEditingStep(null);
      setStepModalType(type);
    }
  }

  function handleStepSave(
    config: any,
    thenSteps?: BranchStep[],
    elseSteps?: BranchStep[]
  ) {
    if (!activeWorkflow || !stepModalType) return;

    // If editing an existing step, update it
    if (editingStep) {
      const updatedSteps = activeWorkflow.steps.map((s) => {
        if (s.id !== editingStep.id) return s;

        if (editingStep.type === "IF") {
          return {
            ...s,
            config,
            thenSteps: thenSteps ?? s.thenSteps ?? [],
            elseSteps: elseSteps ?? s.elseSteps ?? [],
          };
        }

        return {
          ...s,
          config,
        };
      });

      setActiveWorkflow({
        ...activeWorkflow,
        steps: updatedSteps,
      });
    } else {
      // Otherwise, append a new step
      const newStep: AutomationStep = {
        id: crypto.randomUUID(),
        type: stepModalType,
        config,
      };

      if (stepModalType === "IF") {
        newStep.thenSteps = thenSteps ?? [];
        newStep.elseSteps = elseSteps ?? [];
      }

      setActiveWorkflow({
        ...activeWorkflow,
        steps: [...(activeWorkflow.steps ?? []), newStep],
      });
    }

    setStepModalType(null);
    setEditingStep(null);
  }

  function removeStep(stepId: string) {
    if (!activeWorkflow) return;
    setActiveWorkflow({
      ...activeWorkflow,
      steps: activeWorkflow.steps.filter((s) => s.id !== stepId),
    });
  }

  function applyTemplate(templateId: string) {
    const template = RECOMMENDED_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const wf = template.build();
    setActiveWorkflow(wf);
    setSelectedId("new");
    openWorkspaceForSelection();
  }

  // ------- Load workflows from API (best-effort) -------

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflows() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/automations").catch(() => null);
        if (!res || !res.ok) {
          // API may not exist yet; keep local-only mode
          if (!cancelled) {
            setWorkflows([]);
          }
          return;
        }
        const data = await res.json().catch(() => null);

        const loaded: AutomationWorkflow[] = (data?.workflows ?? []).map(
          (w: any) => ({
            id: w.id,
            name: w.name ?? "",
            description: w.description ?? "",
            trigger: w.trigger ?? null,
            active: w.active ?? true,
            steps: (w.steps ?? []).map((s: any) => ({
              id: s.id ?? crypto.randomUUID(),
              type: s.type as StepType,
              config: s.config ?? {},
              thenSteps: s.thenSteps ?? [],
              elseSteps: s.elseSteps ?? [],
            })),
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
          })
        );

        if (!cancelled) {
          setWorkflows(loaded);
          setSelectedId(null);
          setActiveWorkflow(null);
        }
      } catch (err: any) {
        console.error("Load workflows error", err);
        if (!cancelled) {
          setError(
            err?.message ||
              "We couldn't load your workflows yet. You can still design new ones."
          );
          setWorkflows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkflows();

    return () => {
      cancelled = true;
    };
  }, []);

  // ------- Derived: filtered workflows for list -------

  const filteredWorkflows = useMemo(() => {
    let list = workflows.slice();

    if (filter === "active") {
      list = list.filter((w) => w.active);
    } else if (filter === "paused") {
      list = list.filter((w) => !w.active);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((w) => {
        const tLabel = TRIGGERS.find((t) => t.id === w.trigger)?.label ?? "";
        return (
          w.name.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q) ||
          tLabel.toLowerCase().includes(q)
        );
      });
    }

    // if creating a new workflow, bubble it to the top
    if (selectedId === "new" && activeWorkflow && !activeWorkflow.id) {
      list = [
        {
          ...activeWorkflow,
          id: "new",
        },
        ...list,
      ];
    }

    return list;
  }, [workflows, filter, search, selectedId, activeWorkflow]);

  // ------- Save / Delete -------

  async function handleSave() {
    if (!activeWorkflow) return;

    if (!activeWorkflow.name.trim()) {
      alert("Give this workflow a name first.");
      return;
    }

    if (!activeWorkflow.trigger) {
      alert("Select a trigger so Avillo knows when to run this workflow.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeWorkflow.id,
          name: activeWorkflow.name,
          description: activeWorkflow.description,
          trigger: activeWorkflow.trigger,
          active: activeWorkflow.active,
          steps: activeWorkflow.steps,
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        const data = await res?.json().catch(() => null);
        throw new Error(
          data?.error ||
            "We couldn't save this workflow yet. Double-check your connection and try again."
        );
      }

      const data = await res.json();
      const saved = data.workflow as any;

      const normalized: AutomationWorkflow = {
        id: saved.id,
        name: saved.name ?? activeWorkflow.name,
        description: saved.description ?? activeWorkflow.description,
        trigger: saved.trigger ?? activeWorkflow.trigger,
        active: saved.active ?? activeWorkflow.active,
        steps: (saved.steps ?? activeWorkflow.steps ?? []).map((s: any) => ({
          id: s.id ?? crypto.randomUUID(),
          type: s.type as StepType,
          config: s.config ?? {},
          thenSteps: s.thenSteps ?? [],
          elseSteps: s.elseSteps ?? [],
        })),
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };

      setWorkflows((prev) => {
        const idx = prev.findIndex((w) => w.id === normalized.id);
        if (idx === -1) return [normalized, ...prev];
        const next = [...prev];
        next[idx] = normalized;
        return next;
      });

      setActiveWorkflow(normalized);
      setSelectedId(normalized.id!);
    } catch (err: any) {
      console.error("Save workflow error", err);
      setError(
        err?.message || "We couldn't save this workflow. Try again in a moment."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activeWorkflow) {
      backToList();
      return;
    }

    if (!activeWorkflow.id) {
      backToList();
      return;
    }

    const confirmed = window.confirm(
      "Delete this workflow? This can’t be undone."
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch("/api/automations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeWorkflow.id }),
      }).catch(() => null);

      if (!res || !res.ok) {
        const data = await res?.json().catch(() => null);
        throw new Error(
          data?.error ||
            "We couldn't delete this workflow. Try again in a moment."
        );
      }

      setWorkflows((prev) =>
        prev.filter((w) => w.id !== activeWorkflow.id)
      );
      backToList();
    } catch (err: any) {
      console.error("Delete workflow error", err);
      setError(
        err?.message ||
          "We couldn't delete this workflow. Try again in a moment."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------
   * Render
   * -----------------------------------*/

  const triggerSentence =
    activeWorkflow?.trigger ?? null
      ? triggerPlainSentence(activeWorkflow?.trigger ?? null)
      : null;

  const conditionScopeForActive = getConditionScopeForTrigger(
    activeWorkflow?.trigger ?? null
  );

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Autopilot"
        title="Automate your busy work."
        subtitle="Let Avillo monitor your leads, clients, and listings — then deliver the right text, email, or task at the perfect moment. No missed opportunities. No manual busywork."
      />

      <section className="space-y-5">
        {/* Top bar: label + actions */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Workflows & playbooks
            </p>
            <p className="mt-1 max-w-xl text-xs text-[var(--avillo-cream-soft)]">
              Build simple, powerful automations that connect your CRM and
              listings to real-world actions. Start from templates or craft your
              own — no tech skills needed.
            </p>
          </div>

          <button
            type="button"
            onClick={startNewWorkflow}
            className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20"
          >
            + New workflow
          </button>
        </div>

        {/* Error bar */}
        {error && (
          <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
            {error}
          </div>
        )}

        {/* Filters + search */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex flex-wrap gap-2 text-xs">
            <FilterPill
              label="All"
              count={totalWorkflows}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterPill
              label="Active"
              count={activeWorkflowsCount}
              active={filter === "active"}
              onClick={() => setFilter("active")}
            />
            <FilterPill
              label="Paused"
              count={pausedWorkflowsCount}
              active={filter === "paused"}
              onClick={() => setFilter("paused")}
            />
          </div>

          <div className="w-full md:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, trigger, description..."
              className="avillo-input w-full text-slate-50"
            />
          </div>
        </div>

        {/* Main layout: list + builder */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
          {/* LEFT: WORKFLOW LIST */}
          <div
            className={
              "relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "hidden" : "block") +
              " lg:block"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Workflow library
              </p>
              <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                {filteredWorkflows.length}{" "}
                {filteredWorkflows.length === 1 ? "workflow" : "workflows"}
              </p>
            </div>

            <div className="space-y-2 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
              {loading && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Loading your workflows…
                </p>
              )}

              {!loading && filteredWorkflows.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No workflows yet. Click{" "}
                  <span className="font-semibold">“New workflow”</span> above or
                  start from a template on the right.
                </p>
              )}

              {!loading &&
                filteredWorkflows.map((wf) => {
                  const isSelected =
                    (selectedId === "new" && wf.id === "new") ||
                    (wf.id && wf.id === selectedId);

                  const triggerLabel =
                    TRIGGERS.find((t) => t.id === wf.trigger)?.label ??
                    "Manual / custom";

                  return (
                    <button
                      key={wf.id ?? "new-workflow-row"}
                      type="button"
                      onClick={() =>
                        selectWorkflow(
                          (wf.id as string | undefined) ?? ("new" as const)
                        )
                      }
                      className={
                        "w-full rounded-xl border px-4 py-3 text-left transition-colors " +
                        (isSelected
                          ? "border-amber-200/80 bg-slate-900/90 shadow-[0_0_28px_rgba(248,250,252,0.22)]"
                          : "border-slate-800/80 bg-slate-900/60 hover:border-amber-100/70 hover:bg-slate-900/90")
                      }
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[12px] font-semibold text-slate-50">
                            {wf.name || "Untitled workflow"}
                          </p>
                          <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                            {triggerLabel}
                          </p>
                        </div>

                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                            (wf.active
                              ? "border-emerald-300/80 bg-emerald-500/10 text-emerald-100"
                              : "border-slate-500/80 bg-slate-800/60 text-slate-200")
                          }
                        >
                          {wf.active ? "Active" : "Paused"}
                        </span>
                      </div>

                      {wf.description && (
                        <p className="mt-2 line-clamp-2 text-[11px] text-[var(--avillo-cream-soft)]">
                          {wf.description}
                        </p>
                      )}

                      <p className="mt-2 text-[10px] text-[var(--avillo-cream-muted)]">
                        {wf.steps.length}{" "}
                        {wf.steps.length === 1 ? "step" : "steps"}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* RIGHT: SIMPLE BUILDER */}
          <div
            className={
              "relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "block" : "hidden") +
              " lg:block"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

            {/* Empty state */}
            {!activeWorkflow && (
              <div className="flex h-full flex-col justify-between">
                <div className="flex flex-col items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  <p className="font-semibold text-[var(--avillo-cream-soft)]">
                    No workflow selected
                  </p>
                  <p className="mt-1 max-w-xs">
                    Choose a workflow on the left, or start with a recommended
                    playbook below. You can rename and tweak anything later.
                  </p>
                </div>

                {/* Recommended templates summary */}
                <div className="mt-4 space-y-2 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    Recommended workflow templates
                  </p>
                  <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                    One-click starting points you can tweak for your market and
                    style.
                  </p>

                  <div className="mt-2 space-y-2">
                    {RECOMMENDED_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t.id)}
                        className="w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-left text-[11px] text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:bg-slate-900/90"
                      >
                        <p className="font-semibold text-slate-50">
                          {t.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                          {t.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Active workflow detail */}
            {activeWorkflow && (
              <div className="flex h-full flex-col gap-4 text-xs text-[var(--avillo-cream-soft)]">
                {/* Mobile back */}
                <div className="relative mb-1 lg:hidden">
                  <button
                    type="button"
                    onClick={backToList}
                    className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-[var(--avillo-cream-soft)] shadow-[0_0_18px_rgba(15,23,42,0.9)] hover:border-amber-100/80 hover:text-amber-50"
                  >
                    <span className="text-xs">←</span>
                    <span>Back</span>
                  </button>
                </div>
                <div className="h-2 lg:hidden" />

                {/* Mini progress rail */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                    Simple builder
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                    Just follow the steps from left to right. Green = done.
                  </p>

                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <BuilderStepPill
                      step={1}
                      label="Name"
                      done={builderHasName}
                    />
                    <BuilderStepPill
                      step={2}
                      label="When it runs"
                      done={builderHasTrigger}
                    />
                    <BuilderStepPill
                      step={3}
                      label="What it does"
                      done={builderHasSteps}
                    />
                    <BuilderStepPill
                      step={4}
                      label="Turn on"
                      done={activeWorkflow.active}
                    />
                  </div>
                </div>

                {/* Step 1: Name & description */}
                <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    1. Give this workflow a friendly name
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                        Workflow name
                      </label>
                      <input
                        value={activeWorkflow.name}
                        onChange={(e) =>
                          setActiveWorkflow({
                            ...activeWorkflow,
                            name: e.target.value,
                          })
                        }
                        placeholder="Ex: New online lead follow-up"
                        className="avillo-input w-full text-slate-50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                        Short description
                      </label>
                      <textarea
                        rows={2}
                        value={activeWorkflow.description}
                        onChange={(e) =>
                          setActiveWorkflow({
                            ...activeWorkflow,
                            description: e.target.value,
                          })
                        }
                        placeholder="Ex: Welcomes new website leads and reminds me to call in 24 hours."
                        className="avillo-input w-full resize-none text-slate-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 2: Trigger */}
                <div className="space-y-2 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    2. When should this run?
                  </p>
                  <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                    Tap the one sentence that sounds most like what you want.
                    Example: “When I add a new contact, I want this workflow to
                    run.”
                  </p>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {TRIGGERS.map((t) => {
                      const active = activeWorkflow.trigger === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setActiveWorkflow({
                              ...activeWorkflow,
                              trigger: t.id,
                            })
                          }
                          className={
                            "rounded-xl border px-3 py-2 text-left text-[10px] transition-colors " +
                            (active
                              ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.32)]"
                              : "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50")
                          }
                        >
                          <p className="text-[11px] font-semibold text-slate-50">
                            {t.label}
                          </p>
                          <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                            {t.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {triggerSentence && (
                    <p className="mt-2 text-[10px] text-[var(--avillo-cream-soft)]">
                      <span className="font-semibold">Plain language:</span>{" "}
                      {triggerSentence}
                    </p>
                  )}
                </div>

                {/* Step 3: Steps (what it actually does) */}
                <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    3. What should happen, in order?
                  </p>
                  <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                    Steps run from top to bottom. Think: text → wait → email →
                    task. Tap a step to edit it, or remove it with one click.
                  </p>

                  <div className="mt-1 space-y-2">
                    {activeWorkflow.steps.length === 0 && (
                      <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">
                        No steps yet. Start by adding a welcome SMS or email
                        below.
                      </p>
                    )}

                    {activeWorkflow.steps.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openStepModal(s.type, s)}
                        className="w-full rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-left hover:border-amber-100/70 hover:bg-slate-900/90"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-slate-50">
                            Step {i + 1}:{" "}
                            {s.type === "IF" ? "IF / Branch" : s.type}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeStep(s.id);
                            }}
                            className="rounded-full border border-slate-600/80 bg-slate-900/80 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--avillo-cream-muted)] hover:border-rose-400/80 hover:bg-rose-900/40 hover:text-rose-50"
                          >
                            Remove
                          </button>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-[var(--avillo-cream-muted)]">
                          {s.type === "SMS" && s.config?.text}
                          {s.type === "EMAIL" && s.config?.subject}
                          {s.type === "TASK" && s.config?.text}
                          {s.type === "WAIT" &&
                            `Wait ${s.config?.hours ?? "?"} hours`}
                          {s.type === "IF" &&
                            `If ${s.config?.field ?? "field"} ${
                              s.config?.operator ?? "is"
                            } ${s.config?.value ?? ""} (then ${
                              s.thenSteps?.length ?? 0
                            } step${
                              (s.thenSteps?.length ?? 0) === 1 ? "" : "s"
                            }, else ${s.elseSteps?.length ?? 0} step${
                              (s.elseSteps?.length ?? 0) === 1 ? "" : "s"
                            })`}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Add step buttons */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["SMS", "EMAIL", "TASK", "WAIT", "IF"] as StepType[]).map(
                      (t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => openStepModal(t)}
                          className="rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:text-amber-50"
                        >
                          + {t === "IF" ? "IF / Branch" : t}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Step 4: Turn on + save */}
                <div className="mt-auto flex flex-col gap-3 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold text-amber-100/90">
                        4. Turn it on & save
                      </p>
                      <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                        You can pause a workflow anytime. Saving will update it
                        everywhere instantly.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setActiveWorkflow({
                          ...activeWorkflow,
                          active: !activeWorkflow.active,
                        })
                      }
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                        (activeWorkflow.active
                          ? "border-emerald-300/80 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-500/80 bg-slate-800/60 text-slate-200")
                      }
                    >
                      {activeWorkflow.active ? "Active" : "Paused"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="inline-flex items-center justify-center rounded-full border border-red-400/80 bg-red-500/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {activeWorkflow.id
                        ? "Delete workflow"
                        : "Discard new workflow"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Step modal (add + edit) */}
      <StepModal
        type={stepModalType}
        initialConfig={editingStep?.config ?? null}
        initialThen={
          editingStep?.type === "IF" ? editingStep.thenSteps ?? [] : null
        }
        initialElse={
          editingStep?.type === "IF" ? editingStep.elseSteps ?? [] : null
        }
        conditionScope={conditionScopeForActive}
        onClose={() => {
          setStepModalType(null);
          setEditingStep(null);
        }}
        onSave={handleStepSave}
      />
    </div>
  );
}

/* ------------------------------------
 * Small builder pill
 * -----------------------------------*/

type BuilderStepPillProps = {
  step: number;
  label: string;
  done: boolean;
};

function BuilderStepPill({ step, label, done }: BuilderStepPillProps) {
  return (
    <div
      className={
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] " +
        (done
          ? "border-emerald-300/80 bg-emerald-500/10 text-emerald-100"
          : "border-slate-600/80 bg-slate-900/80 text-[var(--avillo-cream-muted)]")
      }
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">
        {step}
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}