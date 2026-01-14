// components/workspace/invites-card.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { CardShell, PillButton, TextInput, cx} from "./workspace-ui";

type Invite = {
  id: string;
  email: string;
  emailKey: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

type SeatUsage = {
  seatLimit: number;
  includedSeats: number;
  usedSeats: number;
  pendingInvites: number;
  remaining: number;
  overBy?: number;
};

type InvitesOk = { ok: true; invites: Invite[]; seat: SeatUsage };
type InvitesErr = {
  ok?: false;
  error?: string;
  message?: string;
  code?: string;
  entitlement?: string;
  requiresPlan?: string;
  accessLevel?: string;
  plan?: string;
  subscriptionStatus?: string;
  seat?: SeatUsage;
};
type InvitesResponse = InvitesOk | InvitesErr;

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

function isManager(role: "OWNER" | "ADMIN" | "AGENT") {
  return role === "OWNER" || role === "ADMIN";
}

function statusPill(status: Invite["status"]) {
  if (status === "PENDING") return "border-amber-100/50 bg-amber-50/10 text-amber-100";
  if (status === "ACCEPTED") return "border-emerald-200/30 bg-emerald-500/10 text-emerald-200";
  if (status === "REVOKED") return "border-rose-200/30 bg-rose-500/10 text-rose-200";
  return "border-slate-600 bg-slate-900/60 text-slate-300";
}

function humanInviteError(data: any, fallback: string) {
  const code = String(data?.code || "");
  const entitlement = String(data?.entitlement || "");
  const msg = String(data?.message || data?.error || "");

  if (code === "PLAN_REQUIRED" || entitlement === "WORKSPACE_INVITE") {
    return msg || "Inviting seats requires Avillo Enterprise.";
  }
  return msg || fallback;
}

export function InvitesCard({
  workspaceId,
  workspaceRole,
}: {
  workspaceId: string;
  workspaceRole: "OWNER" | "ADMIN" | "AGENT";
}) {
  // Initial load ONLY
  const [loading, setLoading] = useState(true);

  // Mutations keep list visible (no blanking)
  const [mutating, setMutating] = useState(false);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [seat, setSeat] = useState<SeatUsage | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"AGENT" | "ADMIN" | "OWNER">("AGENT");
  const [creating, setCreating] = useState(false);

  // Track which invite row is busy (resend/revoke)
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  // Hide accepted by default (history)
  const [showAccepted, setShowAccepted] = useState(false);

  const manager = isManager(workspaceRole);
  const canInviteOwner = workspaceRole === "OWNER";

  const emailValid = useMemo(() => {
    const e = normalizeEmail(email);
    return e.length > 5 && e.includes("@") && e.includes(".") && e.length <= 120;
  }, [email]);

  const acceptedCount = useMemo(
    () => (invites || []).filter((i) => i.status === "ACCEPTED").length,
    [invites]
  );

  const visibleInvites = useMemo(() => {
    const list = invites || [];
    return showAccepted ? list : list.filter((i) => i.status !== "ACCEPTED");
  }, [invites, showAccepted]);

  async function fetchInvites(opts?: { showInitialLoader?: boolean }) {
    const showInitialLoader = opts?.showInitialLoader ?? false;

    if (showInitialLoader) setLoading(true);
    setError(null);
    setUpgradeHint(null);

    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, {
        cache: "no-store",
      });

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const data: InvitesResponse = await res.json().catch(() => ({} as any));

      if (!res.ok || !data || !("ok" in data) || !(data as any).ok) {
        const msg = humanInviteError(data, "Failed to load invites.");
        setError(msg);

        if ((data as any)?.code === "PLAN_REQUIRED" || (data as any)?.entitlement === "WORKSPACE_INVITE") {
          setUpgradeHint("Your workspace is not on Enterprise. Upgrade to unlock seat invites.");
        }

        if ((data as any)?.seat) setSeat((data as any).seat);
        return;
      }

      const ok = data as InvitesOk;
      setInvites(ok.invites || []);
      setSeat(ok.seat ?? null);
    } catch (e) {
      console.error(e);
      setError("Something went wrong loading invites.");
    } finally {
      if (showInitialLoader) setLoading(false);
    }
  }

  useEffect(() => {
    // Initial load / workspace switch uses loader
    void (async () => {
      setLoading(true);
      await fetchInvites({ showInitialLoader: false });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function createInvite() {
    if (!manager) return;
    if (!emailValid) return;
    if (role === "OWNER" && !canInviteOwner) return;

    setCreating(true);
    setMutating(true);
    setToast(null);
    setError(null);
    setUpgradeHint(null);

    const optimisticId = `optimistic_${Date.now()}`;
    const optimisticInvite: Invite = {
      id: optimisticId,
      email: normalizeEmail(email),
      emailKey: normalizeEmail(email),
      role,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      createdAt: new Date().toISOString(),
    };

    setInvites((prev) => {
      // prevent dup pending rows for same email
      const exists = prev.some((x) => x.emailKey === optimisticInvite.emailKey && x.status === "PENDING");
      return exists ? prev : [optimisticInvite, ...prev];
    });

    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email), role }),
      });

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const data: any = await res.json().catch(() => ({} as any));

      if (!res.ok || data?.ok === false) {
        const msg = humanInviteError(data, "Failed to create invite.");
        setError(msg);

        if (data?.code === "PLAN_REQUIRED" || data?.entitlement === "WORKSPACE_INVITE") {
          setUpgradeHint("Invites are locked to Enterprise. Go to Billing to upgrade and enable seats.");
        }

        if (data?.seat) setSeat(data.seat);

        // rollback optimistic
        setInvites((prev) => prev.filter((x) => x.id !== optimisticId));
        return;
      }

      setToast("Invite created.");
      setEmail("");
      setRole("AGENT");

      // background refresh (no blanking)
      await fetchInvites({ showInitialLoader: false });
    } catch (e) {
      console.error(e);
      setError("Something went wrong creating invite.");
      setInvites((prev) => prev.filter((x) => x.id !== optimisticId));
    } finally {
      setCreating(false);
      setMutating(false);
    }
  }

  async function action(inviteId: string, act: "revoke" | "resend") {
    if (!manager) return;

    setBusyInviteId(inviteId);
    setMutating(true);
    setToast(null);
    setError(null);
    setUpgradeHint(null);

    let rollbackSnapshot: Invite[] | null = null;

    if (act === "revoke") {
      setInvites((prev) => {
        rollbackSnapshot = prev;
        return prev.map((x) =>
          x.id === inviteId ? { ...x, status: "REVOKED", revokedAt: new Date().toISOString() } : x
        );
      });
    }

    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, action: act }),
      });

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const data: any = await res.json().catch(() => ({} as any));

      if (!res.ok || data?.ok === false) {
        const msg = humanInviteError(data, "Action failed.");
        setError(msg);

        if (data?.code === "PLAN_REQUIRED" || data?.entitlement === "WORKSPACE_INVITE") {
          setUpgradeHint("Invites are locked to Enterprise. Upgrade to resend seat invites.");
        }

        if (data?.seat) setSeat(data.seat);

        if (rollbackSnapshot) setInvites(rollbackSnapshot);
        return;
      }

      setToast(act === "revoke" ? "Invite revoked." : "Invite resent.");

      // background refresh (no blanking)
      await fetchInvites({ showInitialLoader: false });
    } catch (e) {
      console.error(e);
      setError("Something went wrong performing that action.");
      if (rollbackSnapshot) setInvites(rollbackSnapshot);
    } finally {
      setBusyInviteId(null);
      setMutating(false);
    }
  }

  return (
    <CardShell
      title="Seat invites"
      subtitle="Invite a teammate with a link. Invites can be revoked or resent."
    >
      {/* Seat summary */}
      {seat ? (
        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/35 px-4 py-3">
          <p className="text-[11px] text-slate-300/90">
            Seats: <span className="font-semibold text-slate-50">{seat.usedSeats}</span> used •{" "}
            <span className="font-semibold text-slate-50">{seat.pendingInvites}</span> pending invites •{" "}
            <span className="font-semibold text-amber-100">{seat.remaining}</span> remaining{" "}
            <span className="text-slate-400/90">
              (limit: <span className="font-mono">{seat.seatLimit}</span>)
            </span>
          </p>
        </div>
      ) : null}

      {/* Enterprise gate banner */}
      {upgradeHint ? (
        <div className="mb-3 rounded-xl border border-amber-200/30 bg-amber-50/10 px-4 py-3">
          <p className="text-[11px] font-semibold text-amber-100">Enterprise required</p>
          <p className="mt-1 text-[11px] text-slate-200/90">{upgradeHint}</p>
          <p className="mt-1 text-[11px] text-slate-400/90">
            Go to <span className="font-semibold text-amber-100">Billing</span> to upgrade.
          </p>
        </div>
      ) : null}

      {!manager ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-300/90">
            Only <span className="font-semibold text-amber-100">Owners</span> and{" "}
            <span className="font-semibold text-amber-100">Admins</span> can send invites.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4">
          {/* Row 1: Email + Role */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-7">
              <TextInput
                label="Email"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  setToast(null);
                  setError(null);
                  setUpgradeHint(null);
                }}
                placeholder="teammate@brokerage.com"
                type="email"
                autoComplete="email"
                helper="We’ll generate a secure invite link (expires automatically)."
                error={!emailValid && email.length > 0 ? "Enter a valid email." : null}
              />
            </div>

            <div className="col-span-12 md:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-200/90">Role</label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as any);
                  setToast(null);
                  setError(null);
                  setUpgradeHint(null);
                }}
                className={cx(
                  "mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0",
                  "focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                )}
              >
                <option value="AGENT">AGENT</option>
                <option value="ADMIN">ADMIN</option>
                <option value="OWNER" disabled={!canInviteOwner}>
                  OWNER {canInviteOwner ? "" : "(Owner only)"}
                </option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400/90">Default to Agent unless they’ll manage access.</p>
            </div>
          </div>

          {/* Row 2: Button */}
          <div className="mt-3 flex items-center justify-end">
            <PillButton
              size="md"
              disabled={!emailValid || creating || (role === "OWNER" && !canInviteOwner)}
              onClick={createInvite}
            >
              {creating ? "Creating…" : "Create invite"}
            </PillButton>
          </div>

          {/* Status row */}
          <div className="mt-3 flex items-start justify-between gap-3">
            {toast ? <p className="text-[11px] text-emerald-300">{toast}</p> : <span />}
            {error ? <p className="text-[11px] text-rose-300 text-right">{error}</p> : null}
          </div>
        </div>
      )}

      {/* Invites list */}
      <div className="mt-4">
        {loading ? (
          <p className="text-xs text-slate-400/90">Loading invites…</p>
        ) : invites.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs text-slate-300/90">No invites yet. Create one above to add your first teammate.</p>
          </div>
        ) : (
          <>
            {/* History toggle row */}
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400/90">
                {visibleInvites.length} invite{visibleInvites.length === 1 ? "" : "s"}
                {acceptedCount ? <span className="text-slate-500/90"> • {acceptedCount} accepted (history)</span> : null}
              </p>

              {acceptedCount ? (
                <PillButton intent="neutral" onClick={() => setShowAccepted((v) => !v)}>
                  {showAccepted ? "Hide accepted" : "Show accepted"}
                </PillButton>
              ) : (
                <span />
              )}
            </div>

            {visibleInvites.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-300/90">
                  No active invites. {acceptedCount ? "Accepted invites are hidden in history." : null}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/35">
                {/* Header (responsive) */}
                <div className="grid grid-cols-12 gap-2 border-b border-slate-800 px-4 py-3 text-[11px] font-semibold text-slate-300/80">
                  <div className="col-span-12 md:col-span-6">Invite</div>
                  <div className="col-span-6 md:col-span-3">Status</div>
                  <div className="col-span-6 md:col-span-3 text-right">Actions</div>
                </div>

                <div className="divide-y divide-slate-800">
                  {visibleInvites.map((inv) => {
                    const busy = busyInviteId === inv.id;

                    // Actions are only relevant for non-accepted + non-optimistic
                    const isOptimistic = inv.id.startsWith("optimistic_");
                    const canAct = manager && inv.status !== "ACCEPTED" && !isOptimistic;

                    const showRowDim = mutating && busy;

                    return (
                      <div key={inv.id} className={cx("grid grid-cols-12 gap-2 px-4 py-3", showRowDim ? "opacity-80" : "")}>
                        {/* Invite */}
                        <div className="col-span-12 md:col-span-6 min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-50">{inv.email}</p>
                          <p className="truncate text-[11px] text-slate-400/90">
                            Role: <span className="font-mono text-amber-100/90">{inv.role}</span> • Expires{" "}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Status */}
                        <div className="col-span-6 md:col-span-3 flex items-center">
                          <span
                            className={cx(
                              "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold",
                              statusPill(inv.status)
                            )}
                          >
                            {isOptimistic ? "CREATING" : inv.status}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="col-span-6 md:col-span-3 flex flex-wrap items-center justify-end gap-2">
                          {inv.status === "ACCEPTED" ? (
                            <span className="text-[11px] text-slate-500/90">History</span>
                          ) : (
                            <>
                              <PillButton
                                intent="neutral"
                                disabled={!canAct || busy}
                                onClick={() => action(inv.id, "resend")}
                              >
                                {busy ? "Working…" : "Resend"}
                              </PillButton>

                              <PillButton
                                intent="danger"
                                disabled={!canAct || busy || inv.status !== "PENDING"}
                                onClick={() => {
                                  const ok = window.confirm(`Revoke invite for ${inv.email}?`);
                                  if (!ok) return;
                                  void action(inv.id, "revoke");
                                }}
                              >
                                Revoke
                              </PillButton>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </CardShell>
  );
}