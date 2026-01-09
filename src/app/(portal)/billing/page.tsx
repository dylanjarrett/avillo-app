// src/app/(portal)/billing/page.tsx
"use client";

import PageHeader from "@/components/layout/page-header";

export default function BillingPage() {
  const currentPlanLabel = "Private Beta";
  const currentPlanStatus = "Active";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="BILLING"
        title="Private Beta access"
        subtitle="Avillo is in active development. During beta, billing is disabled — your access stays active while we ship updates and refine the platform."
      />

      {/* Current plan / status */}
      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Current access
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-50">
              {currentPlanLabel}
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                {currentPlanStatus}
              </span>
            </p>

            <p className="mt-1 text-[11px] text-slate-400/90">
              Billing is disabled during beta. You’ll keep full access while we iterate on features, performance, and
              workflows. When Avillo launches, you’ll be notified in-app and via email with your available options.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 text-[11px] md:items-end">
            <p className="text-slate-400/90">
              Questions?{" "}
              <a
                href="mailto:support@avillo.io"
                className="font-semibold text-amber-100 underline-offset-2 hover:underline"
              >
                support@avillo.io
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Beta details / expectations */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/30 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_55px_rgba(251,191,36,0.18)]">
        <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.20),transparent_60%)]" />

        <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">Beta notes</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-50">Fast iteration, frequent upgrades</p>
            <p className="mt-1 text-slate-400/90">
              Avillo is evolving quickly. You’ll see regular UI improvements, new tools, and workflow refinements as we
              build toward the public launch.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">Your feedback shapes the product</p>
            <p className="mt-1 text-slate-400/90">
              If something feels missing (or if you want a faster path to a feature), email support and we’ll take a
              look. Beta users influence the roadmap directly.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">No billing during beta</p>
            <p className="mt-1 text-slate-400/90">
              Pricing is not shown during beta to avoid mismatch while features are still shifting. When Avillo goes
              live, we’ll provide a clear plan breakdown and next steps.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">Need help getting started?</p>
            <p className="mt-1 text-slate-400/90">
              On desktop, use the <span className="font-semibold text-slate-200">Tour</span> button for a guided
              walkthrough. A great first step is creating a{" "}
              <span className="font-semibold text-slate-200">Contact</span> or a{" "}
              <span className="font-semibold text-slate-200">Listing</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Contact / enterprise (kept, but beta-friendly) */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_bottom_left,rgba(248,250,252,0.12),transparent_55%)]" />

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-300">Brokerage / Team</p>
            <p className="mt-2 text-lg font-semibold text-slate-50">Interested in a larger rollout?</p>
            <p className="mt-1 text-slate-400/90">
              If you’re exploring Avillo for a brokerage or multi-agent rollout, we can set up early access and a
              lightweight onboarding flow.
            </p>

            <ul className="mt-4 space-y-2 text-[11px] text-slate-200/90">
              <li>• Workspace roles & permissions</li>
              <li>• Reporting and operational visibility</li>
              <li>• Onboarding support and rollout planning</li>
            </ul>
          </div>

          <a
            href="mailto:sales@avillo.io"
            className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-900/60 px-5 py-2 text-center text-xs font-semibold text-slate-200 transition hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100"
          >
            Contact Sales
          </a>
        </div>
      </div>

      {/* FAQ (beta version) */}
      <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">Beta FAQ</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-50">Will I be charged during beta?</p>
            <p className="mt-1 text-slate-400/90">
              No. Billing is disabled during the private beta. You’ll be notified before any paid plans become
              available.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">What happens when Avillo launches?</p>
            <p className="mt-1 text-slate-400/90">
              We’ll communicate launch timing and plan options clearly in-app and via email. Beta users will receive
              next-step guidance.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">How do I request a feature or report a bug?</p>
            <p className="mt-1 text-slate-400/90">
              Email{" "}
              <a
                href="mailto:support@avillo.io"
                className="font-semibold text-amber-100 underline-offset-2 hover:underline"
              >
                support@avillo.io
              </a>{" "}
              with context and screenshots when possible.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">Can I invite another agent?</p>
            <p className="mt-1 text-slate-400/90">
              Yes — send us the agent’s email and we’ll help you add them to your workspace as beta capacity allows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
