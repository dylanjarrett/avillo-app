// src/app/(portal)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/layout/page-header";

type Stage = "new" | "warm" | "hot" | "past";
type TaskTab = "open" | "completed";

type ProfileResponse =
  | {
      success: true;
      user: { id: string; name: string | null; email: string; brokerage: string | null };
    }
  | { success?: false; error?: string };

type ListingsResponse =
  | {
      success: true;
      listings: Array<{
        id: string;
        address: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        coverPhotoUrl?: string | null;
      }>;
    }
  | { error?: string };

type CRMContactsResponse =
  | {
      contacts: Array<{
        id: string;
        name: string;
        stage: string; // lowercase in DB per your code
        type: string | null; // lowercase in DB per your code
        contactNotes?: Array<{
          id: string;
          text: string;
          createdAt: string;
          taskAt: string | null; // legacy / may exist
        }>;
        notes?: Array<{
          id: string;
          text: string;
          createdAt: string;
          taskAt: string | null; // legacy / may exist
        }>;
      }>;
    }
  | { error?: string };

type IntelligenceRecentResponse =
  | {
      entries: Array<{
        id: string;
        createdAt: string;
        engine: string;
        engineSlug: "listing" | "seller" | "buyer" | "neighborhood" | "unknown";
        title: string;
        snippet: string;
        contextType: "listing" | "contact" | "none";
        contextId: string | null;
        contextLabel: string | null;
      }>;
    }
  | { error?: string };

type TaskRow = {
  id: string;
  title: string;
  notes: string;
  dueAt: string | null;
  status: "OPEN" | "DONE" | string;
  source?: "PEOPLE_NOTE" | "AUTOPILOT" | "MANUAL" | string;
  contact: { id: string; name: string } | null;
  listing: { id: string; address: string } | null;
  createdAt: string;
  updatedAt?: string;
  completedAt: string | null;
};

type TasksResponse = { tasks: TaskRow[] };

type StageCounts = { new: number; warm: number; hot: number; past: number };
type ListingSummary = { activeCount: number; pendingCount: number; closed30dCount: number };
type BuyerSummary = { activeBuyers: number; nurtureBuyers: number };

function normalizeStage(raw?: string | null): Stage {
  const v = (raw || "").toLowerCase().trim();
  if (v === "warm" || v === "hot" || v === "past" || v === "new") return v;
  return "new";
}

