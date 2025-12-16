"use client";

import { Fragment, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  feature?: string;
  // Allow extra props (like source) without crashing
  [key: string]: any;
};

type Interval = "monthly" | "annual";

export default function UpgradeModal({ open, onClose, feature }: Props) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleUpgrade() {
    try {
      setLoading(true);
      setErr(null);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "PRO",
          interval, // "monthly" | "annual"
          feature: feature ?? null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Couldn’t start checkout. Please try again.");
      }

      // Common patterns your API might return:
      // { url: "https://checkout.stripe.com/..." } OR { sessionUrl: ... }
      const url = data?.url || data?.sessionUrl;
      if (url) {
        window.location.href = url;
        return;
      }

      // If your API returns nothing but 200, at least close modal
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Couldn’t start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-[9999]">
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
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </TransitionChild>

        {/* Panel */}
        <div className="fixed inset-0 flex items-center justify-center px-4 py-8">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 translate-y-2 scale-[0.99]"
            enterTo="opacity-100 translate-y-0 scale-100"
            leave="ease-in duration-120"
            leaveFrom="opacity-100 translate-y-0 scale-100"
            leaveTo="opacity-0 translate-y-2 scale-[0.99]"
          >
            <DialogPanel className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[0_0_60px_rgba(15,23,42,0.85)]">
              {/* Glow */}
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(244,210,106,0.18),transparent_55%)] opacity-70 blur-3xl" />

              {/* Header */}
              <div className="flex items-start justify-between gap-4 px-6 pt-6">
                <div>
                  <DialogTitle className="text-[15px] font-semibold text-[var(--avillo-cream)]">
                    Upgrade to Avillo Pro
                  </DialogTitle>
                  <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                    {feature
                      ? "This feature is part of Pro — built for leverage (less manual work, more done automatically)."
                      : "Pro is built for leverage — less admin, more done automatically."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/70 text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:text-amber-50"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 pb-6 pt-4 space-y-5">
                {/* Billing toggle (match Billing page) */}
                <div className="flex justify-center">
                  <div className="flex w-full max-w-sm rounded-full border border-slate-700 bg-slate-950/80 p-1 text-[11px] font-semibold text-slate-300 shadow-[0_0_24px_rgba(15,23,42,0.85)]">
                    <button
                      type="button"
                      onClick={() => setInterval("monthly")}
                      className={
                        "flex-1 rounded-full px-3 py-1.5 transition " +
                        (interval === "monthly"
                          ? "bg-slate-800 text-amber-100 shadow-[0_0_18px_rgba(148,163,184,0.7)]"
                          : "text-slate-400")
                      }
                    >
                      Monthly
                    </button>

                    <button
                      type="button"
                      onClick={() => setInterval("annual")}
                      className={
                        "flex-1 rounded-full px-3 py-1.5 transition text-center " +
                        (interval === "annual"
                          ? "bg-amber-100 text-slate-900 shadow-[0_0_22px_rgba(251,191,36,0.75)]"
                          : "text-slate-400")
                      }
                    >
                      Yearly
                      <span className="block text-[9px] uppercase tracking-wide">
                        ~ Save 2 months
                      </span>
                    </button>
                  </div>
                </div>

                {/* Avillo Pro Card (match Billing page) */}
                <div className="relative overflow-hidden rounded-2xl border border-amber-200/40 bg-slate-950/90 px-6 py-6 shadow-[0_0_55px_rgba(251,191,36,0.35)]">
                  <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.25),transparent_60%)]" />

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-200">
                      Avillo Pro
                    </p>

                    <span className="inline-flex items-center rounded-full border border-amber-200/50 bg-amber-100/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                      Recommended
                    </span>
                  </div>

                  <p className="mt-3 text-3xl font-semibold text-amber-100">
                    {interval === "monthly" ? "$129" : "$1290"}
                    <span className="text-base font-normal opacity-75">
                      {interval === "monthly" ? "/mo" : "/yr"}
                    </span>
                  </p>

                  <p className="text-xs text-slate-300">
                    {interval === "monthly"
                      ? "Billed monthly — cancel anytime"
                      : "Billed annually — save 2 months"}
                  </p>

                  <div className="mt-3 rounded-xl border border-amber-200/30 bg-amber-100/10 px-3 py-2 text-[11px] text-amber-50/90">
                    30-day Pro trial included. Unlock Autopilot + saved prompts with
                    listing/contact context.
                  </div>

                  <ul className="mt-5 space-y-2 text-xs text-amber-50">
                    <li>• Autopilot (SMS, email & task automation)</li>
                    <li>• Expanded AI usage + priority processing</li>
                    <li>• Save AI engine prompts for reuse and iteration</li>
                    <li>• Attach AI context to a listing or contact</li>
                  </ul>

                  <button
                    type="button"
                    onClick={handleUpgrade}
                    disabled={loading}
                    className="mt-6 w-full rounded-full border border-amber-200/70 bg-amber-50/10 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading
                      ? "Starting checkout…"
                      : interval === "monthly"
                      ? "Start Pro (Monthly)"
                      : "Start Pro (Yearly)"}
                  </button>

                  <p className="mt-3 text-[11px] text-slate-300/80">
                    Pro is designed for leverage — less admin, more revenue time.
                  </p>
                </div>

                {/* Error */}
                {err && (
                  <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
                    {err}
                  </div>
                )}

                <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                  Starter = control. Pro = leverage. Manage or cancel anytime from Billing.
                </p>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}