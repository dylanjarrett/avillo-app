"use client";

import { useState } from "react";
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

type BuyerEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: BuyerPack | null) => void;
  setError: (message: string | null) => void;
};

export default function BuyerEngine({
  isGenerating,
  setIsGenerating,
  setOutput,
  setError,
}: BuyerEngineProps) {
  const [activeTool, setActiveTool] = useState<BuyerToolId>("search");

  // ---- Search recap state ----
  const [buyerNameSearch, setBuyerNameSearch] = useState("");
  const [criteriaSearch, setCriteriaSearch] = useState("");
  const [contextSearch, setContextSearch] = useState("");

  // ---- Tour follow-up state ----
  const [buyerNameTour, setBuyerNameTour] = useState("");
  const [propertiesTour, setPropertiesTour] = useState("");
  const [contextTour, setContextTour] = useState("");

  // ---- Offer strategy state ----
  const [buyerNameOffer, setBuyerNameOffer] = useState("");
  const [propertyOffer, setPropertyOffer] = useState("");
  const [priceOffer, setPriceOffer] = useState("");
  const [contextOffer, setContextOffer] = useState("");

  // ---- Result + CRM ----
  const [pack, setPack] = useState<BuyerPack | null>(null);
  const [savingCrm, setSavingCrm] = useState(false);

  // ----------------------------
  // Validation
  // ----------------------------
  function validateCurrentTool(): boolean {
    if (activeTool === "search") {
      if (!buyerNameSearch || !criteriaSearch) {
        setError(
          "Please add the buyer name and what they’re looking for to generate a search recap."
        );
        return false;
      }
    }

    if (activeTool === "tour") {
      if (!buyerNameTour || !propertiesTour) {
        setError(
          "Please add the buyer name and which homes you toured to generate a follow-up."
        );
        return false;
      }
    }

    if (activeTool === "offer") {
      if (!buyerNameOffer || !propertyOffer || !priceOffer) {
        setError(
          "Please add the buyer name, property, and target price to generate an offer strategy."
        );
        return false;
      }
    }

    return true;
  }

  // ----------------------------
  // Generate via /api/generate-intelligence
  // ----------------------------
  async function handleGenerate() {
    if (!validateCurrentTool()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const body: any = {
        engine: "buyer",
        tool: activeTool,
      };

      if (activeTool === "search") {
        body.buyerName = buyerNameSearch;
        body.criteria = criteriaSearch;
        body.context = contextSearch;
      }

      if (activeTool === "tour") {
        body.buyerName = buyerNameTour;
        body.properties = propertiesTour;
        body.context = contextTour;
      }

      if (activeTool === "offer") {
        body.buyerName = buyerNameOffer;
        body.property = propertyOffer;
        body.price = priceOffer;
        body.context = contextOffer;
      }

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

      // Expecting shape like:
      // {
      //   search?: { summary, nextSteps, smsFollowUp },
      //   tour?: { recapEmail, highlights, concerns },
      //   offer?: { offerEmail, strategySummary, negotiationPoints }
      // }
      const nextPack: BuyerPack = {
        ...(pack || {}),
        ...(data || {}),
      };

      setPack(nextPack);
      setOutput(nextPack);
    } catch (err: any) {
      console.error("Buyer engine error", err);
      setError(err?.message || "Something went wrong while generating.");
    } finally {
      setIsGenerating(false);
    }
  }

  // ----------------------------
  // Save to CRM
  // ----------------------------
  async function handleSaveToCrm() {
    if (!pack) return;

    setSavingCrm(true);
    try {
      await fetch("/api/crm/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "buyer",
          tool: activeTool,
          payload: pack,
        }),
      });
    } catch (err) {
      console.error("Failed to save buyer pack to CRM", err);
    } finally {
      setSavingCrm(false);
    }
  }

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* ---------- LEFT: INPUT CARD ---------- */}
      <div className="avillo-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--avillo-cream)]">
          Buyer Studio
        </h2>
        <p className="mb-4 text-xs text-[var(--avillo-cream-muted)]">
          Turn search criteria, tours, and offers into clean summaries and
          follow-up emails.
        </p>

        {/* Tool selector pills */}
        <div className="mb-4 flex flex-col gap-2 text-xs sm:inline-flex sm:flex-row sm:flex-wrap">
          <BuyerToolPill
            label="Search Recap"
            description="Weekly search summary."
            active={activeTool === "search"}
            onClick={() => setActiveTool("search")}
          />
          <BuyerToolPill
            label="Tour Follow-Up"
            description="Tour recap + notes."
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

        {/* Active tool input fields */}
        <div className="space-y-3 text-xs">
          {activeTool === "search" && (
            <>
              <InputField
                label="Buyer name"
                value={buyerNameSearch}
                onChange={setBuyerNameSearch}
                placeholder="Jordan"
              />
              <TextareaField
                label="What they’re looking for"
                value={criteriaSearch}
                onChange={setCriteriaSearch}
                placeholder="Budget, areas, beds/baths, non-negotiables…"
                rows={3}
              />
              <TextareaField
                label="Context / notes (optional)"
                value={contextSearch}
                onChange={setContextSearch}
                placeholder="How long they’ve been searching, timing, other notes…"
                rows={3}
              />
            </>
          )}

          {activeTool === "tour" && (
            <>
              <InputField
                label="Buyer name"
                value={buyerNameTour}
                onChange={setBuyerNameTour}
                placeholder="Jordan"
              />
              <TextareaField
                label="Homes you toured"
                value={propertiesTour}
                onChange={setPropertiesTour}
                placeholder="Addresses, key pros/cons, which ones they liked…"
                rows={3}
              />
              <TextareaField
                label="Context / notes (optional)"
                value={contextTour}
                onChange={setContextTour}
                placeholder="Their reactions, questions, timing, financing status…"
                rows={3}
              />
            </>
          )}

          {activeTool === "offer" && (
            <>
              <InputField
                label="Buyer name"
                value={buyerNameOffer}
                onChange={setBuyerNameOffer}
                placeholder="Jordan"
              />
              <InputField
                label="Property"
                value={propertyOffer}
                onChange={setPropertyOffer}
                placeholder="1234 Ocean View Dr, San Diego, CA"
              />
              <InputField
                label="Target offer price"
                value={priceOffer}
                onChange={setPriceOffer}
                placeholder="$1,250,000"
              />
              <TextareaField
                label="Context / notes"
                value={contextOffer}
                onChange={setContextOffer}
                placeholder="Comps, list price, competition level, buyer risk tolerance, terms you’re considering…"
                rows={3}
              />
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="avillo-btn mt-4 flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating…" : "Generate Buyer Outputs"}
        </button>
      </div>

      {/* ---------- RIGHT: OUTPUT CANVAS (delegated) ---------- */}
      <BuyerOutputCanvas
        pack={pack}
        activeTool={activeTool}
        onSaveToCrm={handleSaveToCrm}
        savingCrm={savingCrm}
      />
    </section>
  );
}

// --------------------
// Small sub-components
// --------------------

type BuyerToolPillProps = {
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
};

function BuyerToolPill({
  label,
  description,
  active,
  onClick,
}: BuyerToolPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full flex-col rounded-xl border px-4 py-2 text-left text-xs transition sm:w-auto " +
        (active
          ? "border-[var(--avillo-gold)] bg-[rgba(24,20,10,0.95)] text-[var(--avillo-cream)] shadow-[0_0_16px_rgba(244,210,106,0.45)]"
          : "border-transparent text-[var(--avillo-cream-muted)] hover:border-[var(--avillo-gold)]/50 hover:text-[var(--avillo-cream)] hover:bg-white/5")
      }
    >
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[10px] text-[var(--avillo-cream-muted)]">
        {description}
      </span>
    </button>
  );
}

type InputFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: InputFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="avillo-input w-full"
      />
    </div>
  );
}

type TextareaFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
};

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: TextareaFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="avillo-textarea w-full"
      />
    </div>
  );
}