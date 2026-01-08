"use client";

import { useEffect, useState } from "react";
import type { NeighborhoodPack, NeighborhoodTabId } from "@/lib/intelligence";
import { NeighborhoodOutputCanvas } from "@/components/intelligence/OutputCard";

type ComplianceHit = { type: "HARD"; match: string; rule: string };

type RestoreRequest =
  | {
      engine: "listing" | "seller" | "buyer" | "neighborhood";
      prompt: string;
    }
  | null;

type NeighborhoodEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: NeighborhoodPack | null) => void;
  setError: (message: string | null) => void;
  restoreRequest?: RestoreRequest;
  contextType?: "listing" | "contact" | "none" | null;
  contextId?: string | null;
  onSavedRun?: () => void;

  // Compliance banner hooks (HARD blocks only)
  onComplianceGuard?: (payload: { error: string; hits?: ComplianceHit[] }) => void;
  clearComplianceGuard?: () => void;
};

export default function NeighborhoodEngine({
  isGenerating,
  setIsGenerating,
  setOutput,
  setError,
  restoreRequest,
  contextType,
  contextId,
  onSavedRun,
  onComplianceGuard,
  clearComplianceGuard,
}: NeighborhoodEngineProps) {
  const [areaFocus, setAreaFocus] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [pack, setPack] = useState<NeighborhoodPack | null>(null);
  const [savingOutput, setSavingOutput] = useState(false);
  const [activeTab, setActiveTab] = useState<NeighborhoodTabId>("overview");

  function clearGuardOnEdit() {
    // If you want HARD banners to remain while editing until user clicks "Got it",
    // remove this line.
    clearComplianceGuard?.();
  }

  /* ------------------------------------
   * RESTORE HANDLER (from history card)
   * -----------------------------------*/
  useEffect(() => {
    if (!restoreRequest) return;
    if (restoreRequest.engine !== "neighborhood") return;

    const raw = (restoreRequest.prompt || "").trim();
    if (!raw) return;

    const brief = parseNeighborhoodBriefFromHistory(raw);

    setAreaFocus(brief.area || "");
    setContextNotes(brief.context || "");
    setActiveTab("overview");

    // Reset banners/errors on restore
    clearComplianceGuard?.();
    setError(null);
  }, [restoreRequest, clearComplianceGuard, setError]);

  /* ------------------------------------
   * GENERATE SNAPSHOT
   * -----------------------------------*/
  async function handleGenerate() {
    const area = areaFocus.trim();
    if (!area) {
      setError("Add a ZIP code, city, or neighborhood before generating.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "neighborhood",
          areaFocus: area,
          context: contextNotes,
        }),
      });

      // HARD compliance block only (server returns 422)
      if (res.status === 422) {
        const data = await res.json().catch(() => null);
        onComplianceGuard?.({
          error:
            data?.error ||
            "We blocked this request due to protected-class targeting or steering language.",
          hits: (data?.compliance?.hits ?? []) as ComplianceHit[],
        });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate neighborhood snapshot.");
      }

      // Success: clear any previous block banner
      clearComplianceGuard?.();

      const data = await res.json();
      const nextPack = (data?.pack ?? data?.neighborhood ?? data) as NeighborhoodPack;

      setPack(nextPack);
      setOutput(nextPack);
    } catch (err: any) {
      console.error("Neighborhood engine error", err);
      setError(err?.message || "Something went wrong while generating.");
    } finally {
      setIsGenerating(false);
    }
  }

  /* ------------------------------------
   * SAVE TO HISTORY (DB)
   * -----------------------------------*/
  async function handleSaveOutput() {
    if (!pack) return;

    setSavingOutput(true);
    try {
      const userInput = formatNeighborhoodBriefForHistory({
        area: areaFocus,
        context: contextNotes,
      });

      const res = await fetch("/api/intelligence/save-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "neighborhood",
          userInput,
          outputs: pack,
          contextType: (contextType ?? "none") as "listing" | "contact" | "none",
          contextId: contextId ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Save neighborhood output failed", data);
      } else {
        onSavedRun?.();
      }
    } catch (err) {
      console.error("Failed to save neighborhood pack", err);
    } finally {
      setSavingOutput(false);
    }
  }

  /* ------------------------------------
   * RENDER
   * -----------------------------------*/
  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* LEFT INPUT CARD */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 pb-4 pt-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)] opacity-40 blur-3xl" />

        <h2 className="mb-1 text-sm font-semibold text-slate-50">Neighborhood Engine</h2>
        <p className="mb-4 text-xs text-slate-200/90">
          Turn any ZIP code, city, or neighborhood into a lifestyle snapshot: schools,
          walk &amp; bike feel, safety context, essentials, and buyer-ready talking points.
        </p>

        <div className="space-y-3 text-xs text-slate-100">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
              Area focus
            </label>
            <input
              value={areaFocus}
              onChange={(e) => {
                setAreaFocus(e.target.value);
                clearGuardOnEdit();
              }}
              placeholder="92130, Carmel Valley, or Eastside Costa Mesa…"
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-100/70 focus:ring-1 focus:ring-amber-100/70"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
              Context / client notes (optional)
            </label>
            <textarea
              value={contextNotes}
              onChange={(e) => {
                setContextNotes(e.target.value);
                clearGuardOnEdit();
              }}
              rows={3}
              placeholder="Buyer profile, price range, commute needs, lifestyle preferences…"
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-100/70 focus:ring-1 focus:ring-amber-100/70"
            />
          </div>

          <p className="mt-1 text-[11px] text-slate-300/90">
            Always verify schools, boundaries, and crime/safety sources before sending to clients.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating…" : "Generate Snapshot"}
        </button>
      </div>

      {/* RIGHT OUTPUT CANVAS */}
      <NeighborhoodOutputCanvas
        pack={pack}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSaveOutput={handleSaveOutput}
        savingOutput={savingOutput}
      />
    </section>
  );
}

/* ------------------------------------
 * HISTORY HELPERS (save + restore)
 * -----------------------------------*/

type NeighborhoodBrief = {
  area?: string;
  context?: string;
};

function formatNeighborhoodBriefForHistory(brief: NeighborhoodBrief): string {
  return [brief.area && `Area: ${brief.area}`, brief.context && `Context: ${brief.context}`]
    .filter(Boolean)
    .join("\n");
}

/**
 * Accepts:
 * - Labeled format:
 *   Area: ...
 *   Context: ...
 * - Or unlabeled fallback:
 *   first line => area
 *   remaining lines => context
 */
function parseNeighborhoodBriefFromHistory(raw: string): NeighborhoodBrief {
  const brief: NeighborhoodBrief = {};
  if (!raw) return brief;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let sawLabel = false;

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;

    const label = line.slice(0, idx).toLowerCase().replace(/[^a-z]/g, "");
    const value = line.slice(idx + 1).trim();
    if (!value) continue;

    sawLabel = true;

    if (label === "area" || label === "areafocus" || label === "location") {
      brief.area = value;
      continue;
    }

    if (label === "context" || label === "notes" || label === "clientnotes") {
      brief.context = value;
      continue;
    }

    // Unknown label -> treat as extra context
    brief.context = (brief.context ? `${brief.context}\n` : "") + value;
  }

  if (!sawLabel && lines.length > 0) {
    brief.area = lines[0];
    if (lines.length > 1) brief.context = lines.slice(1).join("\n");
  }

  return brief;
}
