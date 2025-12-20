"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import type {
  UserRole,
  SubscriptionPlan,
  SubscriptionStatus,
  AccessLevel,
} from "@prisma/client";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  brokerage: string;
  role: UserRole;

  accessLevel: AccessLevel;

  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;

  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;

  lastLoginAt: string | null;
  createdAt: string;
  openAITokensUsed: number;
};

type Metrics = {
  totals: {
    totalUsers: number;
    adminCount: number;
    activePaidCount: number;
  };
  statuses: Record<string, number>;
  revenue: { mrrUsd: number };
};

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

function stripeSyncBadge(u: AdminUser) {
  // Manual grants can be “OK” even without Stripe ids
  if (u.plan === "FOUNDING_PRO" && u.subscriptionStatus === "ACTIVE") {
    return { label: "Manual / OK", tone: "good" as const };
  }

  if (!u.stripeCustomerId) return { label: "Missing customer", tone: "bad" as const };
  if (!u.subscriptionStatus) return { label: "Missing status", tone: "warn" as const };
  if (!u.stripeSubscriptionId) return { label: "Missing sub", tone: "warn" as const };
  if (!u.stripePriceId) return { label: "Missing price", tone: "warn" as const };

  return { label: "Synced", tone: "good" as const };
}

function accessBadge(accessLevel: AccessLevel) {
  if (accessLevel === "BETA") return { label: "BETA", tone: "warn" as const };
  if (accessLevel === "EXPIRED") return { label: "EXPIRED", tone: "bad" as const };
  return { label: "PAID", tone: "good" as const };
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [syncingUserId, setSyncingUserId] = useState<string | null>(null);

  const [closingBeta, setClosingBeta] = useState(false);

  const [query, setQuery] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load users");

      const data = await res.json();
      setUsers(data.users || []);
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
      const data = await res.json();
      setMetrics(data);
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
    const q = query.trim().toLowerCase();
    if (!q) return users;

    return users.filter((u) => {
      return (
        (u.name || "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.brokerage || "").toLowerCase().includes(q) ||
        (u.accessLevel || "").toLowerCase().includes(q) ||
        (u.plan || "").toLowerCase().includes(q) ||
        (u.subscriptionStatus || "").toLowerCase().includes(q) ||
        (u.stripeCustomerId || "").toLowerCase().includes(q)
      );
    });
  }, [users, query]);

  const admins = useMemo(
    () => filteredUsers.filter((u) => u.role === "ADMIN"),
    [filteredUsers]
  );
  const nonAdmins = useMemo(
    () => filteredUsers.filter((u) => u.role !== "ADMIN"),
    [filteredUsers]
  );

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

      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      void loadMetrics();
    } catch (err: any) {
      console.error("Admin patch error", err);
      setError(err.message || "Failed to update user.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function syncFromStripe(userId: string) {
    setSyncingUserId(userId);
    setError(null);

    try {
      const res = await fetch("/api/admin/stripe/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to sync from Stripe");

      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      void loadMetrics();
    } catch (err: any) {
      console.error("Sync from Stripe error", err);
      setError(err.message || "Failed to sync from Stripe.");
    } finally {
      setSyncingUserId(null);
    }
  }

  async function openStripePortal(stripeCustomerId: string | null) {
    if (!stripeCustomerId) return;
    setError(null);

    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeCustomerId }),
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
    const ok = window.confirm(
      "Close beta globally?\n\nThis will move ALL users with accessLevel=BETA to accessLevel=EXPIRED and force the upgrade modal everywhere."
    );
    if (!ok) return;

    setClosingBeta(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/beta/close", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to close beta");

      // Refresh users + metrics so the table reflects EXPIRED
      await loadUsers();
      await loadMetrics();

      // Small, visible confirmation
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
        subtitle="Manage users, access levels, live Stripe sync, and revenue snapshots."
      />

      {/* Metrics */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Total users</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {loadingMetrics ? "…" : metrics?.totals.totalUsers ?? "—"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Admins: {loadingMetrics ? "…" : metrics?.totals.adminCount ?? "—"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Active paid</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {loadingMetrics ? "…" : metrics?.totals.activePaidCount ?? "—"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Trialing: {loadingMetrics ? "…" : metrics?.statuses?.TRIALING ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">MRR</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {loadingMetrics ? "…" : `$${(metrics?.revenue?.mrrUsd ?? 0).toFixed(2)}`}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Stripe-derived monthly equivalent</p>
        </div>
      </section>

      {/* Users */}
      <section className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Users &amp; access
            </p>
            <p className="mt-1 text-[11px] text-slate-300/80">
              Search by name/email/brokerage/access/plan/status/customer id.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              className="avillo-input w-full sm:w-80"
            />

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
              title="Move all BETA users to EXPIRED"
            >
              {closingBeta ? "Closing beta…" : "Close beta globally"}
            </button>

            {loading && <span className="text-[11px] text-slate-400 text-right">Loading…</span>}
          </div>
        </div>

        {error && <p className="mb-3 text-[11px] text-red-300">{error}</p>}

        {!loading && !error && users.length === 0 && (
          <p className="text-[11px] text-slate-400">
            No users found yet. Accounts will appear here as they sign up.
          </p>
        )}

        {!loading && users.length > 0 && (
          <div className="space-y-8">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                Admin accounts
              </p>
              {admins.length === 0 ? (
                <p className="text-[11px] text-slate-400">No admins match this search.</p>
              ) : (
                <UserTable
                  users={admins}
                  savingUserId={savingUserId}
                  syncingUserId={syncingUserId}
                  onChangeRole={(id, role) => patchUser(id, { role })}
                  onChangeAccess={(id, accessLevel) => patchUser(id, { accessLevel })}
                  onChangePlan={(id, plan) => patchUser(id, { plan })}
                  onGrantBeta={(id) => patchUser(id, { action: "GRANT_BETA" })}
                  onExpireAccess={(id) => patchUser(id, { action: "EXPIRE_ACCESS" })}
                  onGrantFoundingPro={(id) => patchUser(id, { action: "GRANT_FOUNDING_PRO" })}
                  onOpenStripe={openStripePortal}
                  onSyncStripe={syncFromStripe}
                />
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                User accounts
              </p>
              {nonAdmins.length === 0 ? (
                <p className="text-[11px] text-slate-400">No users match this search.</p>
              ) : (
                <UserTable
                  users={nonAdmins}
                  savingUserId={savingUserId}
                  syncingUserId={syncingUserId}
                  onChangeRole={(id, role) => patchUser(id, { role })}
                  onChangeAccess={(id, accessLevel) => patchUser(id, { accessLevel })}
                  onChangePlan={(id, plan) => patchUser(id, { plan })}
                  onGrantBeta={(id) => patchUser(id, { action: "GRANT_BETA" })}
                  onExpireAccess={(id) => patchUser(id, { action: "EXPIRE_ACCESS" })}
                  onGrantFoundingPro={(id) => patchUser(id, { action: "GRANT_FOUNDING_PRO" })}
                  onOpenStripe={openStripePortal}
                  onSyncStripe={syncFromStripe}
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
  savingUserId,
  syncingUserId,
  onChangeRole,
  onChangeAccess,
  onChangePlan,
  onGrantBeta,
  onExpireAccess,
  onGrantFoundingPro,
  onOpenStripe,
  onSyncStripe,
}: {
  users: AdminUser[];
  savingUserId: string | null;
  syncingUserId: string | null;
  onChangeRole: (userId: string, role: UserRole) => void;
  onChangeAccess: (userId: string, accessLevel: AccessLevel) => void;
  onChangePlan: (userId: string, plan: SubscriptionPlan) => void;
  onGrantBeta: (userId: string) => void;
  onExpireAccess: (userId: string) => void;
  onGrantFoundingPro: (userId: string) => void;
  onOpenStripe: (stripeCustomerId: string | null) => void;
  onSyncStripe: (userId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
      <table className="min-w-[1650px] w-full text-left text-sm text-slate-200">
        <thead>
          <tr className="text-[11px] uppercase text-slate-400 border-b border-slate-800/80 bg-slate-950/80">
            <th className="px-4 py-2">User</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Brokerage</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Access</th>
            <th className="px-4 py-2">Plan</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Trial ends</th>
            <th className="px-4 py-2">Period end</th>
            <th className="px-4 py-2">Stripe sync</th>
            <th className="px-4 py-2">Stripe</th>
            <th className="px-4 py-2">Actions</th>
            <th className="px-4 py-2">Tokens</th>
            <th className="px-4 py-2">Last login</th>
            <th className="px-4 py-2">Created</th>
          </tr>
        </thead>

        <tbody>
          {users.map((u, idx) => {
            const stripeBadge = stripeSyncBadge(u);
            const stripeBadgeClass =
              stripeBadge.tone === "good"
                ? "bg-emerald-500/10 text-emerald-200 border-emerald-400/30"
                : stripeBadge.tone === "warn"
                ? "bg-amber-500/10 text-amber-200 border-amber-400/30"
                : "bg-red-500/10 text-red-200 border-red-400/30";

            const a = accessBadge(u.accessLevel);
            const accessClass =
              a.tone === "good"
                ? "bg-emerald-500/10 text-emerald-200 border-emerald-400/30"
                : a.tone === "warn"
                ? "bg-amber-500/10 text-amber-200 border-amber-400/30"
                : "bg-red-500/10 text-red-200 border-red-400/30";

            return (
              <tr
                key={u.id}
                className={
                  "border-b border-slate-800/60 text-[13px] " +
                  (idx % 2 === 0 ? "bg-slate-950/40" : "bg-slate-950/20")
                }
              >
                <td className="px-4 py-2">{u.name || "—"}</td>
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
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${accessClass}`}
                      title="Access override"
                    >
                      {a.label}
                    </span>

                    <select
                      disabled={savingUserId === u.id}
                      value={u.accessLevel}
                      onChange={(e) => onChangeAccess(u.id, e.target.value as AccessLevel)}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[12px]"
                    >
                      <option value="PAID">PAID</option>
                      <option value="BETA">BETA</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </div>
                </td>

                <td className="px-4 py-2">
                  <select
                    disabled={savingUserId === u.id}
                    value={u.plan}
                    onChange={(e) => onChangePlan(u.id, e.target.value as SubscriptionPlan)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[12px]"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PRO">PRO</option>
                    <option value="FOUNDING_PRO">FOUNDING_PRO</option>
                  </select>
                </td>

                <td className="px-4 py-2">{u.subscriptionStatus ?? "—"}</td>
                <td className="px-4 py-2">{formatDateTime(u.trialEndsAt)}</td>
                <td className="px-4 py-2">{formatDateTime(u.currentPeriodEnd)}</td>

                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${stripeBadgeClass}`}
                  >
                    {stripeBadge.label}
                  </span>
                </td>

                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenStripe(u.stripeCustomerId)}
                      disabled={!u.stripeCustomerId}
                      className={
                        "rounded px-2 py-1 text-[11px] font-semibold border " +
                        (u.stripeCustomerId
                          ? "bg-indigo-500/10 text-indigo-200 border-indigo-400/30 hover:bg-indigo-500/20"
                          : "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed")
                      }
                    >
                      Portal
                    </button>

                    <button
                      onClick={() => onSyncStripe(u.id)}
                      disabled={!u.stripeCustomerId || syncingUserId === u.id}
                      className={
                        "rounded px-2 py-1 text-[11px] font-semibold border " +
                        (!u.stripeCustomerId || syncingUserId === u.id
                          ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                          : "bg-sky-500/10 text-sky-200 border-sky-400/30 hover:bg-sky-500/20")
                      }
                    >
                      {syncingUserId === u.id ? "Syncing…" : "Sync"}
                    </button>
                  </div>

                  <div className="mt-1 text-[10px] text-slate-500">
                    {u.stripeCustomerId ? `cus: …${u.stripeCustomerId.slice(-6)}` : "no customer"}
                  </div>
                </td>

                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => onGrantBeta(u.id)}
                      disabled={savingUserId === u.id}
                      className={
                        "rounded px-2 py-1 text-[11px] font-semibold border " +
                        (savingUserId === u.id
                          ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                          : "bg-sky-500/10 text-sky-200 border-sky-400/30 hover:bg-sky-500/20")
                      }
                      title="Set accessLevel=BETA (no Stripe required)"
                    >
                      Grant Beta
                    </button>

                    <button
                      onClick={() => onExpireAccess(u.id)}
                      disabled={savingUserId === u.id}
                      className={
                        "rounded px-2 py-1 text-[11px] font-semibold border " +
                        (savingUserId === u.id
                          ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                          : "bg-rose-500/10 text-rose-200 border-rose-400/30 hover:bg-rose-500/20")
                      }
                      title="Set accessLevel=EXPIRED (forces upgrade modal gating)"
                    >
                      Expire
                    </button>

                    <button
                      onClick={() => onGrantFoundingPro(u.id)}
                      disabled={savingUserId === u.id}
                      className={
                        "rounded px-2 py-1 text-[11px] font-semibold border " +
                        (savingUserId === u.id
                          ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                          : "bg-amber-500/10 text-amber-200 border-amber-400/30 hover:bg-amber-500/20")
                      }
                    >
                      Grant Founding Pro
                    </button>
                  </div>
                </td>

                <td className="px-4 py-2">{u.openAITokensUsed}</td>
                <td className="px-4 py-2">{formatDateTime(u.lastLoginAt)}</td>
                <td className="px-4 py-2">{formatDateOnly(u.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}