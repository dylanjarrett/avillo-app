// components/workspace/members-card.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { CardShell, PillButton, RoleBadge, cx } from "./workspace-ui";
import { TransferOwnershipModal } from "./transfer-ownership-modal";

type Member = {
  userId: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  joinedAt?: string;
  removedAt?: string | null;
  user: { id: string; name: string | null; email: string; image: string | null };
};

type MembersResponse =
  | { ok: true; workspaceRole: "OWNER" | "ADMIN" | "AGENT"; members: Member[] }
  | { ok?: false; error: string };

function prettyName(m: Member) {
  return m.user?.name?.trim() || m.user?.email || "Member";
}

function canManage(workspaceRole: Member["role"]) {
  return workspaceRole === "OWNER" || workspaceRole === "ADMIN";
}

export function MembersCard({
  workspaceId,
  currentUserId,
  workspaceRole,
}: {
  workspaceId: string;
  currentUserId: string;
  workspaceRole: "OWNER" | "ADMIN" | "AGENT";
}) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [transferOpen, setTransferOpen] = useState(false);

  const isOwner = workspaceRole === "OWNER";
  const isManager = canManage(workspaceRole);

  async function load() {
    setLoading(true);
    setError(null);
    setToast(null);

    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, {
        cache: "no-store",
      });

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const data: MembersResponse = await res.json().catch(() => ({} as any));

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        setError((data as any)?.error ?? "Failed to load members.");
        return;
      }

      setMembers(data.members || []);
    } catch (e) {
      console.error(e);
      setError("Something went wrong loading members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const ownersCount = useMemo(
    () => members.filter((m) => m.role === "OWNER" && !m.removedAt).length,
    [members]
  );

  function myRow(m: Member) {
    return m.userId === currentUserId;
  }

  function canEditTarget(target: Member) {
    if (!isManager) return false;
    if (target.removedAt) return false;
    if (workspaceRole === "ADMIN" && target.role === "OWNER") return false;
    return true;
  }

  function canRemoveTarget(target: Member) {
    if (!isManager) return false;
    if (target.removedAt) return false;
    if (target.userId === currentUserId) return false;
    if (workspaceRole === "ADMIN" && target.role === "OWNER") return false;
    if (target.role === "OWNER" && ownersCount <= 1) return false;
    return true;
  }

  async function changeRole(targetUserId: string, role: "ADMIN" | "AGENT") {
    setBusyUserId(targetUserId);
    setToast(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(targetUserId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data?.ok === false) {
        setError(data?.error ?? "Failed to update role.");
        return;
      }

      setToast("Role updated.");
      await load();
    } catch (e) {
      console.error(e);
      setError("Something went wrong updating role.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(targetUserId: string) {
    setBusyUserId(targetUserId);
    setToast(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(targetUserId)}`,
        { method: "DELETE" }
      );

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data?.ok === false) {
        setError(data?.error ?? "Failed to remove member.");
        return;
      }

      setToast("Member removed.");
      await load();
    } catch (e) {
      console.error(e);
      setError("Something went wrong removing member.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <>
      <CardShell
        title="Members"
        subtitle="Manage who can access this workspace. Keep it simple: Owners control everything, Admins manage access, Agents use the workspace."
        right={
          isOwner ? (
            <PillButton
              intent="neutral"
              onClick={() => setTransferOpen(true)}
              disabled={loading || members.length < 2}
              title={members.length < 2 ? "Add at least one more member to transfer ownership." : "Transfer ownership"}
            >
              Transfer ownership
            </PillButton>
          ) : (
            <RoleBadge role={workspaceRole} />
          )
        }
      >
        {loading ? (
          <p className="text-xs text-slate-400/90">Loading members…</p>
        ) : error ? (
          <p className="text-xs text-rose-300">{error}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400/90">
                {members.length} member{members.length === 1 ? "" : "s"} • {ownersCount} owner{ownersCount === 1 ? "" : "s"}
              </p>
              {toast ? <p className="text-[11px] text-emerald-300">{toast}</p> : null}
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/35">
              <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)_minmax(0,0.9fr)] gap-2 border-b border-slate-800 px-4 py-3 text-[11px] font-semibold text-slate-300/80">
                <div>Member</div>
                <div>Role</div>
                <div className="text-right">Actions</div>
              </div>

              <div className="divide-y divide-slate-800">
                {members
                  .filter((m) => !m.removedAt)
                  .map((m) => {
                    const mine = myRow(m);
                    const editable = canEditTarget(m);
                    const removable = canRemoveTarget(m);
                    const busy = busyUserId === m.userId;

                    return (
                      <div
                        key={m.userId}
                        className={cx(
                          "grid grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)_minmax(0,0.9fr)] gap-2 px-4 py-3",
                          mine ? "bg-amber-50/5" : "bg-transparent"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-50">
                            {prettyName(m)} {mine ? <span className="text-amber-100/90">(you)</span> : null}
                          </p>
                          <p className="truncate text-[11px] text-slate-400/90">{m.user.email}</p>
                        </div>

                        <div className="flex items-center">
                          {m.role === "OWNER" ? (
                            <RoleBadge role="OWNER" />
                          ) : (
                            <select
                              value={m.role}
                              disabled={!editable || busy}
                              onChange={(e) => {
                                const next = e.target.value as "ADMIN" | "AGENT" | "OWNER";
                                if (next === "OWNER") return;
                                void changeRole(m.userId, next as any);
                              }}
                              className={cx(
                                "w-full rounded-xl border bg-slate-900/70 px-3 py-2 text-[11px] outline-none ring-0",
                                editable && !busy
                                  ? "border-slate-600 text-slate-50 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                                  : "cursor-not-allowed border-slate-700 bg-slate-900/50 text-slate-400"
                              )}
                            >
                              <option value="AGENT">AGENT</option>
                              <option value="ADMIN">ADMIN</option>
                            </select>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <PillButton
                            intent="danger"
                            disabled={!removable || busy}
                            onClick={() => {
                              const ok = window.confirm(`Remove ${prettyName(m)} from this workspace?`);
                              if (!ok) return;
                              void removeMember(m.userId);
                            }}
                          >
                            {busy ? "Working…" : "Remove"}
                          </PillButton>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {!isManager ? (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-300/90">
                  You’re an <span className="font-semibold text-amber-100">Agent</span>. Only Owners and Admins can manage members.
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardShell>

      <TransferOwnershipModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        workspaceId={workspaceId}
        members={members}
        currentUserId={currentUserId}
        onTransferred={load}
      />
    </>
  );
}