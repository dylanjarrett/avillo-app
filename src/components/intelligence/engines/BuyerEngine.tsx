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

  /* ------------------------------------
   * RESTORE HANDLER (from history)
   * -----------------------------------*/
  useEffect(() => {
    if (!restoreRequest) return;
    if (restoreRequest.engine !== "buyer") return;

    const raw = restoreRequest.prompt.trim();
    if (!raw) return;

    // Lightweight detection for which tool this came from
    if (/offer|counter|escalation/i.test(raw)) {
      setActiveTool("offer");
    } else if (/tour|showing|we saw|we viewed/i.test(raw)) {
      setActiveTool("tour");
    } else {
      setActiveTool("search");
    }

    // Very simple hydration: drop the whole prompt into extra context
    setExtraContext(raw);
  }, [restoreRequest]);

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

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate buyer outputs.");
      }

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
      const userInput = (
        [
          `Buyer: ${buyerName}`,
          `Budget: ${budget}`,
          `Areas: ${areas}`,
          `Must-haves: ${mustHaves}`,
          timeline ? `Timeline: ${timeline}` : "",
          financing ? `Financing: ${financing}` : "",
          extraContext ? `Notes: ${extraContext}` : "",
          `Tool: ${activeTool === "search" ? "Search recap" : activeTool === "tour" ? "Tour follow-up" : "Offer strategy"}`,
        ]
          .filter(Boolean)
          .join("\n")
      ).trim();

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

        <h2 className="mb-1 text-sm font-semibold text-slate-50">
          Buyer Studio
        </h2>
        <p className="mb-4 text-xs text-slate-200/90">
          Fill out one buyer brief once. Generate search recaps, tour
          follow-ups, and offer strategy language from the same canvas.
        </p>

        {/* Tool selector – match Seller pill style */}
        <div className="mb-4 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap">
          <BuyerToolPill
            label="Search Recap"
            description="Weekly or milestone check-ins."
            active={activeTool === "search"}
            onClick={() => setActiveTool("search")}
          />
          <BuyerToolPill
            label="Tour Follow-Up"
            description="Recap showings + next steps."
            active={activeTool === "tour"}
            onClick={() => setActiveTool("tour")}
          />
          <BuyerToolPill
            label="Offer Strategy"
            description="Offer email + talking points."
            active={activeTool === "offer"}
            onClick={() => setActiveTool("offer")}
          />
        </div>

        {/* Buyer brief fields */}
        <div className="space-y-3 text-xs text-slate-100">
          <InputField
            label="Buyer name"
            value={buyerName}
            onChange={setBuyerName}
            placeholder="Jordan & Alex"
          />

          <InputField
            label="Budget"
            value={budget}
            onChange={setBudget}
            placeholder="$900k–$1.1M or up to $850k…"
          />

          <InputField
            label="Areas"
            value={areas}
            onChange={setAreas}
            placeholder="North Park, Normal Heights, Mission Hills…"
          />

          <TextareaField
            label="Must-haves"
            value={mustHaves}
            onChange={setMustHaves}
            rows={2}
            placeholder="3+ beds, at least 1.5 baths, walkable to coffee, quiet street, yard for dog…"
          />

          <InputField
            label="Timeline (optional)"
            value={timeline}
            onChange={setTimeline}
            placeholder="Ideally in a new home by May; lease ends in July…"
          />

          <InputField
            label="Financing (optional)"
            value={financing}
            onChange={setFinancing}
            placeholder="Pre-approved with XYZ Mortgage at 5% fixed; 20% down; contingent on sale of condo…"
          />

          <TextareaField
            label="Additional context (optional)"
            value={extraContext}
            onChange={setExtraContext}
            rows={3}
            placeholder="How you met, motivation (first home, upsizing, relocating), any tour notes or specific homes they loved/hated…"
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