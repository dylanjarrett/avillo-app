//app/(portal)/autopilot/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import StepModal, { StepType } from "@/components/autopilot/StepModal";
import { FilterPill } from "@/components/ui/filter-pill";
import { useAutopilotMobileWorkspaceScroll } from "@/hooks/useAutopilotMobileWorkspaceScroll";

const UpgradeModal = require("@/components/billing/UpgradeModal").default as any;

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
  effectiveActive?: boolean;
  lockedReason?: string | null;
  steps: AutomationStep[];
  createdAt?: string;
  updatedAt?: string;
};

type ConditionConfig = {
  field: string;
  operator: "equals" | "not_equals";
  value: string;
};

type AccountMe = {
  id?: string;
  email?: string | null;
  plan?: string | null;
  avilloPhone?: string | null;
  entitlements?: Record<string, any> | null;
  [key: string]: any;
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
    id: "LISTING_CREATED",
    label: "New listing added",
    desc: "Runs when you create a new listing and attach a seller. Only the seller contact is used.",
  },
  {
    id: "LISTING_STAGE_CHANGE",
    label: "Stage changes (draft → active → pending → closed)",
    desc: "Runs when a listing's stage is updated. Only the seller contact is used.",
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
    id: "new-contact-speed-to-lead",
    label: "New online lead follow-up",
    description:
      "Requires SMS. Instantly texts a new lead, then creates a next-day follow-up task for you.",
    trigger: "NEW_CONTACT",
    build: () => ({
      name: "New online lead follow-up",
      description:
        "Automatically welcome new leads by text, then create a task for me to follow up one day later.",
      trigger: "NEW_CONTACT",
      active: true,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "SMS",
          config: {
            text:
              "Hey {{firstName}} — thanks for reaching out. I can help with next steps.\n\nBest way to connect is call/text {{agentPhone}}.",
          },
        },
        {
          id: crypto.randomUUID(),
          type: "WAIT",
          config: { hours: 24, amount: 1, unit: "days" },
        },
        {
          id: crypto.randomUUID(),
          type: "TASK",
          config: {
            text:
              "Call {{firstName}} to confirm their search criteria, price range, and timeline.",
          },
        },
      ],
    }),
  },

  {
    id: "hot-buyer-stage-change",
    label: "Buyer follow-up when stage changes to HOT",
    description:
      "Requires SMS. When a buyer becomes HOT, send a focused text and reminder to line up showings.",
    trigger: "LEAD_STAGE_CHANGE",
    build: () => ({
      name: "Buyer follow-up (stage = HOT)",
      description:
        "When I move a contact to HOT and they’re marked as a buyer, send them a focused text and remind me to line up showings.",
      trigger: "LEAD_STAGE_CHANGE",
      active: true,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "IF",
          config: {
            join: "AND",
            conditions: [
              {
                field: "contact.clientRole",
                operator: "equals",
                value: "buyer",
              },
              {
                field: "contact.stage",
                operator: "equals",
                value: "hot",
              },
            ],
          },
          thenSteps: [
            {
              id: crypto.randomUUID(),
              type: "SMS",
              config: {
                text:
                  "Hey {{firstName}} — since you're actively looking, I’d love to line up a few showings that really fit what you want. Call or text me at {{agentPhone}} and we’ll get it set up.",
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
                  "Text or call {{firstName}} directly to confirm showings for this week.",
              },
            },
          ],
          elseSteps: [],
        },
      ],
    }),
  },

  {
    id: "new-contact-client-follow-up-task",
    label: "New client follow-up task",
    description:
      "A simple no-SMS workflow that reminds you to follow up with new client contacts the next day.",
    trigger: "NEW_CONTACT",
    build: () => ({
      name: "New client follow-up task",
      description:
        "When I add a new client contact, wait one day and remind me to reach out personally.",
      trigger: "NEW_CONTACT",
      active: true,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "IF",
          config: {
            join: "AND",
            conditions: [
              {
                field: "contact.relationshipType",
                operator: "equals",
                value: "client",
              },
            ],
          },
          thenSteps: [
            {
              id: crypto.randomUUID(),
              type: "WAIT",
              config: { amount: 1, unit: "days" },
            },
            {
              id: crypto.randomUUID(),
              type: "TASK",
              config: {
                text:
                  "Follow up with {{firstName}} and confirm their goals, timeline, and next steps.",
              },
            },
          ],
          elseSteps: [],
        },
      ],
    }),
  },

  {
    id: "new-listing-seller-followup-task",
    label: "New listing — seller follow-up task",
    description:
      "A no-SMS workflow that reminds you to check in with your seller shortly after listing their home.",
    trigger: "LISTING_CREATED",
    build: () => ({
      name: "New listing — seller follow-up task",
      description:
        "After creating a new listing, wait two days and remind me to check in with the seller about activity and expectations.",
      trigger: "LISTING_CREATED",
      active: true,
      steps: [
        {
          id: crypto.randomUUID(),
          type: "WAIT",
          config: { amount: 2, unit: "days" },
        },
        {
          id: crypto.randomUUID(),
          type: "TASK",
          config: {
            text:
              "Check in with {{firstName}} about prep, early activity, and expectations for {{propertyAddress}}.",
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
      return "When I move a contact to a new stage (new, warm, hot, past), I want this workflow to run.";
    case "LISTING_CREATED":
      return "When I add a new listing and attach a seller, I want this workflow to run.";
    case "LISTING_STAGE_CHANGE":
      return "When I move a listing to a new stage (draft, active, pending, closed), I want this workflow to run.";
    default:
      return null;
  }
}

function formatWait(config: any): string {
  const amountRaw = config?.amount;
  const unitRaw = config?.unit;

  const amount =
    typeof amountRaw === "number" ? amountRaw : Number.parseFloat(String(amountRaw ?? ""));
  const unit = (unitRaw as string | undefined)?.toLowerCase();

  const allowed = new Set(["hours", "days", "weeks", "months"]);

  // ✅ Preferred: show exactly what the user chose
  if (Number.isFinite(amount) && amount > 0 && unit && allowed.has(unit)) {
    const singular = unit.endsWith("s") ? unit.slice(0, -1) : unit;
    const label = amount === 1 ? singular : unit;
    return `Wait ${amount} ${label}`;
  }
  const hoursRaw = config?.hours;
  const hours =
    typeof hoursRaw === "number" ? hoursRaw : Number.parseFloat(String(hoursRaw ?? ""));
  if (Number.isFinite(hours) && hours > 0) return `Wait ${hours} hours`;
  return "Wait ?";
}

function getConditionScopeForTrigger(
  trigger: string | null
): "contact" | "listing" | "both" | undefined {
  if (!trigger) return undefined;
  if (trigger === "LISTING_CREATED" || trigger === "LISTING_STAGE_CHANGE") return "listing";
  if (trigger === "NEW_CONTACT" || trigger === "LEAD_STAGE_CHANGE") return "contact";
  return undefined;
}

function isWorkflowBlank(wf: AutomationWorkflow | null): boolean {
  if (!wf) return true;
  const hasName = wf.name.trim().length > 0;
  const hasDesc = wf.description.trim().length > 0;
  const hasTrigger = !!wf.trigger;
  const hasSteps = (wf.steps?.length ?? 0) > 0;
  return !hasName && !hasDesc && !hasTrigger && !hasSteps;
}

function safeHasAutopilotEntitlement(account: AccountMe | null): boolean {
  if (!account) return false;
  const ent = (account.entitlements ?? {}) as any;
  return Boolean(ent.isPaidTier);
}

function workflowHasSmsSteps(steps: AutomationStep[] | BranchStep[] | undefined): boolean {
  if (!Array.isArray(steps) || !steps.length) return false;

  return steps.some((step: any) => {
    if (step?.type === "SMS") return true;

    const thenHasSms = Array.isArray(step?.thenSteps) && workflowHasSmsSteps(step.thenSteps);
    if (thenHasSms) return true;

    const elseHasSms = Array.isArray(step?.elseSteps) && workflowHasSmsSteps(step.elseSteps);
    if (elseHasSms) return true;

    return false;
  });
}

/* ------------------------------------
 * Page
 * -----------------------------------*/

export default function AutomationPage() {
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<AutomationWorkflow | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workspaceOpenMobile, setWorkspaceOpenMobile] = useState(false);
  const [stepModalType, setStepModalType] = useState<StepType | null>(null);
  const [editingStep, setEditingStep] = useState<AutomationStep | null>(null);

  const { listHeaderRef, workspaceRef, scrollToWorkspace, scrollBackToListHeader } =
    useAutopilotMobileWorkspaceScroll();

  // Entitlements
  const [account, setAccount] = useState<AccountMe | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const hasAutopilot = safeHasAutopilotEntitlement(account);
  const hasProvisionedSmsNumber = Boolean(account?.avilloPhone);
  const phoneStatusLoading = accountLoading;

  function openUpgrade(reason?: string) {
    // pass reason through if your modal uses it (it will just ignore if not)
    setUpgradeOpen(true);
    // you can also store reason in state if your modal expects it; keeping minimal to not break.
    void reason;
  }

  function requireAutopilotOrUpgrade(reason: string): boolean {
    if (accountLoading) return false; // avoid weird flash; just ignore clicks until loaded
    if (hasAutopilot) return true;
    openUpgrade(reason);
    return false;
  }

  // ---------- Derived counts for workflow filter pills ----------
  const totalWorkflows = workflows.length;

const isEffectivelyActive = (w: AutomationWorkflow) =>
  (w.effectiveActive ?? w.active) === true;

const activeWorkflowsCount = workflows.filter(isEffectivelyActive).length;
const pausedWorkflowsCount = workflows.filter((w) => !isEffectivelyActive(w)).length;

  // ---------- Builder completeness (for the mini progress rail) ----------
  const builderHasName = !!activeWorkflow?.name.trim();
  const builderHasTrigger = !!activeWorkflow?.trigger;
  const builderHasSteps = (activeWorkflow?.steps.length ?? 0) > 0;

  // ------- Scroll refs (Listings-like card scroll) -------
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);

  // ------- Load /api/account/me -------
  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
        setAccountLoading(true);
        const res = await fetch("/api/account/me").catch(() => null);
        if (!res || !res.ok) {
          if (!cancelled) setAccount(null);
          return;
        }
        const raw = (await res.json().catch(() => null)) as any;
        if (!raw) {
          if (!cancelled) setAccount(null);
          return;
        }

        // Normalize /api/account/me shape into what this page expects
        const normalized: AccountMe = {
          id: raw?.user?.id,
          email: raw?.user?.email ?? null,
          plan: raw?.workspace?.billing?.plan ?? null,
          avilloPhone: raw?.user?.avilloPhone ?? null,
          entitlements: raw?.entitlements ?? null,
        };

        if (!cancelled) setAccount(normalized);
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------- Helpers -------
  function openWorkspaceForSelection() {
    setWorkspaceOpenMobile(true);
    scrollToWorkspace();
  }

  function backToList() {
    scrollBackToListHeader(() => {
      setWorkspaceOpenMobile(false);
      setActiveWorkflow(null);
      setSelectedId(null);
    });
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
    const targetType = step?.type ?? type;

     if (targetType === "SMS" && !phoneStatusLoading && !hasProvisionedSmsNumber) {
       alert("To use SMS steps, first claim your Avillo number from the Comms page.");
      return;
     }

     if (step) {
      setEditingStep(step);
      setStepModalType(step.type);
          } else {
      setEditingStep(null);
      setStepModalType(type);      
    }
  }

  function handleStepSave(config: any, thenSteps?: BranchStep[], elseSteps?: BranchStep[]) {
    if (!activeWorkflow || !stepModalType) return;

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

        return { ...s, config };
      });

      setActiveWorkflow({ ...activeWorkflow, steps: updatedSteps });
    } else {
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
    const hasSmsStep = workflowHasSmsSteps(wf.steps);

    if (hasSmsStep && !phoneStatusLoading && !hasProvisionedSmsNumber) {
      alert("This template includes SMS. To use SMS steps, first claim your Avillo number from the Comms page.");
      return;
    }

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
          if (!cancelled) setWorkflows([]);
          return;
        }

        const data = await res.json().catch(() => null);

        const rawList: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.automations)
          ? data.automations
          : [];

        const loaded: AutomationWorkflow[] = rawList.map((w: any) => {
          const stepArray: any[] = w.steps?.steps ?? []; // automationStepGroup.steps

          return {
            id: w.id,
            name: w.name ?? "",
            description: w.description ?? "",
            trigger: w.trigger ?? null,

            // DB truth
            active: w.active ?? true,

            // UI truth coming from API (forced paused when plan can't run)
            effectiveActive: typeof w.effectiveActive === "boolean" ? w.effectiveActive : (w.active ?? true),
            lockedReason: w.lockedReason ?? null,

            steps: stepArray.map((s: any) => ({
              id: s.id ?? crypto.randomUUID(),
              type: s.type as StepType,
              config: s.config ?? {},
              thenSteps: s.thenSteps ?? [],
              elseSteps: s.elseSteps ?? [],
            })),
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
          };
        });

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

    if (filter === "active") list = list.filter((w) => (w.effectiveActive ?? w.active) === true);
    else if (filter === "paused") list = list.filter((w) => (w.effectiveActive ?? w.active) !== true);

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

    // Bubble unsaved "new" workflow to top
    if (selectedId === "new" && activeWorkflow && !activeWorkflow.id) {
      list = [{ ...activeWorkflow, id: "new" }, ...list];
    }

    return list;
  }, [workflows, filter, search, selectedId, activeWorkflow]);

  // ✅ Listings-style desktop-only: keep selected workflow row visible inside LEFT card scroll area
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) return; // desktop only
    if (!selectedId) return;

    const container = listScrollRef.current;
    if (!container) return;

    const el = container.querySelector<HTMLElement>(`[data-workflow-id="${selectedId}"]`);
    if (!el) return;

    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();

    const isAbove = r.top < c.top;
    const isBelow = r.bottom > c.bottom;

    if (isAbove || isBelow) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId, filteredWorkflows.length]);

  // ------- Save / Delete / Run -------
  async function handleSave() {
    if (!requireAutopilotOrUpgrade("save_workflow")) return;
    if (!activeWorkflow) return;

    const wfToSave = activeWorkflow;

    if (!wfToSave.name.trim()) {
      alert("Give this workflow a name first.");
      return;
    }

    if (!wfToSave.trigger) {
      alert("Select a trigger so Avillo knows when to run this workflow.");
      return;
    }

    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;

    // 🔼 Mobile: collapse + scroll back immediately
    if (isMobile) {
      setActiveWorkflow(null);
      setSelectedId(null);
      setWorkspaceOpenMobile(false);
      scrollBackToListHeader();
    }

    const isNew = !wfToSave.id || selectedId === "new";

    const payload = {
      name: wfToSave.name,
      description: wfToSave.description,
      trigger: wfToSave.trigger,
      triggerConfig: {},
      entryConditions: {},
      exitConditions: {},
      schedule: {},
      active: wfToSave.active,
      status: "draft",
      reEnroll: true,
      timezone: null,
      folder: null,
      steps: wfToSave.steps,
    };

    try {
      setSaving(true);
      setError(null);

      const url = isNew ? "/api/automations" : `/api/automations/${wfToSave.id}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (!res || !res.ok) {
        const data = await res?.json().catch(() => null);
        throw new Error(
          data?.error ||
            "We couldn't save this workflow yet. Double-check your connection and try again."
        );
      }

      const saved = await res.json();

      const normalized: AutomationWorkflow = {
      id: saved.id,
      name: saved.name ?? wfToSave.name,
      description: saved.description ?? wfToSave.description,
      trigger: saved.trigger ?? wfToSave.trigger,

      active: saved.active ?? wfToSave.active,
      effectiveActive:
        typeof saved.effectiveActive === "boolean"
          ? saved.effectiveActive
          : (saved.active ?? wfToSave.active),
      lockedReason: saved.lockedReason ?? null,

      steps: wfToSave.steps,
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

      if (!isMobile) {
        // Desktop: stay in builder, keep selected workflow
        setActiveWorkflow(normalized);
        setSelectedId(normalized.id!);
      }
    } catch (err: any) {
      console.error("Save workflow error", err);
      setError(err?.message || "We couldn't save this workflow. Try again in a moment.");
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

    const confirmed = window.confirm("Delete this workflow? This can’t be undone.");
    if (!confirmed) return;

    const workflowIdToDelete = activeWorkflow.id;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;

    // 🟢 Mobile: collapse immediately
    if (isMobile) {
      backToList();
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/automations/${workflowIdToDelete}`, {
        method: "DELETE",
      }).catch(() => null);

      if (!res || !res.ok) {
        const data = await res?.json().catch(() => null);
        throw new Error(data?.error || "We couldn't delete this workflow. Try again in a moment.");
      }

      setWorkflows((prev) => prev.filter((w) => w.id !== workflowIdToDelete));

      // Desktop: only go back after it finishes
      if (!isMobile) backToList();
    } catch (err: any) {
      console.error("Delete workflow error", err);
      setError(err?.message || "We couldn't delete this workflow. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
  // ✅ Gate: Starter should get upgrade modal (not a backend error)
  if (!requireAutopilotOrUpgrade("run_workflow")) return;

  if (!activeWorkflow?.id) {
    alert("Save this workflow before running it.");
    return;
  }

  try {
    setRunning(true);
    setError(null);

    const res = await fetch("/api/automations/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automationId: activeWorkflow.id,
        contactId: null,
        listingId: null,
      }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const data = await res?.json().catch(() => null);
      throw new Error(
        data?.error || "We couldn't run this workflow. Try again in a moment."
      );
    }
  } catch (err: any) {
    console.error("Run workflow error", err);
    setError(err?.message || "We couldn't run this workflow. Try again in a moment.");
  } finally {
    setRunning(false);
  }
}

