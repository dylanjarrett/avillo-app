// src/components/intelligence/CRMHistory.tsx
"use client";

import { useEffect, useState } from "react";

type CrmEntry = {
  id: string;
  createdAt: string;
  engine: "listing" | "seller" | "buyer" | "neighborhood" | string;
  title?: string;
  snippet?: string;
};

export default function CRMHistory() {
  const [entries, setEntries] = useState<CrmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecent() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/crm/recent", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (!cancelled) {
            setError(data?.error || "Could not load recent CRM activity.");
            setEntries([]);
          }
          return;
        }

        const data = (await res.json()) as { entries?: CrmEntry[] };
        if (!cancelled) {
          setEntries(data?.entries ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("CRM history error", err);
          setError("Could not load recent CRM activity.");
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
  }, []);

  return (
    <section className="mt-10">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
        {/* Soft CRM glow */}
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)]" />

        {/* Header */}
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              CRM History
            </p>
            <h3 className="mt-1 text-sm font-semibold text-slate-50">
              Saved AI outputs
            </h3>
            <p className="mt-1 text-[11px] text-slate-300/90">
              Whenever you hit “Save to CRM” in any engine, the entry will appear here for a quick look-back.
            </p>
          </div>
        </header>

        {/* States */}
        {loading && (
          <p className="text-[11px] text-slate-300/90">
            Loading your recent AI-generated CRM entries…
          </p>
        )}

        {!loading && error && (
          <p className="text-[11px] text-slate-300/90">
            {error} You can still generate and save new outputs above.
          </p>
        )}

        {!loading && !error && entries.length === 0 && (
          <p className="text-[11px] text-slate-300/90">
            No recent CRM data yet. As you save listing packs, seller scripts, and buyer follow-ups from the engines above, they’ll show up here.
          </p>
        )}

        {/* Entries list */}
        {!loading && !error && entries.length > 0 && (
          <ul className="mt-3 space-y-3 text-xs">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3"
              >
                <div>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-50">
                      {entry.title || "Saved AI output"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-600/70 bg-slate-900/90 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100/80">
                      {entry.engine}
                    </span>
                  </div>
                  {entry.snippet && (
                    <p className="text-[11px] text-slate-300/90 leading-relaxed line-clamp-2">
                      {entry.snippet}
                    </p>
                  )}
                </div>

                <span className="text-[10px] text-slate-400/90 whitespace-nowrap">
                  {entry.createdAt
                    ? new Date(entry.createdAt).toLocaleDateString()
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
