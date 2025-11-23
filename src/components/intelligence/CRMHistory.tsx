// src/components/intelligence/CRMHistory.tsx
"use client";

import { useEffect, useState } from "react";

type CrmEntry = {
  id: string;
  createdAt: string;
  engine: "listing" | "seller" | "buyer" | string;
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
          // 401s etc. just show a soft message, don't break the page
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
      } catch (err: any) {
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
      <div className="avillo-card p-5">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              CRM History
            </p>
            <h3 className="text-sm font-semibold text-[var(--avillo-cream)]">
              Saved Outputs
            </h3>
          </div>
        </header>

        {loading && (
          <p className="text-[11px] text-[var(--avillo-cream-muted)]">
            Loading your recent AI-generated CRM entries…
          </p>
        )}

        {!loading && error && (
          <p className="text-[11px] text-[var(--avillo-cream-muted)]">
            {error} You can still generate new packs above.
          </p>
        )}

        {!loading && !error && entries.length === 0 && (
          <p className="text-[11px] text-[var(--avillo-cream-muted)]">
            No recent CRM data. As you save listing packs, seller scripts, and
            buyer follow-ups, they’ll show up here.
          </p>
        )}

        {!loading && !error && entries.length > 0 && (
          <ul className="mt-2 space-y-3 text-xs">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--avillo-border-subtle)] bg-[rgba(7,10,22,0.9)] px-3 py-2.5"
              >
                <div>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-[var(--avillo-cream)]">
                      {entry.title || "Saved AI output"}
                    </span>
                    <span className="rounded-full border border-[var(--avillo-border-subtle)] px-2 py-[2px] text-[9px] uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]">
                      {entry.engine}
                    </span>
                  </div>
                  {entry.snippet && (
                    <p className="text-[11px] text-[var(--avillo-cream-muted)] line-clamp-2">
                      {entry.snippet}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-[var(--avillo-cream-muted)]">
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

