"use client";

import { useEffect, useState } from "react";
import { BuyerOutputCanvas } from "@/components/intelligence/OutputCard";

export type BuyerToolId = "search" | "tour" | "offer";

export type BuyerPack = {
  search?: {
    summary?: string;
    nextSteps?: string;
    smsFollowUp?: string;
  };
  tour?: {
    recapEmail?: string;
    highlights?: string;
    concerns?: string;
  };
  offer?: {
    offerEmail?: string;
    strategySummary?: string;
    negotiationPoints?: string;
  };
};

type ComplianceHit = { type: "HARD"; match: string; rule: string };

type RestoreRequest =
  | {
      engine: "listing" | "seller" | "buyer" | "neighborhood";
      prompt: string;
    }
  | null;

type BuyerEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: BuyerPack | null) => void;
  setError: (message: string | null) => void;
  restoreRequest?: RestoreRequest;
  contextType?: "listing" | "contact" | "none" | null;
  contextId?: string | null;
  onSavedRun?: () => void;

  // Compliance banner hooks (HARD blocks only)
  onComplianceGuard?: (payload: { error: string; hits?: ComplianceHit[] }) => void;
  clearComplianceGuard?: () => void;
};

export default function BuyerEngine({
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
}: BuyerEngineProps) {
  const [activeTool, setActiveTool] = useState<BuyerToolId>("search");

  // -------- Shared buyer brief (single canvas) --------
  const [buyerName, setBuyerName] = useState("");
  const [budget, setBudget] = useState("");
  const [areas, setAreas] = useState("");
  const [mustHaves, setMustHaves] = useState("");
  const [timeline, setTimeline] = useState("");
  const [financing, setFinancing] = useState("");
  const [extraContext, setExtraContext] = useState("");

  const [pack, setPack] = useState<BuyerPack | null>(null);
  const [savingOutput, setSavingOutput] = useState(false);

  function clearGuardOnEdit() {
    // If you want the HARD banner to stay until dismissed, remove this line.
    clearComplianceGuard?.();
  }

  /* ------------------------------------
   * RESTORE HANDLER (from history)
   * -----------------------------------*/
  useEffect(() => {
    if (!restoreRequest) return;
    if (restoreRequest.engine !== "buyer") return;

    const raw = (restoreRequest.prompt || "").trim();
    if (!raw) return;

    const brief = parseBuyerBriefFromHistory(raw);

    setBuyerName(brief.buyerName || "");
    setBudget(brief.budget || "");
    setAreas(brief.areas || "");
    setMustHaves(brief.mustHaves || "");
    setTimeline(brief.timeline || "");
    setFinancing(brief.financing || "");
    setExtraContext(brief.extraContext || "");

    if (brief.lastTool) {
      setActiveTool(brief.lastTool);
    } else if (brief.extraContext?.match(/offer|counter|escalation/i)) {
      setActiveTool("offer");
    } else if (brief.extraContext?.match(/tour|showing|we saw|we viewed/i)) {
      setActiveTool("tour");
    } else {
      setActiveTool("search");
    }

    // reset banners/errors on restore
    clearComplianceGuard?.();
    setError(null);
  }, [restoreRequest, clearComplianceGuard, setError]);

  /* ------------------------------------
   * VALIDATION
   * -----------------------------------*/
  function validateBrief(): boolean {
    if (!buyerName || !budget || !areas || !mustHaves) {
      setError(
        "Please fill buyer name, budget, areas, and must-haves before generating Buyer Studio outputs."
      );
      return false;
    }
    return true;
  }

  /* ------------------------------------
   * GENERATE VIA /api/generate-intelligence
   * -----------------------------------*/
  async function handleGenerate() {
    if (!validateBrief()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const body: any = {
        engine: "buyer",
        tool: activeTool,
        buyerName,
        budget,
        areas,
        mustHaves,
        timeline,
        financing,
        extraContext,
      };

      const res = await fetch("/api/generate-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        throw new Error(data?.error || "Failed to generate buyer outputs.");
      }

      // success: clear old block banner if any
      clearComplianceGuard?.();

      const data = await res.json();
      const nextPack: BuyerPack = { ...(pack || {}), ...(data || {}) };

      setPack(nextPack);
      setOutput(nextPack);
    } catch (err: any) {
      console.error("Buyer engine error", err);
      setError(err?.message || "Something went wrong while generating.");
    } finally {
      setIsGenerating(false);
    }
  }

  /* ------------------------------------
   * SAVE OUTPUT (DB history)
   * -----------------------------------*/
  async function handleSaveOutput() {
    if (!pack) return;

    setSavingOutput(true);
    try {
      const userInput = formatBuyerBriefForHistory({
        buyerName,
        budget,
        areas,
        mustHaves,
        timeline,
        financing,
        extraContext,
        lastTool: activeTool,
      });

      const res = await fetch("/api/intelligence/save-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "buyer",
          userInput,
          outputs: pack,
          contextType: (contextType ?? "none") as "listing" | "contact" | "none",
          contextId: contextId ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Save buyer output failed", data);
      } else {
        onSavedRun?.();
      }
    } catch (err) {
      console.error("Failed to save buyer pack", err);
    } finally {
      setSavingOutput(false);
    }
  }

  /* ------------------------------------
   * RENDER
   * -----------------------------------*/
  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* LEFT: INPUT CARD */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)] opacity-40 blur-3xl" />

        <h2 className="mb-1 text-sm font-semibold text-slate-50">Buyer Studio</h2>
        <p className="mb-4 text-xs text-slate-200/90">
          Fill out one buyer brief once. Generate search recaps, tour follow-ups,
          and offer strategy language from the same canvas.
        </p>

        {/* Tool selector – match Seller pill style */}
        <div className="mb-4 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap">
          <BuyerToolPill
            label="Search Recap"
            description="Weekly or milestone check-ins."
            active={activeTool === "search"}
            onClick={() => {
              setActiveTool("search");
              clearGuardOnEdit();
            }}
          />
          <BuyerToolPill
            label="Tour Follow-Up"
            description="Recap showings + next steps."
            active={activeTool === "tour"}
            onClick={() => {
              setActiveTool("tour");
              clearGuardOnEdit();
            }}
          />
          <BuyerToolPill
            label="Offer Strategy"
            description="Offer email + talking points."
            active={activeTool === "offer"}
            onClick={() => {
              setActiveTool("offer");
              clearGuardOnEdit();
            }}
          />
        </div>

        {/* Buyer brief fields */}
        <div className="space-y-3 text-xs text-slate-100">
          <InputField
            label="Buyer name"
            value={buyerName}
            onChange={(v) => {
              setBuyerName(v);
              clearGuardOnEdit();
            }}
            placeholder="Jordan & Alex"
          />

          <InputField
            label="Budget"
            value={budget}
            onChange={(v) => {
              setBudget(v);
              clearGuardOnEdit();
            }}
            placeholder="$900k–$1.1M or up to $850k…"
          />

          <InputField
            label="Areas"
            value={areas}
            onChange={(v) => {
              setAreas(v);
              clearGuardOnEdit();
            }}
            placeholder="North Park, Normal Heights, Mission Hills…"
          />

          <TextareaField
            label="Must-haves"
            value={mustHaves}
            onChange={(v) => {
              setMustHaves(v);
              clearGuardOnEdit();
            }}
            rows={2}
            placeholder="3+ beds, at least 1.5 baths, walkable to coffee, quiet street, yard for dog…"
          />

          <InputField
            label="Timeline (optional)"
            value={timeline}
            onChange={(v) => {
              setTimeline(v);
              clearGuardOnEdit();
            }}
            placeholder="Ideally in a new home by May; lease ends in July…"
          />

          <InputField
            label="Financing (optional)"
            value={financing}
            onChange={(v) => {
              setFinancing(v);
              clearGuardOnEdit();
            }}
            placeholder="Pre-approved with XYZ Mortgage at 5% fixed; 20% down; contingent on sale of condo…"
          />

          <TextareaField
            label="Additional context (optional)"
            value={extraContext}
            onChange={(v) => {
              setExtraContext(v);
              clearGuardOnEdit();
            }}
            rows={3}
            placeholder="Motivation, tour notes, homes they loved/hated…"
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20 disabled:opacity-60"
        >
          {isGenerating ? "Generating…" : "Generate Buyer Outputs"}
        </button>
      </div>

      {/* RIGHT: OUTPUT CANVAS */}
      <BuyerOutputCanvas
        pack={pack}
        activeTool={activeTool}
        onSaveOutput={handleSaveOutput}
        savingOutput={savingOutput}
      />
    </section>
  );
}

