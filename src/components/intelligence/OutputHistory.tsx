//components/intelligence/OutputHistory
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UpgradeModal from "@/components/billing/UpgradeModal";

/* ----------------------------------------
 Types
---------------------------------------- */

export type OutputHistoryEntry = {
  id: string;
  createdAt: string;
  engine: string; // pretty label ("Listing Engine")
  engineSlug?: "listing" | "seller" | "buyer" | "neighborhood" | "unknown";
  title?: string;
  snippet?: string;
  prompt?: string;
  contextType?: "listing" | "contact" | "none";
  contextId?: string | null;
  contextLabel?: string | null;
};

type OutputHistoryProps = {
  onSelectEntry?: (entry: OutputHistoryEntry) => void;
  refreshKey?: number; // bump this to force a re-fetch
};

type AccountMe = {
  plan?: string | null;
  entitlements?: Record<string, any> | null;
  [key: string]: any;
};

function isProAccount(account: AccountMe | null): boolean {
  if (!account) return false;

  // 1) Support top-level plan (legacy / future-proof)
  const topLevelPlan = String(account.plan ?? "").toLowerCase();

  // 2) Source of truth: entitlements
  const entPlan = String((account.entitlements as any)?.plan ?? "").toLowerCase();
  const isPaidTier = Boolean((account.entitlements as any)?.isPaidTier);

  const plan = topLevelPlan || entPlan;

  if (plan === "pro" || plan === "founding_pro") return true;
  if (isPaidTier) return true;

  // 3) Fallback: capability-based gating
  const can = ((account.entitlements as any)?.can ?? {}) as Record<string, boolean>;
  return Boolean(can.INTELLIGENCE_SAVE || can.AUTOMATIONS_RUN || can.AUTOMATIONS_PERSIST);
}

type EngineFilter = "all" | "listing" | "seller" | "buyer" | "neighborhood" | "unknown";

const ENGINE_FILTERS: { label: string; value: EngineFilter }[] = [
  { label: "All engines", value: "all" },
  { label: "Listing", value: "listing" },
  { label: "Seller", value: "seller" },
  { label: "Buyer", value: "buyer" },
  { label: "Neighborhood", value: "neighborhood" },
];

/* ----------------------------------------
 Account cache (prevents flicker on remount)
---------------------------------------- */

let __accountCache: AccountMe | null | undefined = undefined;
let __accountCachePromise: Promise<AccountMe | null> | null = null;

async function getCachedAccount(): Promise<AccountMe | null> {
  if (__accountCache !== undefined) return __accountCache;

  if (!__accountCachePromise) {
    __accountCachePromise = fetch("/api/account/me")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as AccountMe | null;
      })
      .catch(() => null)
      .finally(() => {
        __accountCachePromise = null;
      });
  }

  __accountCache = await __accountCachePromise;
  return __accountCache;
}

/* ----------------------------------------
 Component
---------------------------------------- */

