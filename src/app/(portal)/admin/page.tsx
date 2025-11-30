// src/app/(portal)/admin/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import type { UserRole, SubscriptionPlan } from "@prisma/client";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  brokerage: string;
  role: UserRole;
  plan: SubscriptionPlan;
  lastLoginAt: string | null;
  createdAt: string;
  openAITokensUsed: number;
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to load users");

      const data = await res.json();
      setUsers(data.users);
    } catch (err: any) {
      console.error("Admin load users error", err);
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  // ---- Search / filtering ----
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;

    return users.filter((u) => {
      return (
        (u.name || "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.brokerage || "").toLowerCase().includes(q)
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

  // ---- Mutations ----
  async function updateRole(userId: string, role: UserRole) {
    setSavingUserId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });

      if (!res.ok) throw new Error("Failed to update user role");

      const data = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
    } catch (err: any) {
      console.error("Admin updateRole error", err);
      setError(err.message || "Failed to update role.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function updatePlan(userId: string, plan: SubscriptionPlan) {
    setSavingUserId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan }),
      });

      if (!res.ok) throw new Error("Failed to update user plan");

      const data = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
    } catch (err: any) {
      console.error("Admin updatePlan error", err);
      setError(err.message || "Failed to update plan.");
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Avillo control panel"
        subtitle="Review user access, roles, plans, and OpenAI usage."
      />

      <section className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
        {/* Top bar: search + status */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Users &amp; access
            </p>
            <p className="mt-1 text-[11px] text-slate-300/80">
              Filter by name, email, or brokerage. Admin accounts are listed
              separately from standard users.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              className="avillo-input w-full sm:w-64"
            />
            {loading && (
              <span className="text-[11px] text-slate-400 text-right">
                Loading…
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="mb-3 text-[11px] text-red-300">Failed to load users.</p>
        )}

        {!loading && !error && users.length === 0 && (
          <p className="text-[11px] text-slate-400">
            No users found yet. Accounts will appear here as they sign up.
          </p>
        )}

        {!loading && users.length > 0 && (
          <div className="space-y-8">
            {/* Admin table */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                Admin accounts
              </p>
              {admins.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No admins match this search.
                </p>
              ) : (
                <UserTable
                  users={admins}
                  savingUserId={savingUserId}
                  onChangeRole={updateRole}
                  onChangePlan={updatePlan}
                />
              )}
            </div>

            {/* Non-admin table */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                User accounts
              </p>
              {nonAdmins.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No users match this search.
                </p>
              ) : (
                <UserTable
                  users={nonAdmins}
                  savingUserId={savingUserId}
                  onChangeRole={updateRole}
                  onChangePlan={updatePlan}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------
 * Shared table component
 * -----------------------------------*/

function UserTable({
  users,
  savingUserId,
  onChangeRole,
  onChangePlan,
}: {
  users: AdminUser[];
  savingUserId: string | null;
  onChangeRole: (userId: string, role: UserRole) => void;
  onChangePlan: (userId: string, plan: SubscriptionPlan) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
      <table className="min-w-full text-left text-sm text-slate-200">
        <thead>
          <tr className="text-[11px] uppercase text-slate-400 border-b border-slate-800/80 bg-slate-950/80">
            <th className="px-4 py-2">User</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Brokerage</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Plan</th>
            <th className="px-4 py-2">OpenAI tokens</th>
            <th className="px-4 py-2">Last login</th>
            <th className="px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, idx) => (
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
                  onChange={(e) =>
                    onChangeRole(u.id, e.target.value as UserRole)
                  }
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[12px]"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>

              <td className="px-4 py-2">
                <select
                  disabled={savingUserId === u.id}
                  value={u.plan}
                  onChange={(e) =>
                    onChangePlan(u.id, e.target.value as SubscriptionPlan)
                  }
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[12px]"
                >
                  <option value="FOUNDING_AGENT">FOUNDING_AGENT</option>
                  <option value="PRO">PRO</option>
                  <option value="FREE_TRIAL">FREE_TRIAL</option>
                </select>
              </td>

              <td className="px-4 py-2">{u.openAITokensUsed}</td>
              <td className="px-4 py-2">
                {u.lastLoginAt
                  ? new Date(u.lastLoginAt).toLocaleString()
                  : "—"}
              </td>
              <td className="px-4 py-2">
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}