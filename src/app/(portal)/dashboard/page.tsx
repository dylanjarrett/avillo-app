// src/app/(portal)/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/layout/page-header";

type StageCounts = {
  new: number;
  warm: number;
  hot: number;
  past: number;
};

type ReminderItem = {
  id: string;
  contactName: string;
  notePreview: string;
  reminderAt: string;
};

type IntelligenceHistoryItem = {
  id: string;
  engine: "listing" | "buyer" | "seller" | "neighborhood";
  inputSummary: string | null;
  createdAt: string;
};

type ListingSummary = {
  activeCount: number;
  pendingCount: number;
  closed30dCount: number;
};

type BuyerSummary = {
  activeBuyers: number;
  nurtureBuyers: number;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [listingSummary, setListingSummary] = useState<ListingSummary | null>(
    null
  );
  const [buyerSummary, setBuyerSummary] = useState<BuyerSummary | null>(null);
  const [stageCounts, setStageCounts] = useState<StageCounts | null>(null);
  const [todayReminders, setTodayReminders] = useState<ReminderItem[]>([]);
  const [recentHistory, setRecentHistory] = useState<IntelligenceHistoryItem[]>(
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);

        // You can replace these with a single /api/dashboard endpoint later.
        const [pipelineRes, remindersRes, historyRes, listingsRes, buyersRes] =
          await Promise.all([
            fetch("/api/dashboard/pipeline-summary").catch(() => null),
            fetch("/api/dashboard/today-reminders").catch(() => null),
            fetch("/api/intelligence/history?limit=6").catch(() => null),
            fetch("/api/dashboard/listing-summary").catch(() => null),
            fetch("/api/dashboard/buyer-summary").catch(() => null),
          ]);

        if (cancelled) return;

        if (pipelineRes && pipelineRes.ok) {
          const data = await pipelineRes.json();
          setStageCounts({
            new: data.new ?? 0,
            warm: data.warm ?? 0,
            hot: data.hot ?? 0,
            past: data.past ?? 0,
          });
        }

        if (remindersRes && remindersRes.ok) {
          const data = await remindersRes.json();
          setTodayReminders(data.reminders ?? []);
        }

        if (historyRes && historyRes.ok) {
          const data = await historyRes.json();
          setRecentHistory(data.items ?? []);
        }

        if (listingsRes && listingsRes.ok) {
          const data = await listingsRes.json();
          setListingSummary({
            activeCount: data.activeCount ?? 0,
            pendingCount: data.pendingCount ?? 0,
            closed30dCount: data.closed30dCount ?? 0,
          });
        }

        if (buyersRes && buyersRes.ok) {
          const data = await buyersRes.json();
          setBuyerSummary({
            activeBuyers: data.activeBuyers ?? 0,
            nurtureBuyers: data.nurtureBuyers ?? 0,
          });
        }
      } catch (err: any) {
        console.error("Dashboard load error", err);
        if (!cancelled) {
          setError(
            err?.message ||
              "We couldn’t load your dashboard. Try refreshing in a moment."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Home"
        title="Avillo AI Command Center"
        subtitle="A single view of your pipeline, listings, reminders, and AI activity — tuned so you can decide what to do next in under 30 seconds."
      />

      {/* Error bar */}
      {error && (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
          {error}
        </div>
      )}

      {/* TOP ROW: STAT CARDS */}
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Active listings"
          value={listingSummary?.activeCount ?? 0}
          hint="Ready to market & match with buyers."
        />
        <StatCard
          label="Active buyers"
          value={buyerSummary?.activeBuyers ?? 0}
          hint="Actively searching in the next 90 days."
        />
        <StatCard
          label="Today’s reminders"
          value={todayReminders.length}
          hint="Calls, follow-ups, and tasks due today."
        />
        <StatCard
          label="AI runs (last 7 days)"
          value={recentHistory.length}
          hint="Listing, buyer, seller, and neighborhood packs."
        />
      </section>

      {/* MIDDLE: PIPELINE + REMINDERS */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
        {/* Pipeline Snapshot */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Pipeline snapshot
              </p>
              <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                Quick view of how many relationships sit in each stage.
              </p>
            </div>
          </div>

          {!stageCounts && !loading && (
            <p className="text-[11px] text-[var(--avillo-cream-muted)]">
              No CRM activity yet. Add your first contact to start building a
              pipeline.
            </p>
          )}

          {stageCounts && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PipelineStage
                label="New"
                count={stageCounts.new}
                description="Fresh leads to qualify."
              />
              <PipelineStage
                label="Warm"
                count={stageCounts.warm}
                description="Nurturing, follow-up scheduled."
              />
              <PipelineStage
                label="Hot"
                count={stageCounts.hot}
                description="Actively buying or selling."
              />
              <PipelineStage
                label="Past / sphere"
                count={stageCounts.past}
                description="Closed, referrals, and long-term."
              />
            </div>
          )}
        </div>

        {/* Today’s Reminders */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.24),transparent_60%)] opacity-40 blur-3xl" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Today’s reminders
              </p>
              <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                Notes & follow-ups that are scheduled for today.
              </p>
            </div>
          </div>

          {todayReminders.length === 0 ? (
            <p className="text-[11px] text-[var(--avillo-cream-muted)]">
              No reminders due today. You can add reminders from any contact
              note in the CRM.
            </p>
          ) : (
            <div className="space-y-2 text-[11px] text-[var(--avillo-cream-soft)]">
              {todayReminders.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-50">
                      {r.contactName}
                    </p>
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      {new Date(r.reminderAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-[var(--avillo-cream-soft)]">
                    {r.notePreview}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* BOTTOM: RECENT AI ACTIVITY + QUICK LAUNCH */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Recent AI Activity */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />
          <div className="mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
              Recent AI activity
            </p>
            <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
              Last few runs across Listing Engine, Buyer / Seller Studio, and
              Neighborhood Engine.
            </p>
            <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
              History auto-clears after 60 days to keep storage lean.
            </p>
          </div>

          {recentHistory.length === 0 ? (
            <p className="text-[11px] text-[var(--avillo-cream-muted)]">
              You haven’t run any AI engines yet. Start with the Listing Engine
              or Buyer Studio from the Intelligence page.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {recentHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={engineBadgeClass(item.engine)}>
                      {engineLabel(item.engine)}
                    </span>
                    <span className="text-[10px] text-[var(--avillo-cream-muted)]">
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[11px] text-[var(--avillo-cream-soft)]">
                    {item.inputSummary || "No summary available."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick AI Launchers */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.24),transparent_60%)] opacity-40 blur-3xl" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
            Quick AI launch
          </p>
          <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
            Jump straight into your most common AI workflows.
          </p>

          <div className="mt-3 space-y-2">
            <QuickLaunchButton
              label="Listing Engine"
              description="Turn property notes into MLS, social, and email copy."
              href="/intelligence?engine=listing"
            />
            <QuickLaunchButton
              label="Buyer Studio"
              description="Search recaps, tour follow-ups, and offer language."
              href="/intelligence?engine=buyer"
            />
            <QuickLaunchButton
              label="Seller Studio"
              description="Prelisting emails, presentations, and objection scripts."
              href="/intelligence?engine=seller"
            />
            <QuickLaunchButton
              label="Neighborhood Engine"
              description="Lifestyle snapshots for ZIP codes, cities, and areas."
              href="/intelligence?engine=neighborhood"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/* -----------------------------
 * Small components
 * ----------------------------*/

type StatCardProps = {
  label: string;
  value: number;
  hint?: string;
};

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/85 px-4 py-4 shadow-[0_0_32px_rgba(15,23,42,0.9)]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.22),transparent_60%)] opacity-40 blur-3xl" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      {hint && (
        <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
          {hint}
        </p>
      )}
    </div>
  );
}

type PipelineStageProps = {
  label: string;
  count: number;
  description: string;
};

function PipelineStage({ label, count, description }: PipelineStageProps) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/75 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-50">{label}</p>
        <p className="text-lg font-semibold text-amber-100">{count}</p>
      </div>
      <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
        {description}
      </p>
    </div>
  );
}

