// app/(portal)/admin/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import type { UserRole, WorkspaceRole, AccessLevel, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

type WorkspaceBillingSnapshot = {
  accessLevel: AccessLevel | string | null;
  plan: SubscriptionPlan | string | null;
  subscriptionStatus: SubscriptionStatus | string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;

  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeBasePriceId: string | null;
  stripeSeatPriceId: string | null;

  seatLimit: number | null;
  includedSeats: number | null;

  // computed / derived if your API provides it
  seatsUsed: number | null;
};

type WorkspaceMembership = {
  workspaceId: string;
  workspaceName: string;
  workspaceCreatedAt: string | null;
  role: WorkspaceRole;
  joinedAt: string | null;
  billing?: WorkspaceBillingSnapshot | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  brokerage: string | null;
  role: UserRole;

  defaultWorkspaceId: string | null;

  lastLoginAt: string | null;
  createdAt: string;

  openAITokensUsed: number;

  workspaceCount: number;
  memberships: WorkspaceMembership[];
};

type Metrics = {
  totals: {
    totalUsers: number;
    adminCount: number;
    activePaidCount: number;
    totalWorkspaces: number;
    totalSeats: number;
  };
  statuses: Record<string, number>;
  revenue: { mrrUsd: number };
};

const EMPTY_BILLING: WorkspaceBillingSnapshot = {
  accessLevel: null,
  plan: null,
  subscriptionStatus: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripeBasePriceId: null,
  stripeSeatPriceId: null,
  seatLimit: null,
  includedSeats: null,
  seatsUsed: null,
};

function billingOf(m?: WorkspaceMembership | null) {
  return (m?.billing ?? EMPTY_BILLING) as WorkspaceBillingSnapshot;
}

