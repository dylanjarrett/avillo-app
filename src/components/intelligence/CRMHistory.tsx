// src/components/intelligence/CRMHistory.tsx
"use client";

import React, { useEffect, useState } from "react";
import { fetchRecentAI, type CRMRecord } from "@/lib/crm";

export default function CRMHistory() {
  const [records, setRecords] = useState<CRMRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const res = await fetchRecentAI(10);
      if (!cancelled) {
        setRecords(res);
        setLoading(false);
      }
    }

    load();

    const handleFocus = () => load();
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return (
    <div className="bg-slate-950/80 rounded-2xl border border-slate-700/70 shadow-xl p-6 mt-4">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/70 uppercase mb-1">
        CRM history
      </p>
      <h2 className="text-lg font-semibold text-slate-50">Recent AI saves</h2>
      <p className="mt-1 text-[11px] text-slate-400 max-w-xl">
        Snapshots of what Avillo has pushed into your CRM recently. This will
        grow as you run more workflows.
      </p>

      {loading ? (
        <p className="mt-4 text-xs text-slate-400 animate-pulse">
          Loading recent entries…
        </p>
      ) : records.length === 0 ? (
        <p className="mt-4 text-xs text-slate-400">
          Nothing saved yet. Generate an output and hit{" "}
          <span className="font-semibold">Save to CRM</span> to log it here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3 text-xs text-slate-200">
          {records.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-slate-700 bg-slate-900/60 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-[0.16em] text-amber-100/70">
                  {r.type || "general"}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap">{r.processed}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