type QuickLaunchButtonProps = {
  label: string;
  description: string;
  href: string;
};

function QuickLaunchButton({
  label,
  description,
  href,
}: QuickLaunchButtonProps) {
  return (
    <a
      href={href}
      className="block rounded-2xl border border-slate-700/80 bg-slate-900/75 px-4 py-3 text-left transition-colors hover:border-amber-100/80 hover:bg-slate-900/95"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/90">
        {label}
      </p>
      <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
        {description}
      </p>
    </a>
  );
}

/* -----------------------------
 * Helpers
 * ----------------------------*/

function engineLabel(engine: IntelligenceHistoryItem["engine"]) {
  switch (engine) {
    case "listing":
      return "Listing Engine";
    case "buyer":
      return "Buyer Studio";
    case "seller":
      return "Seller Studio";
    case "neighborhood":
      return "Neighborhood Engine";
    default:
      return engine;
  }
}

function engineBadgeClass(engine: IntelligenceHistoryItem["engine"]) {
  switch (engine) {
    case "listing":
      return "inline-flex items-center rounded-full border border-sky-200/80 bg-sky-500/15 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-50";
    case "buyer":
      return "inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-500/15 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-50";
    case "seller":
      return "inline-flex items-center rounded-full border border-amber-200/80 bg-amber-500/15 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-50";
    case "neighborhood":
      return "inline-flex items-center rounded-full border border-fuchsia-200/80 bg-fuchsia-500/15 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-fuchsia-50";
    default:
      return "inline-flex items-center rounded-full border border-slate-500/80 bg-slate-800/60 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-100";
  }
}
