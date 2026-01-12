// src/app/(portal)/workspace/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { signOut } from "next-auth/react";

import { MembersCard } from "@/components/workspace/members-card";
import { InvitesCard } from "@/components/workspace/invites-card";
import { CardShell, RoleBadge } from "@/components/workspace/workspace-ui";

type WorkspaceRole = "OWNER" | "ADMIN" | "AGENT";

type WorkspaceMe = {
  id: string;
  name: string;
  role: WorkspaceRole;
  type?: "PERSONAL" | "TEAM";
  accessLevel?: "BETA" | "PAID" | "EXPIRED";
  plan?: "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE";
  subscriptionStatus?: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  seatLimit?: number;
  includedSeats?: number;
};

type WorkspaceMeResponse =
  | { ok: true; userId: string; workspace: WorkspaceMe }
  | { ok?: false; error: string };

export default function WorkspacePage() {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceMe | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/workspaces/me", { cache: "no-store" });
        const data: WorkspaceMeResponse = await res.json().catch(() => ({} as any));

        if (res.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!res.ok || !data || !("ok" in data) || !data.ok) {
          if (!cancelled) {
            setError((data as any)?.error ?? "There was an issue loading your workspace.");
          }
          return;
        }

        if (!cancelled) {
          setWorkspace(data.workspace);
          setUserId(data.userId);
        }
      } catch (err) {
        console.error("Failed to load workspace", err);
        if (!cancelled) setError("Something went wrong while loading your workspace.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="WORKSPACE"
        title="Workspace settings"
        subtitle="Manage your team members, seat invites, roles, and ownership. Workspace settings apply to everyone in this tenant."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Left column */}
        <div className="space-y-6">
          <CardShell
            title="Workspace"
            subtitle="Your workspace controls data isolation (contacts, listings, tasks, automations, SMS, and pins)."
            right={
              workspace ? (
                <RoleBadge role={workspace.role} />
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-400">
                  —
                </span>
              )
            }
          >
            {loading ? (
              <p className="text-xs text-slate-400/90">Loading workspace…</p>
            ) : error ? (
              <p className="text-xs text-rose-300">{error}</p>
            ) : !workspace ? (
              <p className="text-xs text-slate-400/90">No workspace selected.</p>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Workspace name
                  </label>
                  <input
                    value={workspace.name}
                    readOnly
                    className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300 outline-none ring-0"
                  />
                  <p className="mt-1 text-[11px] text-slate-400/90">
                    Name editing is coming soon.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-200/90">
                    Workspace ID
                  </label>
                  <input
                    value={workspace.id}
                    readOnly
                    className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 font-mono text-[11px] text-slate-400 outline-none ring-0"
                  />
                </div>
              </div>
            )}
          </CardShell>

          {workspace && userId ? (
            <MembersCard
              workspaceId={workspace.id}
              currentUserId={userId}
              workspaceRole={workspace.role}
            />
          ) : (
            <CardShell title="Members" subtitle="Loading member access…">
              <p className="text-xs text-slate-400/90">{loading ? "Loading…" : "Workspace not available."}</p>
            </CardShell>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {workspace ? (
            <InvitesCard workspaceId={workspace.id} workspaceRole={workspace.role} />
          ) : (
            <CardShell title="Seat invites" subtitle="Loading invites…">
              <p className="text-xs text-slate-400/90">{loading ? "Loading…" : "Workspace not available."}</p>
            </CardShell>
          )}

          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-300/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Ownership &amp; permissions
            </p>
            <p className="mt-2">
              <span className="font-semibold text-amber-100">Owners</span> control
              workspace-wide settings and can transfer ownership.{" "}
              <span className="font-semibold text-amber-100">Admins</span> can
              manage access and invites.{" "}
              <span className="font-semibold text-amber-100">Agents</span> can view
              workspace details.
            </p>
            <p className="mt-2 text-[11px] text-slate-400/90">
              All actions are scoped to the workspace in session (API routes auth inside handlers). No cross-tenant access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}