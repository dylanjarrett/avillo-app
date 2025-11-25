// src/components/intelligence/engines/NeighborhoodEngine.tsx
"use client";

import { useState } from "react";
import type { NeighborhoodPack } from "@/lib/intelligence";

export type NeighborhoodTabId =
  | "overview"
  | "schools"
  | "mobility"
  | "essentials"
  | "lifestyle";

const NEIGHBORHOOD_TABS: { id: NeighborhoodTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "schools", label: "Schools" },
  { id: "mobility", label: "Mobility & commute" },
  { id: "essentials", label: "Essentials" },
  { id: "lifestyle", label: "Lifestyle & safety" },
];

type NeighborhoodEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: NeighborhoodPack | null) => void;
  setError: (message: string | null) => void;
};

export default function NeighborhoodEngine({
  isGenerating,
  setIsGenerating,
  setOutput,
  setError,
}: NeighborhoodEngineProps) {
  const [areaFocus, setAreaFocus] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [pack, setPack] = useState<NeighborhoodPack | null>(null);
  const [savingCrm, setSavingCrm] = useState(false);
  const [activeTab, setActiveTab] = useState<NeighborhoodTabId>("overview");

  // -----------------------------------
  // Generate via /api/generate-intelligence
  // -----------------------------------
  async function handleGenerate() {
    if (!areaFocus.trim()) {
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
          areaFocus,
          context: contextNotes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "Failed to generate neighborhood snapshot."
        );
      }

      const data = await res.json();

      // Support shapes: { pack }, { neighborhood }, or raw object
      const nextPack: NeighborhoodPack = data.pack ?? data.neighborhood ?? data;

      setPack(nextPack);
      setOutput(nextPack);
    } catch (err: any) {
      console.error("Neighborhood engine error", err);
      setError(err?.message || "Something went wrong while generating.");
    } finally {
      setIsGenerating(false);
    }
  }

  // -----------------------------------
  // Save to CRM
  // -----------------------------------
  async function handleSaveToCrm() {
    if (!pack) return;

    setSavingCrm(true);
    try {
      await fetch("/api/crm/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "neighborhood",
          payload: pack,
        }),
      });
    } catch (err) {
      console.error("Failed to save neighborhood pack to CRM", err);
    } finally {
      setSavingCrm(false);
    }
  }

  // -----------------------------------
  // Render
  // -----------------------------------
  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* LEFT: INPUT CARD */}
      <div className="avillo-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--avillo-cream)]">
          Neighborhood Engine
        </h2>
        <p className="mb-4 text-xs text-[var(--avillo-cream-muted)]">
          Turn a ZIP code, city, or neighborhood into a simple lifestyle
          snapshot: schools, walk &amp; bike feel, safety context, essentials,
          and buyer-ready talking points.
        </p>

        <div className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Area focus
            </label>
            <input
              value={areaFocus}
              onChange={(e) => setAreaFocus(e.target.value)}
              placeholder="92626, Costa Mesa, or Eastside Costa Mesa…"
              className="avillo-input w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Context / client notes (optional)
            </label>
            <textarea
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              rows={4}
              placeholder="Buyer profile, price range, commute needs, lifestyle preferences…"
              className="avillo-textarea w-full"
            />
          </div>

          <p className="text-[11px] text-[var(--avillo-cream-muted)]">
            This is an AI-generated overview based on typical lifestyle patterns
            for the area, not official statistics. Always verify schools, crime,
            and zoning data before sharing with clients.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="avillo-btn mt-4 flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating
            ? "Generating neighborhood snapshot…"
            : "Generate snapshot"}
        </button>
      </div>

      {/* RIGHT: OUTPUT CARD WITH TABS (MATCHES LISTING STYLE) */}
      <div className="avillo-card flex flex-col p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              AI Output
            </p>
            <h3 className="text-sm font-semibold text-[var(--avillo-cream)]">
              Neighborhood canvas
            </h3>
          </div>

          <button
            type="button"
            onClick={handleSaveToCrm}
            disabled={savingCrm}
            className="avillo-btn-ghost text-[10px] uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingCrm ? "Saving…" : "Save to CRM"}
          </button>
        </div>

        {/* Tabs (same visual style as ListingOutputCanvas) */}
        <div className="avillo-pill-group mb-4 inline-flex flex-wrap gap-1">
          {NEIGHBORHOOD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                "avillo-pill" +
                (activeTab === tab.id ? " avillo-pill--active" : "")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content – rows ALWAYS rendered, placeholders until pack exists */}
        <div className="space-y-3 text-xs">
          {/* OVERVIEW TAB (includes buyer-ready talking points) */}
          {activeTab === "overview" && (
            <>
              <OutputBlock
                title="Area summary"
                helper="30-second lifestyle snapshot for buyers."
                value={pack?.overview?.areaSummary}
              />
              <OutputBlock
                title="Who this area fits"
                helper="Buyer profiles that tend to love this area."
                value={pack?.overview?.whoItFits}
              />
              <OutputBlock
                title="Price & housing vibe"
                helper="Typical price bands, housing stock, and competition feel."
                value={pack?.overview?.priceVibe}
              />
              <OutputBlock
                title="Buyer-ready talking points"
                helper="A short script you can reuse in tours and emails."
                value={
                  pack?.overview?.talkingPoints?.length
                    ? pack.overview.talkingPoints
                        .map((b) => `• ${b}`)
                        .join("\n")
                    : ""
                }
              />
            </>
          )}

          {/* SCHOOLS TAB */}
          {activeTab === "schools" && (
            <>
              <OutputBlock
                title="Schools overview"
                helper="Elementary, middle, and high school context. Always verify with official sources."
                value={pack?.schools?.schoolsOverview}
              />
              <OutputBlock
                title="Notable nearby schools"
                helper="Examples of schools buyers often ask about."
                value={pack?.schools?.notableSchools}
              />
              <OutputBlock
                title="Schools disclaimer"
                helper="Always point clients to official school and boundary resources."
                value={pack?.schools?.schoolsDisclaimer}
              />
            </>
          )}

          {/* MOBILITY TAB */}
          {activeTab === "mobility" && (
            <>
              <OutputBlock
                title="Walkability"
                helper="What daily life on foot usually feels like."
                value={pack?.mobility?.walkability}
              />
              <OutputBlock
                title="Bikeability"
                helper="Bike paths, terrain, and how bike-friendly the area feels."
                value={pack?.mobility?.bikeability}
              />
              <OutputBlock
                title="Transit overview"
                helper="High-level bus / rail context, if applicable."
                value={pack?.mobility?.transitOverview}
              />
              <OutputBlock
                title="Driving & freeway access"
                helper="Usual experience getting to main corridors."
                value={pack?.mobility?.drivingAccess}
              />
              <OutputBlock
                title="Airports & regional access"
                helper="Typical drive times to major airports or hubs."
                value={pack?.mobility?.airports}
              />
              <OutputBlock
                title="Commute examples"
                helper="Example commutes buyers might ask about."
                value={pack?.mobility?.commuteExamples}
              />
            </>
          )}

          {/* ESSENTIALS TAB */}
          {activeTab === "essentials" && (
            <>
              <OutputBlock
                title="Groceries & everyday shopping"
                helper="Nearby grocery stores and daily-errand staples."
                value={pack?.essentials?.groceries}
              />
              <OutputBlock
                title="Gyms & fitness"
                helper="Popular gyms, studios, and fitness options."
                value={pack?.essentials?.gyms}
              />
              <OutputBlock
                title="Errands & services"
                helper="Coffee, pharmacies, banks, and other common stops."
                value={pack?.essentials?.errands}
              />
              <OutputBlock
                title="Healthcare (optional)"
                helper="Clinics, hospitals, and common healthcare notes."
                value={pack?.essentials?.healthcare}
              />
            </>
          )}

          {/* LIFESTYLE TAB (talking points removed from here) */}
          {activeTab === "lifestyle" && (
            <>
              <OutputBlock
                title="Parks & outdoors"
                helper="Parks, trails, and outdoor feel."
                value={pack?.lifestyle?.parksAndOutdoors}
              />
              <OutputBlock
                title="Dining & nightlife"
                helper="Restaurant mix, nightlife, and food-scene vibe."
                value={pack?.lifestyle?.diningNightlife}
              />
              <OutputBlock
                title="Family activities"
                helper="Family-friendly attractions and weekend ideas."
                value={pack?.lifestyle?.familyActivities}
              />
              <OutputBlock
                title="Safety overview"
                helper="High-level lifestyle safety feel — not official crime data."
                value={pack?.lifestyle?.safetyOverview}
              />
              <OutputBlock
                title="Safety disclaimer"
                helper="Always point buyers to official crime maps and police resources."
                value={pack?.lifestyle?.safetyDisclaimer}
              />
            </>
          )}

          {/* Hint text (always visible) */}
          <p className="pt-2 text-[11px] text-[var(--avillo-cream-muted)]">
            Run the Neighborhood Engine to populate this canvas with an area
            overview you can reuse in emails, tours, and listing presentations.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------
  Small output block with unified copy state
----------------------------------- */

type OutputBlockProps = {
  title: string;
  value?: string | null;
  helper?: string;
};

function OutputBlock({ title, value, helper }: OutputBlockProps) {
  const [copied, setCopied] = useState(false);

  // Safely coerce to string so .trim() never fails
  const raw =
    typeof value === "string"
      ? value
      : value == null
      ? ""
      : String(value);

  const trimmed = raw.trim();
  const displayValue = trimmed.length > 0 ? trimmed : "—";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        displayValue === "—" ? "" : displayValue
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--avillo-border-subtle)] bg-[rgba(9,13,28,0.9)] px-4 py-3 text-xs">
      <div className="flex-1">
        <p className="mb-1 text-[11px] font-semibold text-[var(--avillo-cream-soft)]">
          {title}
        </p>
        {helper && (
          <p className="mb-1 text-[10px] text-[var(--avillo-cream-muted)]">
            {helper}
          </p>
        )}
        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--avillo-cream)]">
          {displayValue}
        </pre>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className={
          "avillo-chip mt-1 text-[10px] uppercase tracking-[0.16em] transition-colors" +
          (copied ? " avillo-chip--success" : "")
        }
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}