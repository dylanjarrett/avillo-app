"use client";

import { useEffect, useMemo, useState } from "react";

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

type EngineFilter =
  | "all"
  | "listing"
  | "seller"
  | "buyer"
  | "neighborhood"
  | "unknown";

const ENGINE_FILTERS: { label: string; value: EngineFilter }[] = [
  { label: "All engines", value: "all" },
  { label: "Listing", value: "listing" },
  { label: "Seller", value: "seller" },
  { label: "Buyer", value: "buyer" },
  { label: "Neighborhood", value: "neighborhood" },
];

export default function OutputHistory({
  onSelectEntry,
  refreshKey,
}: OutputHistoryProps) {
  const [entries, setEntries] = useState<OutputHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState<EngineFilter>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // --- Fetch recent entries ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadRecent() {
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
        if (!cancelled) {
          setEntries(data?.entries ?? []);
        }
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

    loadRecent();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // --- Filters / search / sort -----------------------------------------------
  const filteredEntries = useMemo(() => {
    let list = [...entries];

    if (engineFilter !== "all") {
      list = list.filter((entry) => {
        const slug = entry.engineSlug ?? "unknown";
        return slug === engineFilter;
      });
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

  // --- Delete entry (quick cleanup) ------------------------------------------
  async function handleDeleteEntry(id: string) {
    const prev = entries;

    // Optimistic UI remove
    setEntries((list) => list.filter((e) => e.id !== id));

    try {
      const res = await fetch(`/api/intelligence/history/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Delete failed");
    } catch (err) {
      console.error("Delete history entry error", err);
      // rollback
      setEntries(prev);
    }
  }

  // --- Render -----------------------------------------------------------------
  return (
    <section className="mt-10">
      {/* Outer panel – matches other Intelligence cards */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/75 px-6 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.7)]">
        {/* Header + controls */}
        <header className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
              Recent AI Activity
            </p>
            <h3 className="mt-1 text-sm font-semibold text-slate-50">
              Click a card to reload its prompt
            </h3>

            <p className="mt-1 text-[11px] text-slate-300/90">
              Every time you hit “Save Prompt”, Avillo logs the engine, the
              original input, and any attached listing or contact. History
              auto-clears after 60 days.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            {/* Engine filter pills */}
            <div className="inline-flex rounded-full border border-slate-700/80 bg-slate-900/70 p-1 text-[11px]">
              {ENGINE_FILTERS.map((f) => {
                const active = engineFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setEngineFilter(f.value)}
                    className={[
                      "px-3 py-1 rounded-full whitespace-nowrap transition-colors",
                      active
                        ? "bg-amber-200 text-slate-900"
                        : "text-slate-200/80 hover:bg-slate-800",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Sort + search */}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <select
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as "newest" | "oldest")
                }
                className="h-8 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 text-[11px] text-slate-100 outline-none focus:border-amber-200"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>

              <div className="relative w-full sm:w-64">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search input, listing, or contact…"
                  className="h-8 w-full rounded-full border border-slate-700/80 bg-slate-900/80 px-3 pl-7 text-[11px] text-slate-100 placeholder:text-slate-400 outline-none focus:border-amber-200"
                />
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">
                  🔍
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* States */}
        {loading && (
          <p className="text-[11px] text-slate-300/90">
            Loading your recent AI runs…
          </p>
        )}

        {!loading && error && (
          <p className="text-[11px] text-slate-300/90">
            {error} You can still generate and save new prompts above.
          </p>
        )}

        {/* IMPORTANT: use filteredEntries here (not entries) */}
        {!loading && !error && filteredEntries.length === 0 && (
          <p className="text-[11px] text-slate-300/90">
            No recent runs found. Try adjusting filters/search, or save a new
            prompt above.
          </p>
        )}

        {/* Entries list */}
{!loading && !error && filteredEntries.length > 0 && (
  <ul className="mt-3 max-h-80 overflow-y-auto text-xs">
    {filteredEntries.map((entry, idx) => {
      const created = entry.createdAt ? new Date(entry.createdAt) : null;

      const dateLabel = created
        ? created.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "";

      const timeLabel = created
        ? created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : "";

      const contextLabel =
        entry.contextType === "listing" && entry.contextLabel
          ? `Listing · ${entry.contextLabel}`
          : entry.contextType === "contact" && entry.contextLabel
          ? `Contact · ${entry.contextLabel}`
          : "No record attached";

      const preview =
        entry.snippet?.trim() || entry.prompt?.trim().split("\n")[0] || "";

      return (
        <li
          key={entry.id}
          className={[
            "group flex items-start justify-between gap-3 rounded-2xl px-3 py-2 transition-colors",
            idx !== filteredEntries.length - 1 ? "border-b border-slate-800/80" : "",
            "hover:bg-slate-900/70",
          ].join(" ")}
        >
          {/* Clickable row (no nested buttons) */}
          <button
            type="button"
            onClick={() => onSelectEntry?.(entry)}
            className="min-w-0 flex-1 text-left touch-manipulation"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-800/90 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100/90">
                {entry.engine}
              </span>

              <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-[2px] text-[9px] font-medium text-slate-200/90">
                {contextLabel}
              </span>
            </div>

            <p className="line-clamp-2 text-[12px] leading-relaxed text-slate-200/90">
              {preview || "No input captured for this run."}
            </p>
          </button>

          {/* Right side: timestamp + delete */}
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
              className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 text-slate-400 hover:text-red-400"
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
  );
}