function formatDateTime(x: string | null) {
  if (!x) return "—";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatDateOnly(x: string | null) {
  if (!x) return "—";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function safeStr(v: unknown) {
  return String(v ?? "").trim();
}

function toneBadge(tone: "good" | "warn" | "bad") {
  return tone === "good"
    ? "bg-emerald-500/10 text-emerald-200 border-emerald-400/30"
    : tone === "warn"
    ? "bg-amber-500/10 text-amber-200 border-amber-400/30"
    : "bg-red-500/10 text-red-200 border-red-400/30";
}

function seatsLabel(used: number | null, included: number | null) {
  if (used == null && included == null) return "—";
  if (used != null && included == null) return `${used} used`;
  if (used == null && included != null) return `${included} included`;
  if (used != null && included != null) return `${used}/${included}`;
  return "—";
}

function seatsTone(used: number | null, included: number | null) {
  if (used == null || included == null) return "warn" as const;
  if (used <= included) return "good" as const;
  return "bad" as const;
}

function workspaceTypeLabel(m: WorkspaceMembership) {
  const b = billingOf(m);
  const plan = safeStr(b.plan).toUpperCase();
  const included = b.includedSeats;

  if (plan.includes("ENTERPRISE")) return "TEAM";
  if (included != null && included >= 5) return "TEAM";
  return "SOLO";
}

function workspaceAccessBadge(accessLevel: string | null) {
  const v = safeStr(accessLevel).toUpperCase();
  if (!v) return { label: "—", tone: "warn" as const };
  if (v === "BETA") return { label: "BETA", tone: "warn" as const };
  if (v === "EXPIRED") return { label: "EXPIRED", tone: "bad" as const };
  if (v === "PAID") return { label: "PAID", tone: "good" as const };
  return { label: v, tone: "warn" as const };
}

function stripeSyncBadgeForWorkspace(b?: WorkspaceBillingSnapshot | null) {
  const bb = b ?? EMPTY_BILLING;
  if (!bb.stripeCustomerId) return { label: "No customer", tone: "warn" as const };
  if (!bb.subscriptionStatus) return { label: "Missing status", tone: "warn" as const };
  if (!bb.stripeSubscriptionId) return { label: "Missing sub", tone: "warn" as const };
  if (!bb.stripeBasePriceId) return { label: "Missing base", tone: "warn" as const };
  if (!bb.stripeSeatPriceId) return { label: "Missing seat", tone: "warn" as const };
  return { label: "Synced", tone: "good" as const };
}

function primaryMembership(u: AdminUser) {
  if (!u.memberships?.length) return null;
  const byDefault = u.defaultWorkspaceId ? u.memberships.find((m) => m.workspaceId === u.defaultWorkspaceId) : null;
  return byDefault ?? u.memberships[0] ?? null;
}

function isAccessLevel(v: unknown): v is AccessLevel {
  const s = String(v ?? "").toUpperCase();
  return s === "BETA" || s === "PAID" || s === "EXPIRED";
}

function isSubscriptionStatus(v: unknown): v is SubscriptionStatus {
  const s = String(v ?? "").toUpperCase();
  return s === "NONE" || s === "TRIALING" || s === "ACTIVE" || s === "PAST_DUE" || s === "CANCELED";
}

function normalizeUsersPayload(raw: any): AdminUser[] {
  const users = Array.isArray(raw?.users) ? raw.users : Array.isArray(raw) ? raw : [];
  return users.map((u: any) => {
    const membershipsRaw = Array.isArray(u?.memberships) ? u.memberships : [];

    const memberships: WorkspaceMembership[] = membershipsRaw.map((m: any) => {
      const billingNested = m?.billing;

      const flattened: WorkspaceBillingSnapshot = {
        accessLevel: m?.accessLevel ?? m?.workspaceAccessLevel ?? null,
        plan: m?.plan ?? m?.workspacePlan ?? null,
        subscriptionStatus: m?.subscriptionStatus ?? m?.workspaceSubscriptionStatus ?? null,
        trialEndsAt: m?.trialEndsAt ?? m?.workspaceTrialEndsAt ?? null,
        currentPeriodEnd: m?.currentPeriodEnd ?? m?.workspaceCurrentPeriodEnd ?? null,

        stripeCustomerId: m?.stripeCustomerId ?? null,
        stripeSubscriptionId: m?.stripeSubscriptionId ?? null,
        stripeBasePriceId: m?.stripeBasePriceId ?? null,
        stripeSeatPriceId: m?.stripeSeatPriceId ?? null,

        seatLimit: typeof m?.seatLimit === "number" ? m.seatLimit : null,
        includedSeats: typeof m?.includedSeats === "number" ? m.includedSeats : null,

        seatsUsed: typeof m?.seatsUsed === "number" ? m.seatsUsed : null,
      };

      const billing: WorkspaceBillingSnapshot =
        billingNested && typeof billingNested === "object"
          ? {
              ...EMPTY_BILLING,
              ...billingNested,
              accessLevel: billingNested.accessLevel ?? billingNested.workspaceAccessLevel ?? null,
              plan: billingNested.plan ?? billingNested.workspacePlan ?? null,
              subscriptionStatus: billingNested.subscriptionStatus ?? billingNested.workspaceSubscriptionStatus ?? null,
              trialEndsAt: billingNested.trialEndsAt ?? billingNested.workspaceTrialEndsAt ?? null,
              currentPeriodEnd: billingNested.currentPeriodEnd ?? billingNested.workspaceCurrentPeriodEnd ?? null,
              stripeSeatPriceId: billingNested.stripeSeatPriceId ?? null,
              seatLimit: typeof billingNested.seatLimit === "number" ? billingNested.seatLimit : null,
              includedSeats: typeof billingNested.includedSeats === "number" ? billingNested.includedSeats : null,
              seatsUsed: typeof billingNested.seatsUsed === "number" ? billingNested.seatsUsed : null,
            }
          : flattened;

      return {
        workspaceId: String(m?.workspaceId ?? ""),
        workspaceName: String(m?.workspaceName ?? "Untitled workspace"),
        workspaceCreatedAt: m?.workspaceCreatedAt ?? null,
        role: (m?.role ?? "AGENT") as WorkspaceRole,
        joinedAt: m?.joinedAt ?? null,
        billing,
      };
    });

    return {
      id: String(u?.id ?? ""),
      name: String(u?.name ?? ""),
      email: String(u?.email ?? ""),
      brokerage: u?.brokerage ?? null,
      role: (u?.role ?? "USER") as UserRole,
      defaultWorkspaceId: u?.defaultWorkspaceId ?? null,
      lastLoginAt: u?.lastLoginAt ?? null,
      createdAt: String(u?.createdAt ?? new Date().toISOString()),
      openAITokensUsed: Number(u?.openAITokensUsed ?? 0),
      workspaceCount: Number(u?.workspaceCount ?? memberships.length),
      memberships,
    };
  });
}

function normalizeMetricsPayload(raw: any): Metrics | null {
  if (!raw || typeof raw !== "object") return null;

  const totals = raw.totals ?? {};
  const statuses = raw.statuses ?? raw.workspaceStatuses ?? {};
  const rev = raw.revenue ?? {};

  const totalSeats =
    typeof totals.totalSeats === "number"
      ? totals.totalSeats
      : typeof totals.activeMemberships === "number"
      ? totals.activeMemberships
      : typeof totals.totalMemberships === "number"
      ? totals.totalMemberships
      : 0;

  const activePaidCount =
    typeof totals.activePaidCount === "number"
      ? totals.activePaidCount
      : typeof totals.activePaidWorkspaceCount === "number"
      ? totals.activePaidWorkspaceCount
      : 0;

  const mrrUsd =
    typeof rev.mrrUsd === "number" ? rev.mrrUsd : typeof rev.baseMrrUsd === "number" ? rev.baseMrrUsd : 0;

  return {
    totals: {
      totalUsers: Number(totals.totalUsers ?? 0),
      adminCount: Number(totals.adminCount ?? 0),
      activePaidCount: Number(activePaidCount ?? 0),
      totalWorkspaces: Number(totals.totalWorkspaces ?? 0),
      totalSeats: Number(totalSeats ?? 0),
    },
    statuses: (statuses ?? {}) as Record<string, number>,
    revenue: { mrrUsd: Number(mrrUsd ?? 0) },
  };
}

type WorkspaceTierMode = "SOLO" | "ENTERPRISE_STRIPE" | "ENTERPRISE_MANUAL";

function currentTierMode(m: WorkspaceMembership): WorkspaceTierMode {
  const b = billingOf(m);
  const plan = safeStr(b.plan).toUpperCase();

  if (plan.includes("ENTERPRISE")) {
    if (!b.stripeCustomerId || !b.stripeSubscriptionId) return "ENTERPRISE_MANUAL";
    return "ENTERPRISE_STRIPE";
  }
  return "SOLO";
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [syncingWorkspaceId, setSyncingWorkspaceId] = useState<string | null>(null);
  const [patchingWorkspaceId, setPatchingWorkspaceId] = useState<string | null>(null);

  const [closingBeta, setClosingBeta] = useState(false);

  const [query, setQuery] = useState("");
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});

  const [tierFilter, setTierFilter] = useState<"all" | "solo" | "team">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "access_paid" | "access_beta" | "access_expired" | "sub_active" | "sub_trialing" | "sub_past_due" | "sub_canceled"
  >("all");

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load users");

      const raw = await res.json();
      setUsers(normalizeUsersPayload(raw));
    } catch (err: any) {
      console.error("Admin load users error", err);
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    try {
      setLoadingMetrics(true);
      const res = await fetch("/api/admin/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load metrics");
      const raw = await res.json();
      setMetrics(normalizeMetricsPayload(raw));
    } catch (err) {
      console.error("Admin metrics error", err);
    } finally {
      setLoadingMetrics(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    void loadMetrics();
  }, []);

  const filteredUsers = useMemo(() => {
    let result = users;

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((u) => {
        const membershipsText = (u.memberships || [])
          .map((m) => {
            const b = billingOf(m);
            return [
              m.workspaceName,
              m.workspaceId,
              m.role,
              b.accessLevel,
              b.plan,
              b.subscriptionStatus,
              b.stripeCustomerId,
              b.stripeSubscriptionId,
              b.stripeBasePriceId,
              b.stripeSeatPriceId,
              `${b.seatsUsed ?? ""}/${b.includedSeats ?? ""}`,
              `limit:${b.seatLimit ?? ""}`,
            ]
              .filter(Boolean)
              .join(" ");
          })
          .join(" ")
          .toLowerCase();

        return (
          (u.name || "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.brokerage || "").toLowerCase().includes(q) ||
          (u.role || "").toLowerCase().includes(q) ||
          membershipsText.includes(q)
        );
      });
    }

    if (tierFilter !== "all") {
      result = result.filter((u) => {
        const p = primaryMembership(u);
        if (!p) return false;
        const t = workspaceTypeLabel(p).toLowerCase();
        return tierFilter === "team" ? t === "team" : t === "solo";
      });
    }

    if (statusFilter !== "all") {
      result = result.filter((u) => {
        const p = primaryMembership(u);
        if (!p) return false;

        const b = billingOf(p);
        const access = safeStr(b.accessLevel).toUpperCase();
        const sub = safeStr(b.subscriptionStatus).toUpperCase();

        if (statusFilter === "access_paid") return access === "PAID";
        if (statusFilter === "access_beta") return access === "BETA";
        if (statusFilter === "access_expired") return access === "EXPIRED";

        if (statusFilter === "sub_active") return sub === "ACTIVE";
        if (statusFilter === "sub_trialing") return sub === "TRIALING";
        if (statusFilter === "sub_past_due") return sub === "PAST_DUE";
        if (statusFilter === "sub_canceled") return sub === "CANCELED";

        return true;
      });
    }

    return result;
  }, [users, query, tierFilter, statusFilter]);

  const admins = useMemo(() => filteredUsers.filter((u) => u.role === "ADMIN"), [filteredUsers]);
  const nonAdmins = useMemo(() => filteredUsers.filter((u) => u.role !== "ADMIN"), [filteredUsers]);

  async function patchUser(userId: string, payload: any) {
    setSavingUserId(userId);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to update user");

      const nextUser = data?.user ? normalizeUsersPayload({ users: [data.user] })[0] : null;
      if (nextUser) setUsers((prev) => prev.map((u) => (u.id === userId ? nextUser : u)));
      else await loadUsers();

      void loadMetrics();
    } catch (err: any) {
      console.error("Admin patch error", err);
      setError(err.message || "Failed to update user.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function patchWorkspace(workspaceId: string, patch: any) {
    setPatchingWorkspaceId(workspaceId);
    setError(null);

    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, patch }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to update workspace");

      await loadUsers();
      void loadMetrics();
    } catch (err: any) {
      console.error("Admin patch workspace error", err);
      setError(err.message || "Failed to update workspace.");
    } finally {
      setPatchingWorkspaceId(null);
    }
  }

  async function setWorkspaceTier(workspaceId: string, mode: WorkspaceTierMode) {
    const ok = window.confirm(
      mode === "ENTERPRISE_MANUAL"
        ? "Grant ENTERPRISE (Manual)?\n\nSets access=PAID, plan=ENTERPRISE, status=ACTIVE, includedSeats=5, seatLimit=5."
        : mode === "ENTERPRISE_STRIPE"
        ? "Set ENTERPRISE (Stripe)?\n\nSets plan=ENTERPRISE and seats to 5. Stripe billing is expected to manage status."
        : "Set SOLO?\n\nSets plan=STARTER and seats to 1."
    );
    if (!ok) return;

    if (mode === "SOLO") {
      await patchWorkspace(workspaceId, {
        plan: "STARTER",
        includedSeats: 1,
        seatLimit: 1,
      });
      return;
    }

    if (mode === "ENTERPRISE_STRIPE") {
      await patchWorkspace(workspaceId, {
        plan: "ENTERPRISE",
        includedSeats: 5,
        seatLimit: 5,
      });
      return;
    }

    await patchWorkspace(workspaceId, {
      accessLevel: "PAID",
      plan: "ENTERPRISE",
      subscriptionStatus: "ACTIVE",
      includedSeats: 5,
      seatLimit: 5,
      trialEndsAt: null,
      currentPeriodEnd: null,
    });
  }

  async function setWorkspaceAccess(workspaceId: string, accessLevel: AccessLevel) {
    const ok = window.confirm(
      accessLevel === "EXPIRED"
        ? "Set access to EXPIRED?\n\nThis will block the workspace and show upgrade everywhere."
        : accessLevel === "BETA"
        ? "Set access to BETA?\n\nThis will allow access under beta gates."
        : "Set access to PAID?\n\nThis will allow access under paid gates."
    );
    if (!ok) return;

    await patchWorkspace(workspaceId, { accessLevel });
  }

  async function syncWorkspaceFromStripe(workspaceId: string) {
    setSyncingWorkspaceId(workspaceId);
    setError(null);

    try {
      const res = await fetch("/api/admin/stripe/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to sync from Stripe");

      await loadUsers();
      void loadMetrics();
    } catch (err: any) {
      console.error("Sync workspace from Stripe error", err);
      setError(err.message || "Failed to sync from Stripe.");
    } finally {
      setSyncingWorkspaceId(null);
    }
  }

  async function openStripePortal(customerId: string | null, returnTo?: string) {
    if (!customerId) return;
    setError(null);

    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, returnTo: returnTo || "/billing" }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to open billing portal");
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("Admin openStripePortal error", err);
      setError(err.message || "Failed to open Stripe billing portal.");
    }
  }

  async function closeBetaGlobally() {
    const ok = window.confirm("Close beta globally?\n\nThis will move ALL BETA workspaces/users to EXPIRED.");
    if (!ok) return;

    setClosingBeta(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/beta/close", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to close beta");

      await loadUsers();
      await loadMetrics();

      alert(data?.message || "Beta closed.");
    } catch (err: any) {
      console.error("Close beta error", err);
      setError(err.message || "Failed to close beta.");
    } finally {
      setClosingBeta(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Avillo control panel"
        subtitle="Workspace-first access + billing + user management."
      />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Total users</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">{loadingMetrics ? "…" : metrics?.totals.totalUsers ?? "—"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Admins: {loadingMetrics ? "…" : metrics?.totals.adminCount ?? "—"}</p>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Workspaces</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">{loadingMetrics ? "…" : metrics?.totals.totalWorkspaces ?? "—"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Seats: {loadingMetrics ? "…" : metrics?.totals.totalSeats ?? "—"}</p>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Active paid</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">{loadingMetrics ? "…" : metrics?.totals.activePaidCount ?? "—"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Trialing: {loadingMetrics ? "…" : metrics?.statuses?.TRIALING ?? 0}</p>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">MRR</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {loadingMetrics ? "…" : `$${(metrics?.revenue?.mrrUsd ?? 0).toFixed(2)}`}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Stripe-derived monthly equivalent</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Users &amp; workspaces</p>
            <p className="mt-1 text-[11px] text-slate-300/80">
              Search name/email/brokerage/workspace/plan/status/stripe ids. Filters target the user’s primary workspace.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="avillo-input w-full sm:w-96" />

            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as any)}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200"
              title="Tier filter (primary workspace)"
            >
              <option value="all">All tiers</option>
              <option value="solo">Solo</option>
              <option value="team">Team / Enterprise</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200"
              title="Status filter (primary workspace)"
            >
              <option value="all">All statuses</option>
              <option value="access_paid">PAID (access)</option>
              <option value="access_beta">BETA (access)</option>
              <option value="access_expired">EXPIRED (access)</option>
              <option value="sub_active">ACTIVE (subscription)</option>
              <option value="sub_trialing">TRIALING</option>
              <option value="sub_past_due">PAST_DUE</option>
              <option value="sub_canceled">CANCELED</option>
            </select>

            <button
              type="button"
              onClick={closeBetaGlobally}
              disabled={closingBeta}
              className={
                "rounded-full border px-4 py-2 text-[11px] font-semibold " +
                (closingBeta
                  ? "border-slate-700 bg-slate-900/60 text-slate-400 cursor-not-allowed"
                  : "border-rose-300/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20")
              }
            >
              {closingBeta ? "Closing beta…" : "Close beta globally"}
            </button>

            {loading && <span className="text-[11px] text-slate-400 text-right">Loading…</span>}
          </div>
        </div>

        {error && <p className="mb-3 text-[11px] text-red-300">{error}</p>}

        {!loading && !error && users.length === 0 && <p className="text-[11px] text-slate-400">No users found yet.</p>}

        {!loading && users.length > 0 && (
          <div className="space-y-8">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">Admin accounts</p>
              {admins.length === 0 ? (
                <p className="text-[11px] text-slate-400">No admins match this search.</p>
              ) : (
                <UserTable
                  users={admins}
                  expandedUserIds={expandedUserIds}
                  setExpandedUserIds={setExpandedUserIds}
                  savingUserId={savingUserId}
                  syncingWorkspaceId={syncingWorkspaceId}
                  patchingWorkspaceId={patchingWorkspaceId}
                  onChangeRole={(id, role) => patchUser(id, { role })}
                  onOpenStripe={openStripePortal}
                  onSyncWorkspace={syncWorkspaceFromStripe}
                  onSetWorkspaceTier={setWorkspaceTier}
                  onSetWorkspaceAccess={setWorkspaceAccess}
                />
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">User accounts</p>
              {nonAdmins.length === 0 ? (
                <p className="text-[11px] text-slate-400">No users match this search.</p>
              ) : (
                <UserTable
                  users={nonAdmins}
                  expandedUserIds={expandedUserIds}
                  setExpandedUserIds={setExpandedUserIds}
                  savingUserId={savingUserId}
                  syncingWorkspaceId={syncingWorkspaceId}
                  patchingWorkspaceId={patchingWorkspaceId}
                  onChangeRole={(id, role) => patchUser(id, { role })}
                  onOpenStripe={openStripePortal}
                  onSyncWorkspace={syncWorkspaceFromStripe}
                  onSetWorkspaceTier={setWorkspaceTier}
                  onSetWorkspaceAccess={setWorkspaceAccess}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function UserTable({
  users,
  expandedUserIds,
  setExpandedUserIds,
  savingUserId,
  syncingWorkspaceId,
  patchingWorkspaceId,
  onChangeRole,
  onOpenStripe,
  onSyncWorkspace,
  onSetWorkspaceTier,
  onSetWorkspaceAccess,
}: {
  users: AdminUser[];
  expandedUserIds: Record<string, boolean>;
  setExpandedUserIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  savingUserId: string | null;
  syncingWorkspaceId: string | null;
  patchingWorkspaceId: string | null;
  onChangeRole: (userId: string, role: UserRole) => void;
  onOpenStripe: (customerId: string | null, returnTo?: string) => void;
  onSyncWorkspace: (workspaceId: string) => void;
  onSetWorkspaceTier: (workspaceId: string, mode: WorkspaceTierMode) => void;
  onSetWorkspaceAccess: (workspaceId: string, access: AccessLevel) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
      <table className="min-w-[2680px] w-full text-left text-sm text-slate-200">
        <thead>
          <tr className="text-[11px] uppercase text-slate-400 border-b border-slate-800/80 bg-slate-950/80">
            <th className="px-4 py-2">User</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Brokerage</th>
            <th className="px-4 py-2">Role</th>

            <th className="px-4 py-2">Tier</th>
            <th className="px-4 py-2">Workspace</th>
            <th className="px-4 py-2">Ws role</th>

            <th className="px-4 py-2">Access</th>
            <th className="px-4 py-2">Access grant</th>

            <th className="px-4 py-2">Plan</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Trial ends</th>
            <th className="px-4 py-2">Period end</th>

            <th className="px-4 py-2">Seats (used/included)</th>
            <th className="px-4 py-2">Seat limit</th>

            <th className="px-4 py-2">Stripe sync</th>
            <th className="px-4 py-2">Stripe</th>

            <th className="px-4 py-2">Workspaces</th>
            <th className="px-4 py-2">Tokens</th>
            <th className="px-4 py-2">Last login</th>
            <th className="px-4 py-2">Created</th>
          </tr>
        </thead>

        <tbody>
          {users.map((u, idx) => {
            const isExpanded = !!expandedUserIds[u.id];
            const primary = primaryMembership(u);
            const pb = billingOf(primary);

            const tier = primary ? workspaceTypeLabel(primary) : "—";
            const access = primary ? workspaceAccessBadge(pb.accessLevel) : { label: "—", tone: "warn" as const };
            const accessClass = toneBadge(access.tone);

            const seats = primary ? seatsLabel(pb.seatsUsed, pb.includedSeats) : "—";
            const seatsCls = primary ? toneBadge(seatsTone(pb.seatsUsed, pb.includedSeats)) : toneBadge("warn");

            const stripeBadge = primary ? stripeSyncBadgeForWorkspace(pb) : { label: "—", tone: "warn" as const };
            const stripeBadgeClass = toneBadge(stripeBadge.tone);

            const plan = pb.plan ?? "—";
            const status = pb.subscriptionStatus ?? "—";

            const busyPrimary =
              !!primary && (patchingWorkspaceId === primary.workspaceId || syncingWorkspaceId === primary.workspaceId);

            const currentAccess = isAccessLevel(pb.accessLevel)
              ? (String(pb.accessLevel).toUpperCase() as AccessLevel)
              : ("BETA" as AccessLevel);

            const seatLimit = pb.seatLimit ?? null;

            return (
              <React.Fragment key={u.id}>
                <tr
                  className={
                    "border-b border-slate-800/60 text-[13px] " +
                    (idx % 2 === 0 ? "bg-slate-950/40" : "bg-slate-950/20")
                  }
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900"
                        onClick={() => setExpandedUserIds((prev) => ({ ...prev, [u.id]: !prev[u.id] }))}
                      >
                        {isExpanded ? "–" : "+"}
                      </button>
                      <span>{u.name || "—"}</span>
                    </div>
                  </td>

                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.brokerage || "—"}</td>

                  <td className="px-4 py-2">
                    <select
                      disabled={savingUserId === u.id}
                      value={u.role}
                      onChange={(e) => onChangeRole(u.id, e.target.value as UserRole)}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[12px]"
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>

                  <td className="px-4 py-2">
                    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-200">
                      {tier}
                    </span>
                  </td>

                  <td className="px-4 py-2">
                    {primary ? (
                      <div>
                        <p className="text-[12px] font-semibold text-slate-100">{primary.workspaceName}</p>
                        <p className="text-[10px] text-slate-500">
                          ws: …{primary.workspaceId.slice(-8)} • created {formatDateOnly(primary.workspaceCreatedAt)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="px-4 py-2">
                    {primary ? (
                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-200">
                        {primary.role}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${accessClass}`}>
                      {access.label}
                    </span>
                  </td>

                  <td className="px-4 py-2">
                    {primary ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={currentAccess}
                          onChange={(e) => onSetWorkspaceAccess(primary.workspaceId, e.target.value as AccessLevel)}
                          disabled={busyPrimary}
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[12px]"
                        >
                          <option value="BETA">BETA</option>
                          <option value="PAID">PAID</option>
                          <option value="EXPIRED">EXPIRED</option>
                        </select>
                        {busyPrimary ? <span className="text-[11px] text-slate-500">Saving…</span> : null}
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="px-4 py-2">{String(plan)}</td>
                  <td className="px-4 py-2">{String(status)}</td>
                  <td className="px-4 py-2">{formatDateTime(pb.trialEndsAt ?? null)}</td>
                  <td className="px-4 py-2">{formatDateTime(pb.currentPeriodEnd ?? null)}</td>

                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${seatsCls}`}>{seats}</span>
                  </td>

                  <td className="px-4 py-2">{seatLimit == null ? "—" : seatLimit}</td>

                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${stripeBadgeClass}`}>
                      {stripeBadge.label}
                    </span>
                  </td>

                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenStripe(pb.stripeCustomerId ?? null)}
                        disabled={!pb.stripeCustomerId}
                        className={
                          "rounded px-2 py-1 text-[11px] font-semibold border " +
                          (pb.stripeCustomerId
                            ? "bg-indigo-500/10 text-indigo-200 border-indigo-400/30 hover:bg-indigo-500/20"
                            : "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed")
                        }
                      >
                        Portal
                      </button>

                      <button
                        onClick={() => primary && onSyncWorkspace(primary.workspaceId)}
                        disabled={!primary || syncingWorkspaceId === primary.workspaceId}
                        className={
                          "rounded px-2 py-1 text-[11px] font-semibold border " +
                          (!primary || syncingWorkspaceId === primary.workspaceId
                            ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                            : "bg-sky-500/10 text-sky-200 border-sky-400/30 hover:bg-sky-500/20")
                        }
                      >
                        {primary && syncingWorkspaceId === primary.workspaceId ? "Syncing…" : "Sync"}
                      </button>
                    </div>

                    <div className="mt-1 text-[10px] text-slate-500">
                      {pb.stripeCustomerId ? `cus: …${pb.stripeCustomerId.slice(-6)}` : "no customer"}
                    </div>
                  </td>

                  <td className="px-4 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-slate-200">{u.workspaceCount}</span>
                      <span className="text-[10px] text-slate-500">{u.workspaceCount === 1 ? "workspace" : "workspaces"}</span>
                    </div>
                  </td>

                  <td className="px-4 py-2">{u.openAITokensUsed}</td>
                  <td className="px-4 py-2">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="px-4 py-2">{formatDateOnly(u.createdAt)}</td>
                </tr>

                {isExpanded && (
                  <tr className="border-b border-slate-800/60 bg-slate-950/70">
                    <td colSpan={22} className="px-4 py-3">
                      <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-4 py-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Workspace memberships</p>
                        </div>

                        {u.memberships.length === 0 ? (
                          <p className="mt-2 text-[12px] text-slate-400">No workspace memberships.</p>
                        ) : (
                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {u.memberships.map((m) => {
                              const b = billingOf(m);
                              const access = workspaceAccessBadge(b.accessLevel);
                              const stripe = stripeSyncBadgeForWorkspace(b);
                              const tier = workspaceTypeLabel(m);
                              const seats = seatsLabel(b.seatsUsed, b.includedSeats);

                              const tierMode = currentTierMode(m);
                              const busy = patchingWorkspaceId === m.workspaceId || syncingWorkspaceId === m.workspaceId;

                              const curAccess = isAccessLevel(b.accessLevel)
                                ? (String(b.accessLevel).toUpperCase() as AccessLevel)
                                : ("BETA" as AccessLevel);

                              return (
                                <div key={`${u.id}:${m.workspaceId}:${m.role}`} className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-[12px] font-semibold text-slate-100">{m.workspaceName}</p>
                                      <p className="text-[10px] text-slate-500">
                                        ws: …{m.workspaceId.slice(-8)} • created {formatDateOnly(m.workspaceCreatedAt)}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-200">
                                        {tier}
                                      </span>
                                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-200">
                                        {m.role}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-[10px] text-slate-400 uppercase tracking-[0.22em]">Access</div>

                                    <div className="flex items-center gap-2">
                                      <select
                                        value={curAccess}
                                        onChange={(e) => onSetWorkspaceAccess(m.workspaceId, e.target.value as AccessLevel)}
                                        disabled={busy}
                                        className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200"
                                      >
                                        <option value="BETA">BETA</option>
                                        <option value="PAID">PAID</option>
                                        <option value="EXPIRED">EXPIRED</option>
                                      </select>
                                      {busy ? <span className="text-[11px] text-slate-400">Saving…</span> : null}
                                    </div>
                                  </div>

                                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-[10px] text-slate-400 uppercase tracking-[0.22em]">Tier</div>

                                    <div className="flex items-center gap-2">
                                      <select
                                        value={tierMode}
                                        onChange={(e) => onSetWorkspaceTier(m.workspaceId, e.target.value as WorkspaceTierMode)}
                                        disabled={busy}
                                        className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200"
                                      >
                                        <option value="SOLO">SOLO</option>
                                        <option value="ENTERPRISE_STRIPE">ENTERPRISE (Stripe)</option>
                                        <option value="ENTERPRISE_MANUAL">ENTERPRISE (Manual)</option>
                                      </select>
                                      {busy ? <span className="text-[11px] text-slate-400">Saving…</span> : null}
                                    </div>
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                                    <span className={`inline-flex items-center rounded-full border px-2 py-1 font-semibold ${toneBadge(access.tone)}`}>
                                      {access.label}
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-1 font-semibold text-slate-200">
                                      {safeStr(b.plan) || "—"}
                                    </span>

                                    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-1 font-semibold text-slate-200">
                                      {safeStr(b.subscriptionStatus) || "—"}
                                    </span>

                                    <span
                                      className={`inline-flex items-center rounded-full border px-2 py-1 font-semibold ${toneBadge(
                                        seatsTone(b.seatsUsed, b.includedSeats)
                                      )}`}
                                    >
                                      Seats: {seats}
                                    </span>

                                    <span className={`inline-flex items-center rounded-full border px-2 py-1 font-semibold ${toneBadge(stripe.tone)}`}>
                                      {stripe.label}
                                    </span>

                                    {b.seatLimit != null ? (
                                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-1 font-semibold text-slate-200">
                                        Limit: {b.seatLimit}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="mt-2 flex items-center gap-2">
                                    <button
                                      onClick={() => onOpenStripe(b.stripeCustomerId ?? null)}
                                      disabled={!b.stripeCustomerId}
                                      className={
                                        "rounded px-2 py-1 text-[11px] font-semibold border " +
                                        (b.stripeCustomerId
                                          ? "bg-indigo-500/10 text-indigo-200 border-indigo-400/30 hover:bg-indigo-500/20"
                                          : "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed")
                                      }
                                    >
                                      Portal
                                    </button>

                                    <button
                                      onClick={() => onSyncWorkspace(m.workspaceId)}
                                      disabled={syncingWorkspaceId === m.workspaceId}
                                      className={
                                        "rounded px-2 py-1 text-[11px] font-semibold border " +
                                        (syncingWorkspaceId === m.workspaceId
                                          ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                                          : "bg-sky-500/10 text-sky-200 border-sky-400/30 hover:bg-sky-500/20")
                                      }
                                    >
                                      {syncingWorkspaceId === m.workspaceId ? "Syncing…" : "Sync"}
                                    </button>

                                    <div className="ml-auto text-[10px] text-slate-500">Joined: {m.joinedAt ? formatDateTime(m.joinedAt) : "—"}</div>
                                  </div>

                                  <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] text-slate-500">
                                    <div>Trial ends: {formatDateTime(b.trialEndsAt)}</div>
                                    <div>Period end: {formatDateTime(b.currentPeriodEnd)}</div>
                                    <div>
                                      Stripe: {b.stripeCustomerId ? `cus_…${b.stripeCustomerId.slice(-6)}` : "—"}{" "}
                                      {b.stripeSubscriptionId ? `• sub_…${b.stripeSubscriptionId.slice(-6)}` : ""}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
