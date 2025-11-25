// src/app/(portal)/intelligence/page.tsx
"use client";

import { useState } from "react";
import PageHeader from "@/components/layout/page-header";

import ListingEngine from "@/components/intelligence/engines/ListingEngine";
import SellerEngine from "@/components/intelligence/engines/SellerEngine";
import BuyerEngine from "@/components/intelligence/engines/BuyerEngine";
import NeighborhoodEngine from "@/components/intelligence/engines/NeighborhoodEngine";
import CRMHistory from "@/components/intelligence/CRMHistory";

type ActiveEngine = "listing" | "seller" | "buyer" | "neighborhood";

export default function IntelligencePage() {
  const [activeEngine, setActiveEngine] = useState<ActiveEngine>("listing");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setOutput] = useState<any | null>(null); // reserved for future use

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AI Tools for Real Estate"
        title="Avillo AI Command Center"
        subtitle="Transform raw notes into listing packs, seller scripts, buyer follow-ups, and CRM-ready insights — all in one workspace."
      />

      {/* --------- Engine selector pills --------- */}
      <div className="mt-5 inline-flex flex-wrap gap-2 text-xs">
        <EnginePill
          label="Listing Engine"
          description="MLS, social, emails, talking points."
          active={activeEngine === "listing"}
          onClick={() => setActiveEngine("listing")}
        />
        <EnginePill
          label="Seller Engine"
          description="Prelistings, presentations, objections."
          active={activeEngine === "seller"}
          onClick={() => setActiveEngine("seller")}
        />
        <EnginePill
          label="Buyer Engine"
          description="Tours, summaries, offers, nurture."
          active={activeEngine === "buyer"}
          onClick={() => setActiveEngine("buyer")}
        />
        <EnginePill
          label="Neighborhood Engine"
          description="Schools, lifestyle, access, and talking points."
          active={activeEngine === "neighborhood"}
          onClick={() => setActiveEngine("neighborhood")}
        />
      </div>

      {/* --------- Error bar --------- */}
      {error && <div className="avillo-error-bar">{error}</div>}

      {/* --------- Engines --------- */}
      <section className="grid gap-7 lg:grid-cols-1">
        {activeEngine === "listing" && (
          <ListingEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={setOutput}
            setError={setError}
          />
        )}

        {activeEngine === "seller" && (
          <SellerEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={setOutput}
            setError={setError}
          />
        )}

        {activeEngine === "buyer" && (
          <BuyerEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={setOutput}
            setError={setError}
          />
        )}

        {activeEngine === "neighborhood" && (
          <NeighborhoodEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={setOutput}
            setError={setError}
          />
        )}
      </section>

      {/* --------- CRM History --------- */}
      <CRMHistory />
    </div>
  );
}

/* ----------------------
 * Engine pill component
 * ---------------------*/

type EnginePillProps = {
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
};

function EnginePill({ label, description, active, onClick }: EnginePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        // base pill styling
        "inline-flex min-w-[170px] items-center justify-between rounded-full border px-4 py-2 text-left transition-all duration-200 sm:justify-start " +
        // soft-cream color + glow when active
        (active
          ? "border-[rgba(248,244,233,0.9)] bg-[rgba(248,244,233,0.12)] text-[var(--avillo-cream)] shadow-[0_0_0_1px_rgba(248,244,233,0.5),0_0_18px_rgba(248,244,233,0.6)]"
          : "border-[rgba(248,244,233,0.35)] text-[var(--avillo-cream-muted)] hover:bg-[rgba(248,244,233,0.06)]")
      }
    >
      <span className="flex flex-col text-left">
        <span className="text-[11px] font-medium">{label}</span>
        <span className="text-[10px] text-[var(--avillo-cream-muted)]">
          {description}
        </span>
      </span>
    </button>
  );
}
