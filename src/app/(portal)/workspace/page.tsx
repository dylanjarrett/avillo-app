// src/app/(portal)/workspace/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { signOut } from "next-auth/react";

import { MembersCard } from "@/components/workspace/members-card";
import { InvitesCard } from "@/components/workspace/invites-card";
import { CardShell, RoleBadge, TextInput, PillButton } from "@/components/workspace/workspace-ui";

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

type RenameResponse =
  | { ok: true; workspace: { id: string; name: string; updatedAt?: string } }
  | { ok?: false; error: string };

function normalizeName(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

export default function WorkspacePage() {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceMe | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rename state
  const canRename = workspace?.role === "OWNER";
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSuccess, setRenameSuccess] = useState<string | null>(null);

  const successTimer = useRef<number | null>(null);

  const isDirty = useMemo(() => {
    if (!workspace) return false;
    return normalizeName(draftName) !== normalizeName(workspace.name);
  }, [draftName, workspace]);

  const validationError = useMemo(() => {
    const name = normalizeName(draftName);
    if (!canRename) return null;
    if (!name) return "Workspace name is required.";
    if (name.length < 2) return "Workspace name must be at least 2 characters.";
    if (name.length > 60) return "Workspace name must be 60 characters or fewer.";
    return null;
  }, [draftName, canRename]);

  function clearSuccessSoon() {
    if (successTimer.current) window.clearTimeout(successTimer.current);
    successTimer.current = window.setTimeout(() => setRenameSuccess(null), 2200);
  }

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
          setDraftName(data.workspace.name);
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
      if (successTimer.current) window.clearTimeout(successTimer.current);
    };
  }, []);

  async function saveRename() {
    if (!workspace || !canRename) return;

    setRenameError(null);
    setRenameSuccess(null);

    const nextName = normalizeName(draftName);

    // Client-side validation (mirrors server)
    if (!nextName || nextName.length < 2 || nextName.length > 60) {
      setRenameError(
        !nextName
          ? "Workspace name is required."
          : nextName.length < 2
            ? "Workspace name must be at least 2 characters."
            : "Workspace name must be 60 characters or fewer."
      );
      return;
    }

    // Optimistic update
    const prev = workspace;
    setWorkspace({ ...workspace, name: nextName });
    setRenaming(true);

    try {
      const res = await fetch("/api/workspaces/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, name: nextName }),
      });

      const data: RenameResponse = await res.json().catch(() => ({} as any));

      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        const msg = (data as any)?.error ?? "Unable to rename workspace.";
        setRenameError(msg);
        setWorkspace(prev); // rollback
        setDraftName(prev.name);
        return;
      }

      setWorkspace((w) => (w ? { ...w, name: data.workspace.name } : w));
      setDraftName(data.workspace.name);

      setRenameSuccess("Saved");
      clearSuccessSoon();
    } catch (err) {
      console.error("Failed to rename workspace", err);
      setRenameError("Something went wrong while saving.");
      setWorkspace(prev); // rollback
      setDraftName(prev.name);
    } finally {
      setRenaming(false);
    }
  }

  const roleBadgeOrDash = workspace ? (
    <RoleBadge role={workspace.role} />
  ) : (
    <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-400">
      —
    </span>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="WORKSPACE"
        title="Workspace settings"
        subtitle="Manage your team members, seat invites, roles, and ownership. Workspace settings apply to everyone in this tenant."
      />

      {/* 2x2 grid layout:
          [WORKSPACE]  [OWNERSHIP & PERMISSIONS]
          [MEMBERS]       [SEAT INVITES]
      */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        {/* WORKSPACE (top-left) */}
        <CardShell
          title="Workspace"
          subtitle="Your workspace controls data isolation (contacts, listings, tasks, automations, SMS, and pins)."
          right={roleBadgeOrDash}
        >
          {loading ? (
            <p className="text-xs text-slate-400/90">Loading workspace…</p>
          ) : error ? (
            <p className="text-xs text-rose-300">{error}</p>
          ) : !workspace ? (
            <p className="text-xs text-slate-400/90">No workspace selected.</p>
          ) : (
            <div className="flex h-full flex-col">
              {/* main content */}
              <div className="flex-1 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <TextInput
                      label="Workspace name"
                      value={draftName}
                      onChange={(v) => {
                        setRenameError(null);
                        setRenameSuccess(null);
                        setDraftName(v);
                      }}
                      disabled={!canRename || renaming}
                      helper={
                        canRename
                          ? "Owners can rename the workspace. Changes apply instantly across the tenant."
                          : "Only Owners can rename the workspace."
                      }
                      error={renameError ?? validationError}
                      autoComplete="off"
                    />
                  </div>

                  {canRename ? (
                    <div className="pt-6">
                      <PillButton
                        intent="primary"
                        size="sm"
                        disabled={renaming || !isDirty || !!validationError}
                        onClick={saveRename}
                        title={!isDirty ? "No changes to save" : "Save workspace name"}
                      >
                        {renaming ? "Saving…" : renameSuccess ? "Saved" : "Save"}
                      </PillButton>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* bottom pinned field to keep height rhythm consistent */}
              <div className="pt-3">
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

        {/* OWNERSHIP & PERMISSIONS (top-right) */}
        <div className="relative h-full">
          <CardShell
            title="Ownership & permissions"
            subtitle="System-level control for this workspace."
          >
            {/* Cream glass layers (inside CardShell so they render) */}
            {/* Soft inner halo */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl
                ring-1 ring-amber-100/10
                shadow-[inset_0_0_60px_rgba(248,250,252,0.10)]"
            />

            {/* Subtle diagonal glass streak */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 left-8 h-40 w-[520px] rotate-12 rounded-full
                bg-[linear-gradient(90deg,transparent,rgba(248,250,252,0.10),transparent)]
                blur-xl opacity-40"
            />

            {/* Faint structural divider */}
            <div
              aria-hidden
              className="relative mb-4 h-px w-full
                bg-gradient-to-r
                from-transparent
                via-amber-100/20
                to-transparent"
            />

            {/* Content */}
            <div className="relative flex h-full flex-col">
              <div className="flex-1 space-y-4 text-xs text-slate-300/90">
                <div>
                  <p className="font-semibold text-amber-100">Owner</p>
                  <p className="mt-0.5">
                    Full authority over workspace configuration, billing access, and ownership transfer.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-amber-100">Admin</p>
                  <p className="mt-0.5">
                    Manages members, roles, and seat invites without ownership privileges.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-amber-100">Agent</p>
                  <p className="mt-0.5">
                    Operates within the workspace with assigned access and visibility.
                  </p>
                </div>
              </div>
            </div>
          </CardShell>
        </div>


        {/* MEMBERS (bottom-left) */}
        {workspace && userId ? (
          <MembersCard
            workspaceId={workspace.id}
            currentUserId={userId}
            workspaceRole={workspace.role}
          />
        ) : (
          <CardShell title="Members" subtitle="Loading member access…">
            <p className="text-xs text-slate-400/90">
              {loading ? "Loading…" : "Workspace not available."}
            </p>
          </CardShell>
        )}

        {/* SEAT INVITES (bottom-right) */}
        {workspace ? (
          <InvitesCard workspaceId={workspace.id} workspaceRole={workspace.role} />
        ) : (
          <CardShell title="Seat invites" subtitle="Loading invites…">
            <p className="text-xs text-slate-400/90">
              {loading ? "Loading…" : "Workspace not available."}
            </p>
          </CardShell>
        )}
      </div>
    </div>
  );
}