export default function OutputHistory({ onSelectEntry, refreshKey }: OutputHistoryProps) {
  const [account, setAccount] = useState<AccountMe | null>(
    __accountCache !== undefined ? __accountCache : null
  );
  const [accountLoading, setAccountLoading] = useState<boolean>(__accountCache === undefined);

  const [entries, setEntries] = useState<OutputHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false); // only used for Pro fetch
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState<EngineFilter>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isPro = isProAccount(account);

  // Engine pill scroller ref (mobile)
  const pillsRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active pill (mobile only)
  useEffect(() => {
    // md breakpoint = 768px
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;

    const root = pillsRef.current;
    if (!root) return;

    const activeEl = root.querySelector<HTMLButtonElement>("[data-active='true']");
    if (!activeEl) return;

    activeEl.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [engineFilter]);

  // Load plan (cached) — no "Checking plan..." UI
  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      // If cache exists, do not show loading state
      if (__accountCache !== undefined) {
        setAccount(__accountCache ?? null);
        setAccountLoading(false);
        return;
      }

      setAccountLoading(true);
      const data = await getCachedAccount();
      if (cancelled) return;

      setAccount(data);
      setAccountLoading(false);
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch recent entries (Pro only)
  useEffect(() => {
    let cancelled = false;

    async function loadRecent() {
      if (!isPro) return;

      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/intelligence/recent", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!cancelled) {
            setError(data?.error || "Could not load recent AI activity.");
            setEntries([]);
          }
          return;
        }

        const data = (await res.json()) as { entries?: OutputHistoryEntry[] };
        if (!cancelled) setEntries(data?.entries ?? []);
      } catch (err) {
        if (!cancelled) {
          console.error("Prompt history error", err);
          setError("Could not load recent AI activity.");
          setEntries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecent();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, isPro]);

  const filteredEntries = useMemo(() => {
    let list = [...entries];

    if (engineFilter !== "all") {
      list = list.filter((entry) => (entry.engineSlug ?? "unknown") === engineFilter);
    }

    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter((entry) => {
        const contextLabel =
          entry.contextType === "listing" && entry.contextLabel
            ? `Listing · ${entry.contextLabel}`
            : entry.contextType === "contact" && entry.contextLabel
            ? `Contact · ${entry.contextLabel}`
            : "No record attached";

        return (
          (entry.snippet ?? "").toLowerCase().includes(q) ||
          (entry.prompt ?? "").toLowerCase().includes(q) ||
          (entry.engine ?? "").toLowerCase().includes(q) ||
          contextLabel.toLowerCase().includes(q)
        );
      });
    }

    list.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      if (Number.isNaN(da) || Number.isNaN(db)) return 0;
      return sortOrder === "newest" ? db - da : da - db;
    });

    return list;
  }, [entries, engineFilter, search, sortOrder]);

  async function handleDeleteEntry(id: string) {
    const prev = entries;
    setEntries((list) => list.filter((e) => e.id !== id));

    try {
      const res = await fetch(`/api/intelligence/history/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch (err) {
      console.error("Delete history entry error", err);
      setEntries(prev);
    }
  }

  // Starter lock state (don’t show “loading recent runs…” for Starter)
  if (!accountLoading && !isPro) {
    return (
      <>
        <section className="mt-10">
          <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/75 px-6 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Recent AI activity (Pro)
            </p>

            <h3 className="mt-1 text-sm font-semibold text-slate-50">
              Save prompts + reload them later
            </h3>

            <p className="mt-2 max-w-2xl text-[11px] text-slate-300/90">
              Starter can generate and copy outputs, but saved prompts (history) and reloading past
              runs are available on Pro.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setUpgradeOpen(true)}
                className="inline-flex items-center justify-center rounded-full border border-[rgba(242,235,221,0.7)] bg-[rgba(242,235,221,0.10)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream)] hover:bg-[rgba(242,235,221,0.14)]"
              >
                Upgrade to Pro
              </button>

              <p className="text-[10px] text-slate-400/90">Pro = leverage — fewer manual steps, more momentum.</p>
            </div>
          </div>
        </section>

        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          feature="Recent AI activity"
          source="output_history"
        />
      </>
    );
  }

  // Pro UI (or while plan is loading)
  return (
    <>
      <section className="mt-10">
        <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/75 px-6 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
          <header className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Recent AI Activity
              </p>
              <h3 className="mt-1 text-sm font-semibold text-slate-50">
                Click a card to reload its prompt
              </h3>

              <p className="mt-1 text-[11px] text-slate-300/90">
                Every time you hit “Save Prompt”, Avillo logs the engine, the original input, and
                any attached listing or contact. History auto-clears after 60 days.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:items-end">
              {/* Engine pills – mobile horizontal scroll */}
              <div
                ref={pillsRef}
                className={[
                  // Mobile: horizontal scroll (like page header)
                  "flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap",
                  "touch-pan-x scroll-smooth",
                  // Hide scrollbar
                  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                  // Shared styling
                  "rounded-full border border-slate-700/80 bg-slate-900/70 p-1 text-[11px]",
                  // Desktop: no scrolling needed
                  "md:w-auto md:overflow-visible",
                ].join(" ")}
              >
                {ENGINE_FILTERS.map((f) => {
                  const active = engineFilter === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      data-active={active ? "true" : "false"}
                      onClick={() => setEngineFilter(f.value)}
                      className={[
                        // Prevent shrinking so pills scroll instead of wrapping
                        "shrink-0",
                        "px-3 py-1 rounded-full whitespace-nowrap transition-all duration-150",
                        active
                          ? "border border-[rgba(242,235,221,0.85)] bg-[rgba(242,235,221,0.12)] text-[var(--avillo-cream)] shadow-[0_0_0_1px_rgba(242,235,221,0.25),0_0_16px_rgba(242,235,221,0.20)]"
                          : "text-slate-200/80 hover:bg-slate-800",
                      ].join(" ")}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="h-8 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 text-[11px] text-slate-100 outline-none focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/50"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>

                <div className="relative w-full sm:w-64">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search input, listing, or contact…"
                    className="h-8 w-full rounded-full border border-slate-700/80 bg-slate-900/80 px-3 pl-7 text-[11px] text-slate-100 placeholder:text-slate-400 outline-none focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/50"
                  />
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">
                    🔍
                  </span>
                </div>
              </div>
            </div>
          </header>

          {!accountLoading && loading && (
            <p className="text-[11px] text-slate-300/90">Loading your recent AI runs…</p>
          )}

          {!accountLoading && !loading && error && (
            <p className="text-[11px] text-slate-300/90">
              {error} You can still generate and save new prompts above.
            </p>
          )}

          {!accountLoading && !loading && !error && filteredEntries.length === 0 && (
            <p className="text-[11px] text-slate-300/90">
              No recent runs found. Try adjusting filters/search, or save a new prompt above.
            </p>
          )}

          {!accountLoading && !loading && !error && filteredEntries.length > 0 && (
            <ul className="mt-3 max-h-80 overflow-y-auto text-xs">
              {filteredEntries.map((entry, idx) => {
                const created = entry.createdAt ? new Date(entry.createdAt) : null;

                const dateLabel = created
                  ? created.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "";

                const timeLabel = created
                  ? created.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "";

                const contextLabel =
                  entry.contextType === "listing" && entry.contextLabel
                    ? `Listing · ${entry.contextLabel}`
                    : entry.contextType === "contact" && entry.contextLabel
                    ? `Contact · ${entry.contextLabel}`
                    : "No record attached";

                const preview = entry.snippet?.trim() || entry.prompt?.trim().split("\n")[0] || "";

                return (
                  <li
                    key={entry.id}
                    className={[
                      "group flex items-start justify-between gap-3 rounded-2xl px-3 py-2 transition-colors",
                      idx !== filteredEntries.length - 1 ? "border-b border-slate-800/80" : "",
                      "lg:hover:bg-slate-900/70",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectEntry?.(entry)}
                      className="min-w-0 flex-1 text-left touch-manipulation"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream)]">
                          {entry.engine}
                        </span>

                        <span className="inline-flex items-center rounded-full border border-slate-800/70 bg-slate-950/50 px-2 py-[2px] text-[9px] font-medium text-slate-200/90">
                          {contextLabel}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-[12px] leading-relaxed text-slate-200/90">
                        {preview || "No input captured for this run."}
                      </p>
                    </button>

                    <div className="shrink-0 flex items-center gap-2">
                      <div className="text-right text-[10px] text-slate-400">
                        {dateLabel && <div>{dateLabel}</div>}
                        {timeLabel && <div>{timeLabel}</div>}
                      </div>

                      <button
                        type="button"
                        title="Delete saved prompt"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEntry(entry.id);
                        }}
                        className="rounded-full p-1 text-slate-400 hover:text-red-400 transition-opacity opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        🗑️
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="Recent AI activity"
        source="output_history"
      />
    </>
  );
}