function normalizeType(raw?: string | null) {
  return (raw || "").toLowerCase().trim();
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getInitials(name: string | null): string {
  if (!name) return "A";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "A";
  return (parts[0][0]?.toUpperCase() || "") + (parts[parts.length - 1][0]?.toUpperCase() || "");
}

/* -----------------------------
 * Tasks helpers
 * ----------------------------*/

function isOverdue(dueAtIso: string | null) {
  if (!dueAtIso) return false;
  const ts = new Date(dueAtIso).getTime();
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
}

function isDueToday(dueAtIso: string | null) {
  if (!dueAtIso) return false;
  const ts = new Date(dueAtIso).getTime();
  if (Number.isNaN(ts)) return false;
  const now = new Date();
  const min = startOfDay(now).getTime();
  const max = min + 1000 * 60 * 60 * 24 - 1;
  return ts >= min && ts <= max;
}

function formatDueLabel(dueAtIso: string | null) {
  if (!dueAtIso) return "No due date";
  const d = new Date(dueAtIso);
  const ts = d.getTime();
  if (Number.isNaN(ts)) return "No due date";

  if (isOverdue(dueAtIso)) {
    return `Overdue · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }

  if (isDueToday(dueAtIso)) {
    return `Today · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }

  const now = new Date();
  const start = startOfDay(now).getTime();
  const target = startOfDay(d).getTime();
  const diffDays = Math.round((target - start) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;

  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function taskSourcePillClass(source?: string) {
  const s = (source || "").toUpperCase();
  if (s === "AUTOPILOT") {
    return "inline-flex items-center rounded-full border border-fuchsia-200/70 bg-fuchsia-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-fuchsia-100";
  }
  if (s === "PEOPLE_NOTE") {
    return "inline-flex items-center rounded-full border border-sky-200/70 bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-100";
  }
  return "inline-flex items-center rounded-full border border-slate-500/70 bg-slate-800/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-100";
}

function taskSourceLabel(source?: string) {
  const s = (source || "").toUpperCase();
  if (s === "AUTOPILOT") return "Autopilot";
  if (s === "PEOPLE_NOTE") return "People";
  return "Manual";
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profileName, setProfileName] = useState<string | null>(null);
  const [brokerage, setBrokerage] = useState<string | null>(null);

  const [stageCounts, setStageCounts] = useState<StageCounts | null>(null);
  const [listingSummary, setListingSummary] = useState<ListingSummary | null>(null);
  const [buyerSummary, setBuyerSummary] = useState<BuyerSummary | null>(null);

  const [taskTab, setTaskTab] = useState<TaskTab>("open");
  const [openTasks, setOpenTasks] = useState<TaskRow[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskRow[]>([]);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);

  const [aiRecent, setAiRecent] = useState<any[]>([]);

  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Undo delete
  const [lastDeleted, setLastDeleted] = useState<{ task: TaskRow; from: TaskTab } | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<number | null>(null);

  function showUndo(task: TaskRow, from: TaskTab) {
    setLastDeleted({ task, from });
    setUndoVisible(true);

    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoVisible(false);
      undoTimerRef.current = null;
    }, 6500);
  }

  function hideUndo() {
    setUndoVisible(false);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  }

  async function fetchTasks(status: "OPEN" | "DONE") {
    const res = await fetch(`/api/tasks?status=${status}&scope=all`).catch(() => null);
    if (!res || !res.ok) return [];

    const data: TasksResponse = await res.json().catch(() => ({ tasks: [] } as TasksResponse));
    const rows = Array.isArray(data.tasks) ? data.tasks : [];

    if (status === "OPEN") {
      const start = startOfDay(new Date()).getTime();
      const end7 = start + 1000 * 60 * 60 * 24 * 7;

      const withDue = rows.filter((t) => !!t.dueAt);
      const noDue = rows.filter((t) => !t.dueAt);

      const overdue = withDue.filter((t) => {
        const ts = new Date(t.dueAt as string).getTime();
        return !Number.isNaN(ts) && ts < start;
      });

      const today = withDue.filter((t) => isDueToday(t.dueAt));

      const week = withDue.filter((t) => {
        const ts = new Date(t.dueAt as string).getTime();
        if (Number.isNaN(ts)) return false;
        return ts >= start && ts < end7 && !isDueToday(t.dueAt);
      });

      const later = withDue.filter((t) => {
        const ts = new Date(t.dueAt as string).getTime();
        if (Number.isNaN(ts)) return false;
        return ts >= end7;
      });

      return [...overdue, ...today, ...week, ...later, ...noDue].slice(0, 200);
    }

    return rows
      .slice()
      .sort((a, b) => {
        const at = new Date(a.completedAt || a.updatedAt || a.createdAt).getTime();
        const bt = new Date(b.completedAt || b.updatedAt || b.createdAt).getTime();
        return bt - at;
      })
      .slice(0, 200);
  }

  async function refreshTasks() {
    const [open, done] = await Promise.all([fetchTasks("OPEN"), fetchTasks("DONE")]);
    setOpenTasks(open);
    setCompletedTasks(done);
  }

  async function markTaskDone(taskId: string) {
    if (!taskId) return;
    setTaskBusyId(taskId);

    const prevOpen = openTasks;
    const prevDone = completedTasks;

    const moved = prevOpen.find((t) => t.id === taskId) || null;

    setOpenTasks((p) => p.filter((t) => t.id !== taskId));
    if (moved) {
      setCompletedTasks((p) => [{ ...moved, status: "DONE", completedAt: new Date().toISOString() }, ...p]);
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });

      if (!res.ok) {
        setOpenTasks(prevOpen);
        setCompletedTasks(prevDone);
      }
    } catch {
      setOpenTasks(prevOpen);
      setCompletedTasks(prevDone);
    } finally {
      setTaskBusyId(null);
    }
  }

  async function reopenTask(taskId: string) {
    if (!taskId) return;
    setTaskBusyId(taskId);

    const prevOpen = openTasks;
    const prevDone = completedTasks;

    const moved = prevDone.find((t) => t.id === taskId) || null;

    setCompletedTasks((p) => p.filter((t) => t.id !== taskId));
    if (moved) {
      setOpenTasks((p) => [{ ...moved, status: "OPEN", completedAt: null }, ...p]);
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "OPEN" }),
      });

      if (!res.ok) {
        setOpenTasks(prevOpen);
        setCompletedTasks(prevDone);
      }
    } catch {
      setOpenTasks(prevOpen);
      setCompletedTasks(prevDone);
    } finally {
      setTaskBusyId(null);
    }
  }

  async function undoDelete() {
    if (!lastDeleted) return;

    const { task, from } = lastDeleted;
    hideUndo();

    // Optimistic reinsert
    if (from === "open") {
      setOpenTasks((p) => {
        if (p.some((t) => t.id === task.id)) return p;
        return [task, ...p];
      });
    } else {
      setCompletedTasks((p) => {
        if (p.some((t) => t.id === task.id)) return p;
        return [task, ...p];
      });
    }

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });

      if (!res.ok) {
        // fallback: re-sync lists
        await refreshTasks();
      }
    } catch {
      await refreshTasks();
    } finally {
      setLastDeleted(null);
    }
  }

  async function deleteTask(taskId: string) {
    if (!taskId) return;
    setTaskBusyId(taskId);

    const prevOpen = openTasks;
    const prevDone = completedTasks;

    const inOpen = prevOpen.find((t) => t.id === taskId) || null;
    const inDone = prevDone.find((t) => t.id === taskId) || null;
    const deletedTask = inOpen || inDone;
    const from: TaskTab = inOpen ? "open" : "completed";

    setOpenTasks((p) => p.filter((t) => t.id !== taskId));
    setCompletedTasks((p) => p.filter((t) => t.id !== taskId));

    if (deletedTask) showUndo(deletedTask, from);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        setOpenTasks(prevOpen);
        setCompletedTasks(prevDone);
        hideUndo();
        setLastDeleted(null);
      }
    } catch {
      setOpenTasks(prevOpen);
      setCompletedTasks(prevDone);
      hideUndo();
      setLastDeleted(null);
    } finally {
      setTaskBusyId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [profileRes, contactsRes, listingsRes, intelligenceRes] = await Promise.all([
          fetch("/api/account/profile").catch(() => null),
          fetch("/api/crm/contacts").catch(() => null),
          fetch("/api/listings?status=all").catch(() => null),
          fetch("/api/intelligence/recent").catch(() => null),
        ]);

        if (cancelled) return;

        if (profileRes && profileRes.ok) {
          const data: ProfileResponse = await profileRes.json();
          if ("success" in data && data.success) {
            setProfileName(data.user.name);
            setBrokerage(data.user.brokerage);
          }
        }

        if (contactsRes && contactsRes.ok) {
          const data: CRMContactsResponse = await contactsRes.json();
          if ("contacts" in data && Array.isArray(data.contacts)) {
            const counts: StageCounts = { new: 0, warm: 0, hot: 0, past: 0 };
            let activeBuyers = 0;
            let nurtureBuyers = 0;

            for (const c of data.contacts) {
              const s = normalizeStage(c.stage);
              counts[s] += 1;

              const t = normalizeType(c.type);
              const isBuyer = t.includes("buyer");
              if (isBuyer) {
                if (s === "warm" || s === "hot") activeBuyers += 1;
                else if (s === "new") nurtureBuyers += 1;
              }
            }

            setStageCounts(counts);
            setBuyerSummary({ activeBuyers, nurtureBuyers });
          }
        }

        if (listingsRes && listingsRes.ok) {
          const data: ListingsResponse = await listingsRes.json();
          if ("success" in data && data.success) {
            const listings = data.listings || [];
            const now = Date.now();
            const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;

            const activeCount = listings.filter((l) => (l.status || "").toLowerCase() === "active").length;
            const pendingCount = listings.filter((l) => (l.status || "").toLowerCase() === "pending").length;

            const closed30dCount = listings.filter((l) => {
              const status = (l.status || "").toLowerCase();
              if (status !== "closed") return false;
              const updated = new Date(l.updatedAt || l.createdAt).getTime();
              if (Number.isNaN(updated)) return false;
              return now - updated <= thirtyDaysMs;
            }).length;

            setListingSummary({ activeCount, pendingCount, closed30dCount });
          }
        }

        if (intelligenceRes && intelligenceRes.ok) {
          const data: IntelligenceRecentResponse = await intelligenceRes.json();
          if ("entries" in data && Array.isArray(data.entries)) {
            setAiRecent(data.entries.slice(0, 8));
          }
        }

        const [open, done] = await Promise.all([fetchTasks("OPEN"), fetchTasks("DONE")]);
        if (!cancelled) {
          setOpenTasks(open);
          setCompletedTasks(done);
        }
      } catch (err: any) {
        console.error("Dashboard load error", err);
        if (!cancelled) setError(err?.message || "We couldn’t load your dashboard. Try refreshing in a moment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = useMemo(() => getTimeOfDayGreeting(), []);
  const avatarInitials = useMemo(() => getInitials(profileName), [profileName]);
  const firstName = useMemo(() => (profileName || "there").trim().split(" ")[0] || "there", [profileName]);

  const totalPipelineContacts = useMemo(() => {
    if (!stageCounts) return 0;
    return stageCounts.new + stageCounts.warm + stageCounts.hot + stageCounts.past;
  }, [stageCounts]);

  const taskCounts = useMemo(() => {
    const start = startOfDay(new Date()).getTime();
    let overdue = 0;
    let today = 0;

    for (const t of openTasks) {
      if (!t.dueAt) continue;
      const ts = new Date(t.dueAt).getTime();
      if (Number.isNaN(ts)) continue;
      if (ts < start) overdue += 1;
      else if (isDueToday(t.dueAt)) today += 1;
    }

    return { overdue, today, openTotal: openTasks.length };
  }, [openTasks]);

  const visibleTasks = useMemo(() => (taskTab === "open" ? openTasks : completedTasks), [taskTab, openTasks, completedTasks]);

  function openFeedbackEmail() {
    const subject = encodeURIComponent("Avillo beta feedback");
    const context = [
      `Name: ${profileName || ""}`,
      `Brokerage: ${brokerage || ""}`,
      `Pipeline: ${totalPipelineContacts}`,
      `Active listings: ${listingSummary?.activeCount ?? 0}`,
      `Open tasks: ${openTasks.length}`,
      `AI recent: ${aiRecent.length}`,
      "",
      "Feedback:",
      feedbackText.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const body = encodeURIComponent(context);
    window.location.href = `mailto:support@avillo.io?subject=${subject}&body=${body}`;
    setFeedbackSent(true);
    setTimeout(() => setFeedbackSent(false), 2500);
    setFeedbackText("");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="DASHBOARD"
        title="Your Avillo Command Center"
        subtitle="A bird’s-eye view of what’s moving, what needs attention today, and what Avillo is generating for you."
      />

      {error && (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
          {error}
        </div>
      )}

      {/* HERO STRIP */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)]">
        {/* Welcome */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-700/80 bg-gradient-to-tr from-slate-950 via-slate-900/95 to-slate-900 px-5 py-4 shadow-[0_0_70px_rgba(15,23,42,0.98)]">
          <div className="pointer-events-none absolute -top-12 -left-12 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(248,250,252,0.16),transparent_60%)] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(250,220,130,0.22),transparent_60%)] blur-2xl" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">{greeting}</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--avillo-cream-strong)]">Welcome back, {firstName}.</h2>
              <p className="mt-1 max-w-md text-[11px] text-[var(--avillo-cream-soft)]">
                Your business is moving in a dozen directions — this is the one screen that keeps it all calm, clear, and in motion.
              </p>
            </div>

            <div className="shrink-0">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-amber-100/50 bg-gradient-to-br from-slate-950 to-slate-900 text-sm font-semibold text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.25)]">
                <span>{avatarInitials}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Pipeline total" value={totalPipelineContacts} loading={loading && !stageCounts} />
            <MiniMetric
              label="Deals in motion"
              value={(listingSummary?.activeCount ?? 0) + (listingSummary?.pendingCount ?? 0)}
              loading={loading && !listingSummary}
            />
            <MiniMetric label="Open tasks" value={taskCounts.openTotal} loading={loading && openTasks.length === 0} />
          </div>
        </div>

        {/* Suggestions / Improvements */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/90 px-5 py-4 shadow-[0_0_60px_rgba(15,23,42,0.98)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.16),transparent_55%)] opacity-60 blur-3xl" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">Suggestions / improvements</p>
          <p className="mt-2 text-[11px] text-[var(--avillo-cream-soft)]">Tell us what would make Avillo feel 10x better. One sentence is enough.</p>

          <div className="mt-3 rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={5}
              placeholder='Example: “On People, I want a quick way to see who I haven’t touched in 14 days.”'
              className="w-full resize-none rounded-xl border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-amber-100/70"
            />

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-[var(--avillo-cream-muted)]">Sends to support@avillo.io</p>

              <button
                onClick={openFeedbackEmail}
                disabled={!feedbackText.trim()}
                className="rounded-xl border border-amber-100/45 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:border-amber-100/70 hover:bg-amber-500/15 disabled:opacity-40"
              >
                Send
              </button>
            </div>

            {feedbackSent && <p className="mt-2 text-[10px] font-medium text-emerald-200">Ready to send — your mail app will open.</p>}
          </div>

          <p className="mt-3 text-[10px] text-[var(--avillo-cream-muted)]">Beta goal: collect 3–5 “pain points” per user and ship weekly improvements.</p>
        </div>
      </section>

      {/* TODAY AT A GLANCE */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">Today at a glance</p>
          {!loading && <p className="text-[10px] text-[var(--avillo-cream-muted)]">Live numbers based on your People, Listings, Tasks, and AI usage.</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            label="Deals in motion"
            value={(listingSummary?.activeCount ?? 0) + (listingSummary?.pendingCount ?? 0)}
            hint={`Active ${(listingSummary?.activeCount ?? 0)} • Pending ${listingSummary?.pendingCount ?? 0}`}
            loading={loading && !listingSummary}
            ctaLabel="View listings →"
            ctaHref="/listings"
          />
          <StatCard
            label="Active buyers"
            value={buyerSummary?.activeBuyers ?? 0}
            hint="Warm/hot buyer relationships."
            loading={loading && !buyerSummary}
            ctaLabel="Open People →"
            ctaHref="/people"
          />
          <StatCard
            label="Open tasks"
            value={taskCounts.openTotal}
            hint={taskCounts.overdue > 0 ? `${taskCounts.overdue} overdue • ${taskCounts.today} due today` : `${taskCounts.today} due today`}
            loading={loading && openTasks.length === 0}
            ctaLabel="Open People →"
            ctaHref="/people"
          />
          <StatCard
            label="AI runs (7 days)"
            value={aiRecent.length}
            hint="Recent outputs across your engines."
            loading={loading && aiRecent.length === 0}
            ctaLabel="Open Intelligence →"
            ctaHref="/intelligence"
          />
        </div>
      </section>

      {/* MAIN WORK ROW */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-stretch">
        {/* Today’s focus */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/85 px-5 py-4 shadow-[0_0_44px_rgba(15,23,42,0.92)]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-45 blur-3xl" />

          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">Today’s focus</p>
              <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                {taskTab === "open" ? "Your open tasks — ordered by what’s due next." : "Recently completed tasks — newest first."}
              </p>

              <div className="mt-2 inline-flex rounded-full border border-slate-700/80 bg-slate-900/60 p-1">
                <button
                  onClick={() => setTaskTab("open")}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                    taskTab === "open"
                      ? "border border-amber-100/40 bg-amber-500/10 text-amber-100"
                      : "text-[var(--avillo-cream-muted)] hover:text-[var(--avillo-cream-strong)]"
                  }`}
                >
                  Open ({openTasks.length})
                </button>

                <button
                  onClick={() => setTaskTab("completed")}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                    taskTab === "completed"
                      ? "border border-amber-100/40 bg-amber-500/10 text-amber-100"
                      : "text-[var(--avillo-cream-muted)] hover:text-[var(--avillo-cream-strong)]"
                  }`}
                >
                  Completed ({completedTasks.length})
                </button>
              </div>
            </div>

            <a
              href="http:///people"
              className="mt-1 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-[10px] font-semibold text-[var(--avillo-cream-strong)] hover:border-amber-100/60"
             target="_blank" rel="noopener">
              Open People
            </a>
          </div>

          {loading && visibleTasks.length === 0 && <p className="text-[11px] text-[var(--avillo-cream-muted)]">Loading your tasks…</p>}

          {!loading && visibleTasks.length === 0 ? (
            <div className="space-y-2">
              <EmptyPill
                title={taskTab === "open" ? "Nothing open right now (nice)." : "No completed tasks yet."}
                body={
                  taskTab === "open"
                    ? "Tasks created from People notes and Autopilot will show here automatically."
                    : "Mark tasks Done and they’ll show up here so you can reference what you finished."
                }
              />
              {taskTab === "open" ? (
                <EmptyPill title="Pro move" body="Set 2 follow-ups for tomorrow so you start the day already ahead." />
              ) : (
                <EmptyPill title="Keep momentum" body="Aim to clear 3 open tasks a day — this tab should fill up fast." />
              )}
            </div>
          ) : (
            <div className="mt-2 max-h-[440px] space-y-2 overflow-y-auto pr-1">
              {visibleTasks.slice(0, 60).map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[11px] font-semibold text-slate-50">{t.title || "Task"}</p>
                        <span className={taskSourcePillClass(t.source)}>{taskSourceLabel(t.source)}</span>
                      </div>

                      {(t.contact?.name || t.listing?.address) && (
                        <p className="mt-1 truncate text-[10px] text-[var(--avillo-cream-muted)]">
                          {t.contact?.name ? (
                            <>
                              {t.contact.name}
                              {t.listing?.address ? " • " : ""}
                            </>
                          ) : null}
                          {t.listing?.address ? t.listing.address : null}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={`text-[10px] ${
                          taskTab === "open" && isOverdue(t.dueAt) ? "text-rose-200" : "text-[var(--avillo-cream-muted)]"
                        }`}
                      >
                        {taskTab === "open"
                          ? formatDueLabel(t.dueAt)
                          : t.completedAt
                          ? `Completed · ${new Date(t.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                          : "Completed"}
                      </p>

                      <div className="mt-1 flex items-center justify-end gap-2">
                        {taskTab === "open" ? (
                          <button
                            onClick={() => markTaskDone(t.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-400/70 transition hover:bg-emerald-400/10 hover:text-emerald-400 disabled:opacity-40"
                            aria-label="Mark done"
                            disabled={taskBusyId === t.id}
                          >
                            ✓
                          </button>
                        ) : (
                          <button
                            onClick={() => reopenTask(t.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-sky-200/70 transition hover:bg-sky-400/10 hover:text-sky-200 disabled:opacity-40"
                            aria-label="Reopen task"
                            disabled={taskBusyId === t.id}
                            title="Reopen"
                          >
                            ↺
                          </button>
                        )}

                        <button
                          onClick={() => deleteTask(t.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-rose-400/60 transition hover:bg-rose-400/10 hover:text-rose-400 disabled:opacity-40"
                          aria-label="Delete task"
                          disabled={taskBusyId === t.id}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>

                  {t.notes && <p className="mt-1 line-clamp-2 text-[11px] text-[var(--avillo-cream-soft)]">{t.notes}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-[10px] text-[var(--avillo-cream-muted)]">
            {taskTab === "open" ? (
              <>
                Autopilot tasks will appear here automatically as soon as they’re created. Mark a task{" "}
                <span className="text-[var(--avillo-cream-strong)]">Done</span> to remove it from your open list.
              </>
            ) : (
              <>
                Completed tasks stay here so you can reference what you finished. Use{" "}
                <span className="text-[var(--avillo-cream-strong)]">Reopen</span> if you need to bring something back.
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Pipeline snapshot */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_44px_rgba(15,23,42,0.92)]">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.22),transparent_60%)] opacity-40 blur-3xl" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">Pipeline health</p>
                <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">A clean snapshot of where relationships sit right now.</p>
              </div>
              <a
                href="http:///people"
                className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-[10px] font-semibold text-[var(--avillo-cream-strong)] hover:border-amber-100/60"
               target="_blank" rel="noopener">
                View pipeline
              </a>
            </div>

            {loading && !stageCounts && <p className="text-[11px] text-[var(--avillo-cream-muted)]">Loading your pipeline…</p>}

            {!loading && !stageCounts && (
              <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                No CRM activity yet. Add your first contact to start building a pipeline.
              </p>
            )}

            {stageCounts && (
              <div className="grid gap-3 sm:grid-cols-2">
                <PipelineStage label="New" count={stageCounts.new} description="Fresh leads to qualify." />
                <PipelineStage label="Warm" count={stageCounts.warm} description="Nurturing, follow-up scheduled." />
                <PipelineStage label="Hot" count={stageCounts.hot} description="Actively buying or selling." />
                <PipelineStage label="Past / sphere" count={stageCounts.past} description="Closed, referrals, and long-term." />
              </div>
            )}

            <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-[10px] text-[var(--avillo-cream-muted)]">
              Healthy pipelines are built in small daily touches, not big weekend catch-ups.
            </div>
          </div>

          {/* Create Momentum */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_44px_rgba(15,23,42,0.92)]">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.24),transparent_60%)] opacity-40 blur-3xl" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">Create momentum</p>
            <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">Quick actions that keep your day moving.</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <QuickLaunchButton label="Run Listing Engine" description="Generate MLS + social + email copy fast." href="/intelligence?engine=listing" />
              <QuickLaunchButton label="Buyer Studio" description="Follow-ups, search recaps, and offer language." href="/intelligence?engine=buyer" />
              <QuickLaunchButton label="Add a contact" description="Drop in a lead and start tracking touches." href="/people" />
              <QuickLaunchButton label="Add a listing" description="Start a listing record and keep details organized." href="/listings" />
            </div>

            <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-[10px] text-[var(--avillo-cream-muted)]">
              Keep it simple: pick one action and ship it in the next 5 minutes.
            </div>
          </div>
        </div>
      </section>

      {/* Undo toast */}
      {undoVisible && lastDeleted?.task && (
        <div className="fixed bottom-5 left-5 z-[9999] max-w-[92vw]">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/95 px-4 py-3 shadow-[0_0_40px_rgba(15,23,42,0.92)]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-50">Task deleted</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--avillo-cream-muted)]">
                {lastDeleted.task.title || "Task"}
              </p>
            </div>

            <button
              onClick={undoDelete}
              className="shrink-0 rounded-xl border border-amber-100/45 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:border-amber-100/70 hover:bg-amber-500/15"
            >
              Undo
            </button>

            <button
              onClick={() => {
                hideUndo();
                setLastDeleted(null);
              }}
              className="shrink-0 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-[10px] font-semibold text-[var(--avillo-cream-soft)] hover:border-slate-600/80"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -----------------------------
 * Components
 * ----------------------------*/

function StatCard({
  label,
  value,
  hint,
  loading,
  ctaLabel,
  ctaHref,
}: {
  label: string;
  value: number;
  hint?: string;
  loading?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/85 px-4 py-4 shadow-[0_0_36px_rgba(15,23,42,0.92)]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.22),transparent_60%)] opacity-40 blur-3xl" />

      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">{label}</p>

      {loading ? (
        <div className="mt-2 h-6 w-12 animate-pulse rounded-md bg-slate-700/60" />
      ) : (
        <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      )}

      {hint && <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">{hint}</p>}

      {ctaLabel && ctaHref && (
        <a
          href={ctaHref}
          className="mt-3 inline-flex items-center rounded-full border border-amber-100/40 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold text-amber-100 hover:border-amber-100/70"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}

function MiniMetric({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--avillo-cream-muted)]">{label}</p>
      {loading ? (
        <div className="mt-1.5 h-4 w-10 animate-pulse rounded-md bg-slate-700/60" />
      ) : (
        <p className="mt-1 text-sm font-semibold text-[var(--avillo-cream-strong)]">{value}</p>
      )}
    </div>
  );
}

function PipelineStage({ label, count, description }: { label: string; count: number; description: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/75 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-50">{label}</p>
        <p className="text-lg font-semibold text-amber-100">{count}</p>
      </div>
      <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">{description}</p>
    </div>
  );
}

function QuickLaunchButton({ label, description, href }: { label: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="block rounded-2xl border border-slate-700/80 bg-slate-900/75 px-4 py-3 text-left no-underline transition-colors hover:border-amber-100/80 hover:bg-slate-900/95 hover:no-underline focus:no-underline"
      style={{ textDecoration: "none" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/90 no-underline">{label}</p>
      <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)] no-underline">{description}</p>
    </a>
  );
}

function EmptyPill({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-3">
      <p className="text-[11px] font-semibold text-slate-50">{title}</p>
      <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">{body}</p>
    </div>
  );
}