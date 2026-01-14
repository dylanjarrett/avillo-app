// components/workspace/transfer-ownership-modal.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { PillButton, TextInput, cx } from "./workspace-ui";

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
  const [toast, setToast] = useState<string | null>(null);

  const choices = useMemo(() => {
    return (members || [])
      .filter((m) => m.userId !== currentUserId)
      // If your Member type includes removedAt in the modal props, keep this:
      // .filter((m) => !m.removedAt)
      .filter((m) => !!m.user?.email)
      .map((m) => ({
        id: m.userId,
        label: `${m.user?.name?.trim() || "Teammate"} — ${m.user.email}`,
        role: m.role,
      }));
  }, [members, currentUserId]);

  const confirmOk = confirmText.trim().toUpperCase() === "TRANSFER";
  const canSubmit = !!toUserId && confirmOk && !loading;

  // Reset internal state when modal closes/opens
  useEffect(() => {
    if (open) {
      setError(null);
      setToast(null);
      return;
    }
    setToUserId("");
    setConfirmText("");
    setLoading(false);
    setError(null);
    setToast(null);
  }, [open]);

  async function submit() {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setToast(null);

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

      setToast("Ownership transferred.");
      onTransferred();
      onClose();
    } catch (e) {
      console.error(e);
      setError("Something went wrong transferring ownership.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <Transition show={open} as={Fragment}>
      <Dialog
        onClose={() => {
          if (loading) return;
          onClose();
        }}
        className="relative z-[9999]"
      >
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-120"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </TransitionChild>

        {/* Panel wrapper */}
        <div className="fixed inset-0 flex items-center justify-center px-3 py-6 md:px-4 md:py-8">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 translate-y-2 scale-[0.99]"
            enterTo="opacity-100 translate-y-0 scale-100"
            leave="ease-in duration-120"
            leaveFrom="opacity-100 translate-y-0 scale-100"
            leaveTo="opacity-0 translate-y-2 scale-[0.99]"
          >
            <DialogPanel
              className="
                relative w-[96%] max-w-xl max-h-[88vh]
                overflow-y-auto rounded-2xl border border-slate-700/70
                bg-gradient-to-b from-slate-900/90 to-slate-950
                px-4 py-4 md:px-6 md:py-6
                shadow-[0_0_60px_rgba(15,23,42,0.95)]
              "
            >
              {/* Glow */}
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

              {/* HEADER */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <DialogTitle className="text-[13px] font-semibold tracking-[0.02em] text-slate-50">
                    Transfer ownership
                  </DialogTitle>
                  <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                    This changes who controls workspace-wide settings. After transfer, your role becomes{" "}
                    <span className="font-semibold text-amber-100">ADMIN</span>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (loading) return;
                    onClose();
                  }}
                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)] hover:text-slate-100"
                >
                  ✕
                </button>
              </div>

              {/* BODY */}
              <div className="space-y-4">
                {/* New owner select */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                    New owner
                  </label>

                  <select
                    value={toUserId}
                    onChange={(e) => {
                      setToUserId(e.target.value);
                      setError(null);
                      setToast(null);
                    }}
                    disabled={loading}
                    className={cx(
                      "mt-2 w-full rounded-lg border bg-slate-950/70 px-3 py-2 text-[11px] outline-none ring-0",
                      !loading
                        ? "border-slate-700/80 text-slate-50 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
                        : "cursor-not-allowed border-slate-800 text-slate-400"
                    )}
                  >
                    <option value="">Select a teammate…</option>
                    {choices.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900 text-slate-50">
                        {c.label}
                      </option>
                    ))}
                  </select>

                  <p className="mt-2 text-[10px] text-[var(--avillo-cream-muted)]">
                    Choose a current member. They’ll become the{" "}
                    <span className="font-semibold text-slate-50">only OWNER</span> unless you transfer again later.
                  </p>
                </div>

                {/* Confirm */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
                  <TextInput
                    label="Confirmation"
                    value={confirmText}
                    onChange={(v) => {
                      setConfirmText(v);
                      setError(null);
                      setToast(null);
                    }}
                    placeholder='Type "TRANSFER"'
                    helper='This prevents accidental ownership changes.'
                  />

                  <div className="mt-2 text-[11px] text-slate-400/90">
                    Type{" "}
                    <span className="font-mono font-semibold text-amber-100">TRANSFER</span> to enable the button.
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-start justify-between gap-3">
                  {toast ? <p className="text-[11px] text-emerald-300">{toast}</p> : <span />}
                  {error ? <p className="text-[11px] text-rose-300 text-right">{error}</p> : null}
                </div>
              </div>

              {/* FOOTER */}
              <div className="mt-6 flex items-center justify-between">
                <PillButton
                  intent="neutral"
                  disabled={loading}
                  onClick={() => {
                    if (loading) return;
                    onClose();
                  }}
                >
                  Cancel
                </PillButton>

                <PillButton disabled={!canSubmit} onClick={submit}>
                  {loading ? "Transferring…" : "Transfer"}
                </PillButton>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}
