//components/workspace/transfer-ownership-modal.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Modal, PillButton, TextInput, cx } from "./workspace-ui";

type Member = {
  userId: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  user: { id: string; name: string | null; email: string; image: string | null };
};

export function TransferOwnershipModal({
  open,
  onClose,
  workspaceId,
  members,
  currentUserId,
  onTransferred,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  members: Member[];
  currentUserId: string;
  onTransferred: () => void;
}) {
  const [toUserId, setToUserId] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = useMemo(() => {
    return members
      .filter((m) => m.userId !== currentUserId)
      .map((m) => ({
        id: m.userId,
        label: `${m.user?.name || "Teammate"} — ${m.user.email}`,
        role: m.role,
      }));
  }, [members, currentUserId]);

  const valid =
    !!toUserId && confirmText.trim().toUpperCase() === "TRANSFER" && !loading;

  async function submit() {
    if (!valid) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/transfer-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toUserId }),
        }
      );

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(data?.error ?? "Failed to transfer ownership.");
        return;
      }

      onTransferred();
      onClose();
      setToUserId("");
      setConfirmText("");
    } catch (e) {
      console.error(e);
      setError("Something went wrong transferring ownership.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (loading) return;
        onClose();
      }}
      title="Transfer ownership"
      description="This changes who controls workspace-wide settings. Your role will become ADMIN after the transfer."
      footer={
        <>
          <div className="text-[11px] text-slate-400/90">
            Type{" "}
            <span className="font-mono text-amber-100">TRANSFER</span> to confirm.
          </div>
          <div className="flex items-center gap-2">
            <PillButton
              intent="neutral"
              disabled={loading}
              onClick={onClose}
            >
              Cancel
            </PillButton>
            <PillButton disabled={!valid} onClick={submit}>
              {loading ? "Transferring…" : "Transfer"}
            </PillButton>
          </div>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-200/90">
            New owner
          </label>
          <select
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            className={cx(
              "mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0",
              "focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
            )}
          >
            <option value="">Select a teammate…</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400/90">
            Choose a current member. They’ll become the only OWNER unless you later add another owner via transfer.
          </p>
        </div>

        <TextInput
          label="Confirmation"
          value={confirmText}
          onChange={setConfirmText}
          placeholder='Type "TRANSFER"'
          helper='This prevents accidental ownership changes.'
        />

        {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
      </div>
    </Modal>
  );
}