async function handleToggleActive() {
  // ✅ Gate: Starter should get upgrade modal
  if (!requireAutopilotOrUpgrade("toggle_workflow")) return;

  if (!activeWorkflow) return;

  if (!activeWorkflow.id) {
    alert("Save this workflow before turning it on or off.");
    return;
  }

  const nextActive = !activeWorkflow.active;

  // Payload matches your existing save payload shape
  const payload = {
    name: activeWorkflow.name,
    description: activeWorkflow.description,
    trigger: activeWorkflow.trigger,
    triggerConfig: {},
    entryConditions: {},
    exitConditions: {},
    schedule: {},
    active: nextActive,
    status: "draft",
    reEnroll: true,
    timezone: null,
    folder: null,
    steps: activeWorkflow.steps,
  };

  try {
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/automations/${activeWorkflow.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!res || !res.ok) {
      const data = await res?.json().catch(() => null);
      throw new Error(
        data?.error || "We couldn't update this workflow. Try again in a moment."
      );
    }

    const saved = await res.json();

    const normalized: AutomationWorkflow = {
    id: saved.id,
    name: saved.name ?? activeWorkflow.name,
    description: saved.description ?? activeWorkflow.description,
    trigger: saved.trigger ?? activeWorkflow.trigger,

    active: saved.active ?? nextActive,
    effectiveActive:
      typeof saved.effectiveActive === "boolean"
        ? saved.effectiveActive
        : (saved.active ?? nextActive),
    lockedReason: saved.lockedReason ?? null,

    steps: activeWorkflow.steps,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };

    // ✅ Update list state
    setWorkflows((prev) => {
      const idx = prev.findIndex((w) => w.id === normalized.id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = normalized;
      return next;
    });

    // ✅ Update the right-side builder state
    setActiveWorkflow(normalized);

    // Keep selection stable
    setSelectedId(normalized.id!);
  } catch (err: any) {
    console.error("Toggle workflow active error", err);
    setError(err?.message || "We couldn't update this workflow. Try again in a moment.");
  } finally {
    setSaving(false);
  }
}


  const triggerSentence = activeWorkflow?.trigger ? triggerPlainSentence(activeWorkflow.trigger) : null;
  const conditionScopeForActive = getConditionScopeForTrigger(activeWorkflow?.trigger ?? null);

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Autopilot"
        title="Automate your busy work"
        subtitle="Let Avillo monitor your leads, clients, and listings — then deliver the right text or task at the perfect moment. No missed opportunities. No manual busywork."
      />

        {/* Messaging setup notice */}
      <div className="rounded-2xl border border-amber-100/40 bg-amber-50/10 px-5 py-4 shadow-[0_0_26px_rgba(248,250,252,0.14)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/90">
          Messaging setup
        </p>

        <p className="mt-1 text-[11px] text-amber-100/85">
          <span className="font-semibold">SMS steps require your own Avillo number.</span>{" "}
          Claim one from the <span className="font-semibold">Comms</span> page before adding SMS to a workflow.
        </p>

        {!phoneStatusLoading && !hasProvisionedSmsNumber && (
          <p className="mt-1 text-[10px] text-amber-100/75">
            You can still build workflows with tasks, waits, and branches today. SMS unlocks as soon as you claim your number in Comms.
          </p>
        )}
      </div>

      <section className="space-y-5">
        {/* Top bar: label + actions */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Workflows & playbooks
            </p>
            <p className="mt-1 max-w-xl text-xs text-[var(--avillo-cream-soft)]">
              Build simple, powerful automations that connect your contacts and listings to real-world
              actions. Start from templates or craft your own with texts, tasks, waits, and branches — no tech skills needed.
            </p>

            {!accountLoading && !hasAutopilot && (
              <p className="mt-2 text-[10px] text-amber-100/80">
                Autopilot is locked on your current plan.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={startNewWorkflow}
            disabled={accountLoading}
            className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
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
            ref={listHeaderRef}
            className={
              "relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "hidden " : "block ") +
              "lg:block lg:flex lg:flex-col lg:max-h-[calc(100vh-170px)]"
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

            {/* list scroll region */}
            <div
              ref={listScrollRef}
              className="flex-1 min-h-0 space-y-2 lg:overflow-y-auto lg:pr-1"
            >
              {loading && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Loading your workflows…
                </p>
              )}

              {!loading && filteredWorkflows.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No workflows yet. Click <span className="font-semibold">“New workflow”</span> above
                  or start from a template on the right.
                </p>
              )}

              {!loading &&
                filteredWorkflows.map((wf) => {
                  const isSelected =
                    (selectedId === "new" && wf.id === "new") ||
                    (wf.id && wf.id === selectedId);

                  const triggerLabel =
                    TRIGGERS.find((t) => t.id === wf.trigger)?.label ?? "Manual / custom";

                  return (
                    <button
                      key={wf.id ?? "new-workflow-row"}
                      data-workflow-id={wf.id ?? "new"}
                      type="button"
                      onClick={() => selectWorkflow((wf.id ?? "new") as any)}
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
                          <p className="text-[10px] text-[var(--avillo-cream-muted)]">{triggerLabel}</p>
                        </div>

                        {(() => {
                            const isPausedByPlan = (wf.effectiveActive ?? wf.active) !== true;
                            const isForcedPaused = wf.active === true && isPausedByPlan; // DB says active, plan forces paused

                            return (
                              <span
                                className={
                                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                                  (!isPausedByPlan
                                    ? "border-emerald-300/80 bg-emerald-500/10 text-emerald-100"
                                    : isForcedPaused
                                    ? "border-amber-200/80 bg-amber-400/10 text-amber-100"
                                    : "border-slate-500/80 bg-slate-800/60 text-slate-200")
                                }
                                title={wf.lockedReason ?? undefined}
                              >
                                {!isPausedByPlan ? "Active" : isForcedPaused ? "Paused" : "Paused"}
                              </span>
                            );
                          })()}
                      </div>

                      {wf.description && (
                        <p className="mt-2 line-clamp-2 text-[11px] text-[var(--avillo-cream-soft)]">
                          {wf.description}
                        </p>
                      )}

                      <p className="mt-2 text-[10px] text-[var(--avillo-cream-muted)]">
                        {wf.steps.length} {wf.steps.length === 1 ? "step" : "steps"}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* RIGHT: SIMPLE BUILDER */}
          <div
            ref={workspaceRef}
            className={
              "relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "block " : "hidden ") +
              "lg:block lg:flex lg:flex-col lg:max-h-[calc(100vh-170px)]"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

            {/* Empty state */}
            {!activeWorkflow && (
              <div className="flex h-full flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto lg:pr-1">
                  <div className="sticky top-0 z-10 mb-4 rounded-xl border border-slate-700/80 bg-slate-900/85 px-4 py-3 backdrop-blur">
                    <p className="text-[11px] font-semibold text-amber-100/90">
                      Recommended workflow templates
                    </p>
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      One-click starting points you can tweak for your market and style.
                    </p>

                    <div className="mt-2 space-y-2">
                      {RECOMMENDED_TEMPLATES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t.id)}
                          className="w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-left text-[11px] text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:bg-slate-900/90"
                        >
                          <p className="font-semibold text-slate-50">{t.label}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                            {t.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                    <p className="font-semibold text-[var(--avillo-cream-soft)]">No workflow selected</p>
                    <p className="mt-1 max-w-xs">
                      Choose an existing workflow from the library, start with a recommended playbook
                      above, or start from scratch with “+ New workflow”.
                    </p>
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
                    <BuilderStepPill step={1} label="Name" done={builderHasName} />
                    <BuilderStepPill step={2} label="When it runs" done={builderHasTrigger} />
                    <BuilderStepPill step={3} label="What it does" done={builderHasSteps} />
                    <BuilderStepPill step={4} label="Turn on" done={(activeWorkflow.effectiveActive ?? activeWorkflow.active) === true} />
                  </div>
                </div>

                {/* RIGHT card scroll region */}
                <div
                  ref={workspaceScrollRef}
                  className="flex-1 min-h-0 space-y-4 lg:overflow-y-auto lg:pr-1"
                >
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
                            setActiveWorkflow({ ...activeWorkflow, name: e.target.value })
                          }
                          placeholder="Ex: New online lead follow-up"
                          className="avillo-input w-full text-slate-50"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                          Short description (optional)
                        </label>
                        <textarea
                          rows={2}
                          value={activeWorkflow.description}
                          onChange={(e) =>
                            setActiveWorkflow({ ...activeWorkflow, description: e.target.value })
                          }
                          placeholder="Ex: Welcomes new website leads and reminds me to call in 24 hours."
                          className="avillo-input h-20 w-full resize-none overflow-y-auto text-slate-50"
                        />
                      </div>
                    </div>

                    {/* Inline template helper */}
                    <div className="mt-2 rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)]">
                        Prefer a shortcut?
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                        Start from a recommended template below — you can rename and tweak any step afterward.
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {RECOMMENDED_TEMPLATES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              const blank = isWorkflowBlank(activeWorkflow);
                              if (!blank) {
                                const confirmReplace = window.confirm(
                                  "Replace your current setup with this template? This will overwrite your existing steps."
                                );
                                if (!confirmReplace) return;
                              }
                              applyTemplate(t.id);
                            }}
                            className="rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:text-amber-50"
                          >
                            {t.label}
                          </button>
                        ))}
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
                    </p>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {TRIGGERS.map((t) => {
                        const isActive = activeWorkflow.trigger === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveWorkflow({ ...activeWorkflow, trigger: t.id })}
                            className={
                              "rounded-xl border px-3 py-2 text-left text-[10px] transition-colors " +
                              (isActive
                                ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.32)]"
                                : "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50")
                            }
                          >
                            <p className="text-[11px] font-semibold text-slate-50">{t.label}</p>
                            <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                              {t.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {triggerSentence && (
                      <p className="mt-2 text-[10px] text-[var(--avillo-cream-soft)]">
                        <span className="font-semibold">Plain language:</span> {triggerSentence}
                      </p>
                    )}
                  </div>

                  {/* Step 3: Steps */}
                  <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                    <p className="text-[11px] font-semibold text-amber-100/90">
                      3. What should happen, in order?
                    </p>
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      Steps run from top to bottom. Think: text → wait → task. Tap a step to edit it, or remove it with one click.
                    </p>

                    {!phoneStatusLoading && !hasProvisionedSmsNumber && (
                      <div className="mt-2 rounded-lg border border-amber-100/30 bg-amber-50/5 px-3 py-2 text-[10px] text-amber-100/80">
                        SMS steps are locked until you claim your Avillo number in Comms.
                      </div>
                    )}

                    <div className="mt-1 space-y-2">
                      {activeWorkflow.steps.length === 0 && (
                        <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">
                          No steps yet. Start by adding a welcome SMS, or task below.
                        </p>
                      )}

                      {activeWorkflow.steps.map((s, i) => (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openStepModal(s.type, s)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openStepModal(s.type, s);
                            }
                          }}
                          className="w-full cursor-pointer rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-left hover:border-amber-100/70 hover:bg-slate-900/90"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <p className="text-[11px] font-semibold text-slate-50">
                                Step {i + 1}: {s.type === "IF" ? "IF / Branch" : s.type}
                              </p>

                              {s.type === "SMS" && !phoneStatusLoading && !hasProvisionedSmsNumber && (
                                <span className="rounded-full border border-amber-200/60 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                                  Number required
                                </span>
                              )}
                            </div>

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
                            {s.type === "TASK" && s.config?.text}
                            {s.type === "WAIT" && formatWait(s.config)}
                            {s.type === "IF" &&
                              (() => {
                                const cfg = s.config || {};
                                const join = cfg.join ?? "AND";
                                const conditions: ConditionConfig[] = Array.isArray(cfg.conditions)
                                  ? cfg.conditions
                                  : [];
                                if (!conditions.length) return "If condition is not configured yet";
                                const parts = conditions.map((c) => {
                                  const opLabel = c.operator === "not_equals" ? "is not" : "is";
                                  return `${c.field} ${opLabel} ${c.value}`;
                                });
                                const condText = parts.join(` ${join} `);
                                const thenCount = s.thenSteps?.length ?? 0;
                                const elseCount = s.elseSteps?.length ?? 0;

                                return `If ${condText} (then ${thenCount} step${
                                  thenCount === 1 ? "" : "s"
                                }, else ${elseCount} step${elseCount === 1 ? "" : "s"})`;
                              })()}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Add step buttons */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["SMS", "TASK", "WAIT", "IF"] as StepType[]).map((t) => {
                        const smsLocked =
                          t === "SMS" && !phoneStatusLoading && !hasProvisionedSmsNumber;

                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => openStepModal(t)}
                            disabled={smsLocked}
                            title={
                              smsLocked
                                ? "Claim your Avillo number in Comms to use SMS steps."
                                : undefined
                            }
                            className={
                              "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] " +
                              (smsLocked
                                ? "cursor-not-allowed border-slate-700/80 bg-slate-900/40 text-slate-500"
                                : "border-slate-600/80 bg-slate-900/80 text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:text-amber-50")
                            }
                          >
                            + {t === "IF" ? "IF / Branch" : t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Step 4: Turn on + save + run */}
                <div className="mt-auto flex flex-col gap-4 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold text-amber-100/90">
                        4. Turn it on, test, & save
                      </p>
                      <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                        You can pause a workflow anytime. Click “Run test” to test the workflow behavior.
                      </p>
                    </div>

                    {(() => {
                          const effectiveActive = (activeWorkflow.effectiveActive ?? activeWorkflow.active) === true;
                          const forcedPaused = activeWorkflow.active === true && !effectiveActive;

                          return (
                            <button
                              type="button"
                              onClick={() => void handleToggleActive()}
                              disabled={saving || accountLoading || !activeWorkflow?.id}
                              className={
                                "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                                (effectiveActive
                                  ? "border-emerald-300/80 bg-emerald-500/10 text-emerald-100"
                                  : forcedPaused
                                  ? "border-amber-200/80 bg-amber-400/10 text-amber-100"
                                  : "border-slate-500/80 bg-slate-800/60 text-slate-200") +
                                " disabled:cursor-not-allowed disabled:opacity-60"
                              }
                              title={activeWorkflow.lockedReason ?? undefined}
                            >
                              {effectiveActive ? "Active" : "Paused"}
                            </button>
                          );
                        })()}
                  </div>

                  {/* Desktop row (sm+) */}
                  <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving || !activeWorkflow?.id}
                      className="inline-flex items-center justify-center rounded-full border border-red-400/80 bg-red-500/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete workflow
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleRunNow()}
                        disabled={running || !activeWorkflow?.id}
                        className="inline-flex items-center justify-center rounded-full border border-slate-400/80 bg-slate-800/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {running ? "Running…" : "Run test"}
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

                  {/* Mobile (< sm) */}
                  <div className="flex flex-col gap-2 sm:hidden">
                    <button
                      type="button"
                      onClick={() => void handleRunNow()}
                      disabled={running || !activeWorkflow?.id}
                      className="inline-flex w-full items-center justify-center rounded-full border border-slate-400/80 bg-slate-800/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {running ? "Running…" : "Run test"}
                    </button>

                    <div className="flex items-center justify-between gap-3 pb-1">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={saving || !activeWorkflow?.id}
                        className="inline-flex items-center justify-center rounded-full border border-red-400/80 bg-red-500/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete workflow
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
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Step modal (add + edit) */}
      <StepModal
        type={stepModalType}
        initialConfig={editingStep?.config ?? null}
        initialThen={editingStep?.type === "IF" ? editingStep.thenSteps ?? [] : null}
        initialElse={editingStep?.type === "IF" ? editingStep.elseSteps ?? [] : null}
        conditionScope={conditionScopeForActive}
        smsEnabled={hasProvisionedSmsNumber}
        smsDisabledReason="To use SMS steps, first claim your Avillo number from the Comms page."
        onClose={() => {
          setStepModalType(null);
          setEditingStep(null);
        }}
        onSave={handleStepSave}
      />

      {/* Upgrade modal */}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="autopilot"
        source="autopilot_page"
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