// src/components/listings/listing-autopilot-activity-card.tsx
"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export default function ListingAutopilotActivityCard({
  listingId,
  enabled = true, // parent can gate fetch by active tab
}: {
  listingId: string | null | undefined;
  enabled?: boolean;
}) {
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autopilotItems, setAutopilotItems] = useState<any[]>([]);
  const [autopilotTasks, setAutopilotTasks] = useState<any[]>([]);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});

  // ✅ IDENTICAL to People page behavior:
  // - if no listingId, no fetch
  // - if you leave the Activity tab (enabled=false), clear to prevent stale flash
  // - AbortController cancellation
  useEffect(() => {
    if (!listingId) return;

    if (!enabled) {
      setAutopilotItems([]);
      setAutopilotTasks([]);
      setAutopilotLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadAutopilot() {
      try {
        setAutopilotLoading(true);

        const res = await fetch(`/api/listings/${listingId}/activity?autopilot=1`, {
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Failed to load activity");

        const data = await res.json();
        setAutopilotItems(Array.isArray(data?.items) ? data.items : []);
        setAutopilotTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setAutopilotItems([]);
        setAutopilotTasks([]);
      } finally {
        setAutopilotLoading(false);
      }
    }

    loadAutopilot();
    return () => controller.abort();
  }, [listingId, enabled]);

  return (
    <AutopilotActivityCard
      loading={autopilotLoading}
      items={autopilotItems}
      tasks={autopilotTasks}
      expandedRuns={expandedRuns}
      setExpandedRuns={setExpandedRuns}
    />
  );
}

/* ------------------------------------
 * IDENTICAL CARD (copied from People)
 * -----------------------------------*/

function AutopilotActivityCard({
  loading,
  items,
  tasks,
  expandedRuns,
  setExpandedRuns,
}: {
  loading: boolean;
  items: any[];
  tasks: any[];
  expandedRuns: Record<string, boolean>;
  setExpandedRuns: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const hasRuns = Array.isArray(items) && items.length > 0;
  const hasTasks = Array.isArray(tasks) && tasks.length > 0;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-amber-100/90">Autopilot activity</p>
          <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
            When automations run on this listing, you’ll see it logged here.
          </p>
        </div>
      </div>

      {loading && (
        <p className="mt-3 text-[11px] text-[var(--avillo-cream-muted)]">
          Loading Autopilot activity…
        </p>
      )}

      {!loading && !hasRuns && !hasTasks && (
        <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
          <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">
            No Autopilot activity yet for this listing.
          </p>
          <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
            Once an automation runs tied to this listing, it will appear here.
          </p>
        </div>
      )}

      {!loading && hasRuns && (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {(items ?? []).slice(0, 50).map((run: any) => {
            const runId = String(
              run?.id ?? run?.runId ?? `${run?.automationName ?? "run"}-${run?.executedAt ?? ""}`
            );
            const expanded = !!expandedRuns[runId];

            const statusRaw = String(run?.status ?? "").toUpperCase();
            const ok =
              statusRaw === "SUCCESS" || statusRaw === "OK" || statusRaw === "COMPLETED";

            const steps = Array.isArray(run?.steps) ? run.steps : [];
            const totalSteps =
              typeof run?.totalSteps === "number" ? run.totalSteps : steps.length;

            const failedSteps =
              typeof run?.failedSteps === "number"
                ? run.failedSteps
                : steps.filter((s: any) => String(s?.status ?? "").toUpperCase() === "FAILED").length;

            const executedAt = run?.executedAt ? new Date(run.executedAt) : null;

            return (
              <div
                key={runId}
                className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-slate-50">
                      {run?.automationName || run?.name || "Automation run"}
                    </p>

                    <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                      {executedAt
                        ? executedAt.toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Logged activity"}
                      {totalSteps ? (
                        <>
                          {" "}
                          • {totalSteps} step{totalSteps === 1 ? "" : "s"}
                          {failedSteps ? ` • ${failedSteps} failed` : ""}
                        </>
                      ) : null}
                    </p>

                    {run?.message ? (
                      <p className="mt-1 line-clamp-1 text-[10px] text-[var(--avillo-cream-soft)]">
                        {run.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={
                        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                        (ok
                          ? "border-emerald-200/70 bg-emerald-500/10 text-emerald-100"
                          : "border-amber-200/70 bg-amber-500/10 text-amber-100")
                      }
                    >
                      {ok ? "Success" : statusRaw ? statusRaw.toLowerCase() : "Logged"}
                    </span>

                    {steps.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }))
                        }
                        className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50"
                      >
                        {expanded ? "Hide steps" : "View steps"}
                      </button>
                    )}
                  </div>
                </div>

                {expanded && steps.length > 0 && (
                  <div className="mt-2">
                    <div className="max-h-40 space-y-1 overflow-y-auto pr-1 overscroll-contain">
                      {steps.map((s: any, idx: number) => {
                        const label =
                          s?.label || s?.name || s?.stepType || s?.type || `Step ${idx + 1}`;

                        const msg = s?.message || s?.summary || "";

                        return (
                          <div
                            key={`${runId}-step-${idx}`}
                            className="rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5"
                          >
                            <p className="text-[10px] font-semibold text-slate-50">
                              {String(label)}
                            </p>

                            {msg ? (
                              <p className="mt-0.5 whitespace-pre-wrap text-[10px] text-[var(--avillo-cream-muted)]">
                                {String(msg)}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && hasTasks && (
        <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
            Tasks created by Autopilot
          </p>

          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
            {(tasks ?? []).slice(0, 3).map((t: any) => (
              <div
                key={String(t?.id ?? `${t?.title ?? "task"}-${t?.dueAt ?? t?.createdAt ?? ""}`)}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-slate-50">{t?.title || "Task"}</p>
                  {(t?.dueAt || t?.createdAt) && (
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      {t?.dueAt
                        ? `Due ${new Date(t.dueAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : `Created ${new Date(t.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`}
                    </p>
                  )}
                </div>

                <span className="shrink-0 rounded-full border border-amber-200/70 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                  {String(t?.status || "OPEN").toLowerCase()}
                </span>
              </div>
            ))}

            {(tasks ?? []).length > 3 && (
              <p className="pt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                +{(tasks ?? []).length - 3} more task{(tasks ?? []).length - 3 === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}