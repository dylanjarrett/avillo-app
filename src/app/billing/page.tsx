import React from "react";
import PageHeader from "@/components/layout/page-header";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="BILLING"
        title="Plans & billing"
        subtitle="Manage your Avillo subscription, early access pricing, and invoices. This will eventually hook into Stripe for full self-serve management."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Current plan */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-45 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
                Current plan
              </p>
              <h2 className="mt-2 text-base font-semibold text-slate-50">
                Founding Agent (Beta)
              </h2>
              <p className="mt-2 text-xs text-slate-200/90">
                Early-access pricing for founding agents. Your rate will be
                locked in before public launch, even as we add more features and
                workflows to Avillo.
              </p>
            </div>
            <div className="text-right text-xs text-slate-200/85">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
                $— / mo
              </p>
              <p className="mt-1 text-slate-400/90">Final pricing TBD</p>
              <button className="mt-3 inline-flex items-center rounded-full border border-amber-100/70 bg-amber-50/10 px-3 py-1 text-[11px] font-semibold text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20">
                Contact sales
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-xs md:grid-cols-4">
            <div className="rounded-xl border border-slate-700/90 bg-slate-900/80 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                Seats
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-50">1</p>
              <p className="mt-1 text-slate-300/90">
                Solo agent setup. Team support coming soon.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/90 bg-slate-900/80 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                Status
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-50">
                Trial / beta
              </p>
              <p className="mt-1 text-slate-300/90">
                Full billing will start once Avillo is publicly launched.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/90 bg-slate-900/80 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                Billing email
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-50">
                you@example.com
              </p>
              <p className="mt-1 text-slate-300/90">
                This will be managed via Stripe or your auth provider later.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/90 bg-slate-900/80 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                Invoices
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-50">
                None yet
              </p>
              <p className="mt-1 text-slate-300/90">
                Once live, this will show a simple list of invoices with links
                to view and download.
              </p>
            </div>
          </div>
        </div>

        {/* Usage & invoices */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.18),transparent_55%)]" />
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            Usage & invoices
          </p>
          <p className="mt-2 text-xs text-slate-200/90">
            This section will show your AI usage, estimated hours saved, and a
            history of invoices once billing is live.
          </p>

          <div className="mt-4 grid gap-3 text-xs">
            <div className="rounded-xl border border-slate-700/90 bg-slate-900/80 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                AI workflows this month
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-50">26</p>
              <p className="mt-1 text-slate-300/90">
                Listing packs, follow-ups, and scripts generated via Avillo.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/90 bg-slate-900/80 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                Estimated time saved
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-50">
                6–8 hours
              </p>
              <p className="mt-1 text-slate-300/90">
                Based on an average of 15–20 minutes per manual workflow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