/* ------------------------------------
 * SUB COMPONENTS
 * -----------------------------------*/

function BuyerToolPill({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full flex-col rounded-xl border px-4 py-2 text-left text-xs transition sm:w-auto " +
        (active
          ? "border-amber-100/80 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)]"
          : "border-slate-700/80 bg-slate-900/60 text-slate-300/90 hover:border-amber-100/60 hover:text-amber-100 hover:bg-slate-900/80")
      }
    >
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[10px] text-slate-300/90">{description}</span>
    </button>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-100/70 focus:ring-1 focus:ring-amber-100/70"
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-100/70 focus:ring-1 focus:ring-amber-100/70"
      />
    </div>
  );
}

/* ------------------------------------
 * HISTORY HELPERS (save + restore)
 * -----------------------------------*/

type BuyerBrief = {
  buyerName?: string;
  budget?: string;
  areas?: string;
  mustHaves?: string;
  timeline?: string;
  financing?: string;
  extraContext?: string;
  lastTool?: BuyerToolId;
};

function formatBuyerBriefForHistory(brief: BuyerBrief): string {
  return [
    brief.buyerName && `Buyer: ${brief.buyerName}`,
    brief.budget && `Budget: ${brief.budget}`,
    brief.areas && `Areas: ${brief.areas}`,
    brief.mustHaves && `Must-haves: ${brief.mustHaves}`,
    brief.timeline && `Timeline: ${brief.timeline}`,
    brief.financing && `Financing: ${brief.financing}`,
    brief.extraContext && `Additional context: ${brief.extraContext}`,
    brief.lastTool && `Tool: ${brief.lastTool}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseBuyerBriefFromHistory(raw: string): BuyerBrief {
  const brief: BuyerBrief = {};
  if (!raw) return brief;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentKey: keyof BuyerBrief | null = null;

  for (const line of lines) {
    if (line.includes(":")) {
      const [labelPart, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      const key = labelPart.toLowerCase().replace(/[^a-z]/g, "");

      switch (key) {
        case "buyer":
        case "buyername":
          brief.buyerName = value;
          currentKey = "buyerName";
          break;
        case "budget":
          brief.budget = value;
          currentKey = "budget";
          break;
        case "areas":
        case "searchareas":
          brief.areas = value;
          currentKey = "areas";
          break;
        case "musthaves":
        case "must-haves":
          brief.mustHaves = value;
          currentKey = "mustHaves";
          break;
        case "timeline":
          brief.timeline = value;
          currentKey = "timeline";
          break;
        case "financing":
          brief.financing = value;
          currentKey = "financing";
          break;
        case "additionalcontext":
        case "context":
        case "notes":
          brief.extraContext = value;
          currentKey = "extraContext";
          break;
        case "tool": {
          const v = value.toLowerCase();
          if (v.includes("search")) brief.lastTool = "search";
          else if (v.includes("tour")) brief.lastTool = "tour";
          else if (v.includes("offer")) brief.lastTool = "offer";
          currentKey = null;
          break;
        }
        default:
          brief.extraContext =
            (brief.extraContext ? `${brief.extraContext}\n` : "") + value;
          currentKey = "extraContext";
      }
    } else {
      if (!currentKey) currentKey = "extraContext";

      const append = (prev?: string) => (prev ? `${prev}\n` : "") + line;

      switch (currentKey) {
        case "buyerName":
          brief.buyerName = append(brief.buyerName);
          break;
        case "budget":
          brief.budget = append(brief.budget);
          break;
        case "areas":
          brief.areas = append(brief.areas);
          break;
        case "mustHaves":
          brief.mustHaves = append(brief.mustHaves);
          break;
        case "timeline":
          brief.timeline = append(brief.timeline);
          break;
        case "financing":
          brief.financing = append(brief.financing);
          break;
        case "extraContext":
        default:
          brief.extraContext = append(brief.extraContext);
          currentKey = "extraContext";
          break;
      }
    }
  }

  return brief;
}