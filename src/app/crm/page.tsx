
import React from "react";
import PageHeader from "@/components/layout/page-header";

const pipeline = [
  { label: "New leads", detail: "3 people — portal inquiries & open house sign-ins.", count: 3 },
  { label: "Warm / nurturing", detail: "5 people — saved searches, casual timelines, “just browsing”.", count: 5 },
  { label: "Hot / active", detail: "2 buyers touring + 1 potential listing in the next 60 days.", count: 3 },
  { label: "Past clients / sphere", detail: "40+ people — ideal for quarterly touches and market updates.", count: 40 },
];

const followUps = [
  {
    name: "Alex · potential buy",
    note: "Asked about condos around $650K. Send curated options and a quick “how we work” overview.",
    when: "Today",
  },
  {
    name: "Martins · selling",
    note: "Seen 2 homes this week. Send a short market update and pricing guidance.",
    when: "Tomorrow",
  },
  {
    name: "Past client check-in",
    note: "Annual home value + market update for clients who closed last year.",
    when: "This week",
  },
];

export default function CrmPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="CRM"
        title="Pipeline & relationships"
        subtitle="A light CRM tuned for real estate — see your leads, hot opportunities, and past clients in one place. This will eventually connect directly to your AI workflows."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Lead pipeline */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)]" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
                Lead pipeline
              </p>
              <p className="mt-2 text-xs text-slate-200/90">
                A simplified view of where your people are — new, warm, hot, or
                closed. Later this can be a Kanban or table view.
              </p>
            </div>
            <button className="inline-flex items-center rounded-full border border-amber-100/70 bg-amber-50/10 px-3 py-1 text-[11px] font-semibold text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20">
              Add contact
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-700/80 border-t border-slate-700/80 text-xs">
            {pipeline.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <p className="font-semibold text-slate-50">{row.label}</p>
                  <p className="mt-0.5 text-slate-300/90">{row.detail}</p>
                </div>
                <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-full border border-slate-500/60 bg-slate-900/80 px-2 text-[11px] font-semibold text-amber-100">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming follow-ups */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)]" />
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            Upcoming follow-ups
          </p>
          <p className="mt-2 text-xs text-slate-200/90">
            This will eventually hook into your AI follow-up engine to keep you
            on top of every relationship.
          </p>

          <div className="mt-4 space-y-3 text-xs">
            {followUps.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-50">{item.name}</p>
                  <span className="text-[11px] font-semibold text-amber-100/80">
                    {item.when}
                  </span>
                </div>
                <p className="mt-1 text-slate-300/90 leading-relaxed">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
