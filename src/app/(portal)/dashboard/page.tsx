// src/app/dashboard/page.tsx
import React from "react";
import PageHeader from "@/components/layout/page-header";

type StatCardProps = {
  label: string;
  value: string | number;
  helper?: string;
};

function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/70 via-slate-950 to-slate-950 shadow-[0_0_40px_rgba(15,23,42,0.75)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-amber-100/40">
      {/* Glow on hover */}
      <div className="absolute inset-0 -z-10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-40 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.18),transparent_55%)]" />
      <div className="px-5 py-4">
        <p className="text-[11px] font-medium tracking-[0.18em] text-amber-100/70 uppercase">
          {label}
        </p>
        <p className="mt-3 text-4xl font-semibold text-slate-50">{value}</p>
        {helper && (
          <p className="mt-2 text-xs text-slate-300/80 leading-relaxed">
            {helper}
          </p>
        )}
      </div>
    </div>
  );
}

type CardProps = {
  title: string;
  kicker?: string;
  children: React.ReactNode;
};

function ShellCard({ title, kicker, children }: CardProps) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
      <div className="absolute inset-0 -z-10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-40 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.14),transparent_55%)]" />
      {kicker && (
        <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/70 uppercase">
          {kicker}
        </p>
      )}
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-50">
        {title}
      </h2>
      <div className="mt-3 text-xs leading-relaxed text-slate-200/85">
        {children}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="WELCOME BACK"
        title="Your Avillo overview"
        subtitle="High-level view of your pipeline, relationships, and what Avillo recommends you focus on next."
      />

      {/* Row 1 – top stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Contacts in CRM"
          value={128}
          helper="People in your database across buyers, sellers, and sphere."
        />
        <StatCard
          label="Active listings"
          value={4}
          helper="On-market or going live this week."
        />
        <StatCard
          label="Hot & active leads"
          value={9}
          helper="Buyers and sellers in advanced conversations."
        />
        <StatCard
          label="Follow-ups due today"
          value={6}
          helper="Texts and emails that should be touched today."
        />
      </div>

      {/* Row 2 – snapshot + unified AI card */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Pipeline snapshot */}
        <ShellCard kicker="Pipeline snapshot" title="Where your relationships are right now">
          <p className="mb-3 text-xs text-slate-300/90">
            A quick look at a few key people and listings Avillo is tracking. The full CRM view lives in the CRM tab.
          </p>
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2.5">
              <p className="font-semibold text-amber-100/90">Martin family</p>
              <p className="mt-0.5 text-slate-200/90">
                Warm · 3–4 bedroom move-up home with office space.
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Next step: Schedule a quick “sell vs. rent” strategy call.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2.5">
              <p className="font-semibold text-amber-100/90">3214 Ocean View Dr</p>
              <p className="mt-0.5 text-slate-200/90">
                Active listing · Ocean-view open house next weekend + social push.
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Next step: Refresh MLS copy and social captions in Listing Intelligence.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2.5">
              <p className="font-semibold text-amber-100/90">Alex Peterson</p>
              <p className="mt-0.5 text-slate-200/90">
                Hot buyer · Actively touring, 30–45 day timeline.
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Next step: Confirm search criteria and send a tailored new-listing update.
              </p>
            </div>
          </div>
        </ShellCard>

        {/* Unified AI recommendations + tasks */}
        <ShellCard
          kicker="Avillo insights"
          title="Lightweight AI recommendations & today’s tasks"
        >
          <div className="grid gap-5 md:grid-cols-1 lg:grid-cols-1">
            {/* Recommendations */}
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-amber-100/80 uppercase">
                Smart nudges
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-200/90">
                <li>
                  • <span className="font-semibold">Warm sellers look ready.</span>{" "}
                  Two active seller prospects just moved up in your basic CRM activity. 
                  Consider sending a quick pricing update and short video.
                </li>
                <li>
                  • <span className="font-semibold">Revive older leads.</span>{" "}
                  You have several buyers who went quiet 60–90 days ago. 
                  A simple “Are you still open to looking?” text could bring them back.
                </li>
                <li>
                  • <span className="font-semibold">Leverage your sphere.</span>{" "}
                  A handful of past clients have had no touch in 6+ months. 
                  Send a quick market snapshot and a personal check-in.
                </li>
              </ul>
            </div>

            {/* Today’s tasks */}
            <div className="mt-4 border-t border-slate-800/80 pt-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-amber-100/80 uppercase">
                Today’s tasks
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-200/90">
                <li className="flex items-center justify-between">
                  <span>Call 2 hottest buyers about new inventory drops.</span>
                  <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-300">
                    Today
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Send market update email to past clients list.</span>
                  <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-300">
                    Today
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Review pricing for upcoming listing brief.</span>
                  <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-300">
                    Tomorrow
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </ShellCard>
      </div>
    </div>
  );
}