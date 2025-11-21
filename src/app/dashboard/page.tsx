import React from "react";
import PageHeader from "@/components/layout/page-header";

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/70 via-slate-950 to-slate-950 shadow-[0_0_40px_rgba(15,23,42,0.75)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-amber-100/40">
      <div className="absolute inset-0 -z-10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-40 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.18),transparent_55%)]" />
      <div className="px-5 py-4">
        <p className="text-xs font-medium tracking-[0.18em] text-amber-100/70 uppercase">
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

function OutlineCard({
  title,
  kicker,
  children,
  actionLabel,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  actionLabel?: string;
}) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
      <div className="absolute inset-0 -z-10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-40 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.14),transparent_55%)]" />
      <div className="flex-1 space-y-3">
        {kicker && (
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/70 uppercase">
            {kicker}
          </p>
        )}
        <h2 className="text-lg font-semibold tracking-tight text-slate-50">
          {title}
        </h2>
        <div className="text-xs leading-relaxed text-slate-200/85">
          {children}
        </div>
      </div>
      {actionLabel && (
        <button className="mt-5 inline-flex w-fit items-center justify-center rounded-full border border-amber-100/60 bg-amber-50/5 px-4 py-1.5 text-xs font-medium tracking-wide text-amber-100 shadow-[0_0_25px_rgba(250,250,249,0.18)] transition hover:bg-amber-50/10 hover:border-amber-100">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="WELCOME BACK"
        title="Your Avillo command center"
        subtitle="See your pipeline at a glance, kick off new listing workflows, and keep an eye on what Avillo is doing for your buyers and sellers."
      />

      {/* Row 1 – stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Active listings"
          value={4}
          helper="Ready to promote this week."
        />
        <StatCard
          label="Warm leads"
          value={12}
          helper="In active nurture or follow-up."
        />
        <StatCard
          label="AI workflows run"
          value={26}
          helper="Last 30 days across your account."
        />
      </div>

      {/* Row 2 – listing workflow + focus + activity */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Listing workflow */}
        <OutlineCard
          kicker="Start a new listing workflow"
          title="Turn one property brief into every piece of marketing"
          actionLabel="New listing pack"
        >
          <p>
            Drop in your raw notes or MLS draft and Avillo will generate MLS
            copy, bullet lists, social posts, email scripts, and talking points
            in one click. This becomes the hub for your listing prep.
          </p>
          <div className="mt-3 grid gap-3 text-[11px] md:grid-cols-2">
            <div>
              <p className="font-semibold text-amber-100/80">
                What you’ll drop in
              </p>
              <ul className="mt-1 space-y-1 text-slate-200/80">
                <li>• Full property description or your raw listing notes</li>
                <li>• Any must-hit talking points for your appointment</li>
                <li>
                  • Neighborhood details, views, or upgrades you care about
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-amber-100/80">
                What Avillo returns
              </p>
              <ul className="mt-1 space-y-1 text-slate-200/80">
                <li>• MLS description + bullet list</li>
                <li>• Social captions tuned for buyers and agents</li>
                <li>
                  • Email scripts and a quick brief you can use before a
                  showing or listing appointment
                </li>
              </ul>
            </div>
          </div>
        </OutlineCard>

        {/* Focus + recent activity column */}
        <div className="space-y-5">
          <OutlineCard
            kicker="Today’s focus"
            title="3 quick wins for the next hour"
          >
            <ul className="space-y-1.5 text-xs text-slate-200/85">
              <li>• Prep this week’s hero listing.</li>
              <li>
                • Use Seller Studio to send a light-touch market update and
                check-in email.
              </li>
              <li>
                • Run one “hot buyer” search and schedule a 20-minute pricing /
                strategy call.
              </li>
            </ul>
          </OutlineCard>

          <OutlineCard kicker="Recent activity" title="What Avillo has done for you lately">
            <ul className="space-y-1.5 text-xs text-slate-200/85">
              <li>
                <span className="font-semibold text-amber-100">
                  Listing pack generated
                </span>{" "}
                · 1234 Ocean View Dr — MLS copy + social posts ready.{" "}
                <span className="text-slate-400">(2h ago)</span>
              </li>
              <li>
                <span className="font-semibold text-amber-100">
                  Follow-up sequence sent
                </span>{" "}
                · 3-touch email flow sent to 5 warm seller leads.{" "}
                <span className="text-slate-400">(Yesterday)</span>
              </li>
              <li>
                <span className="font-semibold text-amber-100">
                  Buyer brief created
                </span>{" "}
                · AI buyer summary for the Martin family.{" "}
                <span className="text-slate-400">(2 days ago)</span>
              </li>
            </ul>
          </OutlineCard>
        </div>
      </div>
    </div>
  );
}
