// src/components/intelligence/OutputCard.tsx
"use client";

import React, { ReactNode, useState } from "react";
import type {
  IntelligencePack,
  ListingTabId,
  NeighborhoodTabId,
  NeighborhoodPack,
} from "@/lib/intelligence";

/* ----------------------------------------
  Local Seller / Buyer types
  (match engine files)
---------------------------------------- */

export type SellerToolId = "prelisting" | "presentation" | "objection";

export type SellerPack = {
  prelisting?: {
    email1?: string;
    email2?: string;
    email3?: string;
  };
  presentation?: {
    opening?: string;
    questions?: string;
    story?: string;
    pricing?: string;
    marketing?: string;
    process?: string;
    value?: string;
    nextSteps?: string;
  };
  objection?: {
    talkTrack?: string;
    smsReply?: string;
    emailFollowUp?: string;
  };
};

export type BuyerToolId = "search" | "tour" | "offer";

export type BuyerPack = {
  search?: {
    // NEW richer fields
    recapEmail?: string;
    bulletSummary?: string;
    nextSteps?: string;
    smsFollowUp?: string;
    questionsToAsk?: string;

    // backwards-compat
    summary?: string;
  };
  tour?: {
    recapEmail?: string;
    highlights?: string;
    concerns?: string;
    decisionFrame?: string;
    nextSteps?: string;
  };
  offer?: {
    offerEmail?: string;
    strategySummary?: string;
    negotiationPoints?: string;
    riskNotes?: string;
    smsUpdate?: string;
  };
};

/* ----------------------------------------
  Shared shell + row components
---------------------------------------- */

type OutputShellProps = {
  children: ReactNode;
  onSaveOutput: () => void;
  savingOutput: boolean;
};

function OutputShell({ children, onSaveOutput, savingOutput }: OutputShellProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
      {/* subtle glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)]" />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
            AI Output
          </p>
          <h3 className="text-sm font-semibold text-slate-50">Studio canvas</h3>
        </div>

        <button
          type="button"
          onClick={onSaveOutput}
          disabled={savingOutput}
          className="inline-flex items-center rounded-full border border-amber-100/70 bg-amber-50/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingOutput ? "Saving…" : "Save output"}
        </button>
      </div>

      {children}
    </div>
  );
}

type OutputRowProps = {
  title: string;
  value?: string | null;
};

function OutputRow({ title, value }: OutputRowProps) {
  const [copied, setCopied] = useState(false);

  const displayValue =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : "—";

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
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-xs">
      <div className="flex-1">
        <p className="mb-1 text-[11px] font-semibold text-slate-50">
          {title}
        </p>
        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-100/90">
          {displayValue}
        </pre>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className={
          "mt-1 inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors " +
          (copied
            ? "border-emerald-300/80 bg-emerald-400/10 text-emerald-100"
            : "border-slate-600/80 bg-slate-950/80 text-slate-200 hover:border-amber-100/70 hover:text-amber-50")
        }
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

/* ----------------------------------------
  LISTING OUTPUT CANVAS
---------------------------------------- */

const LISTING_TABS: { id: ListingTabId; label: string }[] = [
  { id: "listing", label: "Listing copy" },
  { id: "social", label: "Social kit" },
  { id: "emails", label: "Emails" },
  { id: "talking", label: "Talking points" },
  { id: "insights", label: "Insights" },
  { id: "pitch", label: "Open-house pitch" },
];

type ListingOutputCanvasProps = {
  pack: IntelligencePack | null;
  activeTab: ListingTabId;
  setActiveTab: (tab: ListingTabId) => void;
  onSaveOutput: () => void;
  savingOutput: boolean;
};

export function ListingOutputCanvas({
  pack,
  activeTab,
  setActiveTab,
  onSaveOutput,
  savingOutput,
}: ListingOutputCanvasProps) {
  return (
    <OutputShell onSaveOutput={onSaveOutput} savingOutput={savingOutput}>
      {/* Tab pills */}
      <div className="mb-4 inline-flex flex-wrap gap-1 text-xs">
        {LISTING_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors " +
              (activeTab === tab.id
                ? "border-amber-100/80 bg-amber-50/10 text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.35)]"
                : "border-slate-700/70 bg-slate-950/40 text-slate-300/90 hover:border-amber-100/60 hover:text-amber-50")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-3 text-xs text-slate-100/90">
        {/* Listing copy */}
        {activeTab === "listing" && (
          <>
            <OutputRow
              title="Long MLS description"
              value={pack?.listing?.long}
            />
            <OutputRow
              title="Short description"
              value={pack?.listing?.short}
            />
            <OutputRow
              title="Feature bullets"
              value={
                pack?.listing?.bullets?.length
                  ? pack.listing.bullets.map((b) => `• ${b}`).join("\n")
                  : ""
              }
            />
          </>
        )}

        {/* Social kit */}
        {activeTab === "social" && (
          <>
            <OutputRow
              title="Instagram caption"
              value={pack?.social?.instagram_caption}
            />
            <OutputRow
              title="Facebook post"
              value={pack?.social?.facebook_post}
            />
            <OutputRow
              title="LinkedIn post"
              value={pack?.social?.linkedin_post}
            />
            <OutputRow title="TikTok hook" value={pack?.social?.tiktok_hook} />
            <OutputRow
              title="TikTok script"
              value={pack?.social?.tiktok_script}
            />
          </>
        )}

        {/* Emails */}
        {activeTab === "emails" && (
          <>
            <OutputRow title="Buyer email" value={pack?.emails?.buyer_email} />
            <OutputRow
              title="Seller email"
              value={pack?.emails?.seller_email}
            />
          </>
        )}

        {/* Talking points */}
        {activeTab === "talking" && (
          <>
            <OutputRow
              title="Seller highlights"
              value={
                pack?.talking_points?.highlights?.length
                  ? pack.talking_points.highlights
                      .map((b) => `• ${b}`)
                      .join("\n")
                  : ""
              }
            />
            <OutputRow
              title="Buyer concerns"
              value={
                pack?.talking_points?.buyer_concerns?.length
                  ? pack.talking_points.buyer_concerns
                      .map((b) => `• ${b}`)
                      .join("\n")
                  : ""
              }
            />
            <OutputRow
              title="Suggested responses"
              value={
                pack?.talking_points?.responses?.length
                  ? pack.talking_points.responses
                      .map((b) => `• ${b}`)
                      .join("\n")
                  : ""
              }
            />
          </>
        )}

        {/* Insights */}
        {activeTab === "insights" && (
          <>
            <OutputRow
              title="Marketability score (1–10)"
              value={
                pack?.marketability?.score_1_to_10 != null
                  ? String(pack.marketability.score_1_to_10)
                  : ""
              }
            />
            <OutputRow
              title="Marketability summary"
              value={pack?.marketability?.summary}
            />
            <OutputRow
              title="Improvement suggestions"
              value={
                pack?.marketability?.improvement_suggestions?.length
                  ? pack.marketability.improvement_suggestions
                      .map((b) => `• ${b}`)
                      .join("\n")
                  : ""
              }
            />
          </>
        )}

        {/* Open-house pitch */}
        {activeTab === "pitch" && (
          <OutputRow
            title="Open-house pitch"
            value={pack?.open_house_pitch}
          />
        )}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run the Listing Engine to populate this canvas with MLS copy, social
            content, emails, and talking points.
          </p>
        )}
      </div>
    </OutputShell>
  );
}

/* ----------------------------------------
  SELLER OUTPUT CANVAS
---------------------------------------- */

type SellerOutputCanvasProps = {
  pack: SellerPack | null;
  activeTool: SellerToolId;
  onSaveOutput: () => void;
  savingOutput: boolean;
};

export function SellerOutputCanvas({
  pack,
  activeTool,
  onSaveOutput,
  savingOutput,
}: SellerOutputCanvasProps) {
  return (
    <OutputShell onSaveOutput={onSaveOutput} savingOutput={savingOutput}>
      <div className="space-y-3 text-xs text-slate-100/90">
        {activeTool === "prelisting" && (
          <>
            <OutputRow title="Email 1" value={pack?.prelisting?.email1} />
            <OutputRow title="Email 2" value={pack?.prelisting?.email2} />
            <OutputRow title="Email 3" value={pack?.prelisting?.email3} />
          </>
        )}

        {activeTool === "presentation" && (
          <>
            <OutputRow
              title="Opening & rapport"
              value={pack?.presentation?.opening}
            />
            <OutputRow
              title="Questions to ask them"
              value={pack?.presentation?.questions}
            />
            <OutputRow
              title="Property & neighborhood story"
              value={pack?.presentation?.story}
            />
            <OutputRow
              title="Pricing strategy"
              value={pack?.presentation?.pricing}
            />
            <OutputRow
              title="Marketing plan"
              value={pack?.presentation?.marketing}
            />
            <OutputRow
              title="Process & timeline"
              value={pack?.presentation?.process}
            />
            <OutputRow title="Your value" value={pack?.presentation?.value} />
            <OutputRow
              title="Next steps"
              value={pack?.presentation?.nextSteps}
            />
          </>
        )}

        {activeTool === "objection" && (
          <>
            <OutputRow
              title="Live talk track"
              value={pack?.objection?.talkTrack}
            />
            <OutputRow
              title="Text message reply"
              value={pack?.objection?.smsReply}
            />
            <OutputRow
              title="Email follow-up"
              value={pack?.objection?.emailFollowUp}
            />
          </>
        )}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run a Seller Studio tool to populate this canvas with emails,
            presentation talking points, or objection scripts.
          </p>
        )}
      </div>
    </OutputShell>
  );
}

/* ----------------------------------------
  BUYER OUTPUT CANVAS
---------------------------------------- */

type BuyerOutputCanvasProps = {
  pack: BuyerPack | null;
  activeTool: BuyerToolId;
  onSaveOutput: () => void;
  savingOutput: boolean;
};

export function BuyerOutputCanvas({
  pack,
  activeTool,
  onSaveOutput,
  savingOutput,
}: BuyerOutputCanvasProps) {
  const search = pack?.search;
  const tour = pack?.tour;
  const offer = pack?.offer;

  return (
    <OutputShell onSaveOutput={onSaveOutput} savingOutput={savingOutput}>
      <div className="space-y-3 text-xs text-slate-100/90">
        {/* SEARCH RECAP */}
        {activeTool === "search" && (
          <>
            <OutputRow
              title="Search recap email"
              value={search?.recapEmail ?? search?.summary}
            />
            <OutputRow
              title="Snapshot of criteria"
              value={search?.bulletSummary}
            />
            <OutputRow
              title="Recommended next steps"
              value={search?.nextSteps}
            />
            <OutputRow
              title="Text / DM follow-up"
              value={search?.smsFollowUp}
            />
            <OutputRow
              title="Questions for next check-in"
              value={search?.questionsToAsk}
            />
          </>
        )}

        {/* TOUR FOLLOW-UP */}
        {activeTool === "tour" && (
          <>
            <OutputRow
              title="Tour follow-up email"
              value={tour?.recapEmail}
            />
            <OutputRow
              title="Highlights & standouts"
              value={tour?.highlights}
            />
            <OutputRow
              title="Concerns / open questions"
              value={tour?.concerns}
            />
            <OutputRow
              title="Decision framing"
              value={tour?.decisionFrame}
            />
            <OutputRow title="Next steps" value={tour?.nextSteps} />
          </>
        )}

        {/* OFFER STRATEGY */}
        {activeTool === "offer" && (
          <>
            <OutputRow
              title="Offer-prep email"
              value={offer?.offerEmail}
            />
            <OutputRow
              title="Strategy summary"
              value={offer?.strategySummary}
            />
            <OutputRow
              title="Negotiation points"
              value={offer?.negotiationPoints}
            />
            <OutputRow
              title="Risk & contingency notes"
              value={offer?.riskNotes}
            />
            <OutputRow
              title="Quick SMS / DM update"
              value={offer?.smsUpdate}
            />
          </>
        )}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run a Buyer Studio tool to populate this canvas with search recaps,
            tour follow-ups, and offer strategy language you can reuse across
            email, text, and calls.
          </p>
        )}
      </div>
    </OutputShell>
  );
}

/* ----------------------------------------
  NEIGHBORHOOD OUTPUT CANVAS
---------------------------------------- */

const NEIGHBORHOOD_TABS: { id: NeighborhoodTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "schools", label: "Schools" },
  { id: "mobility", label: "Mobility & commute" },
  { id: "essentials", label: "Essentials" },
  { id: "lifestyle", label: "Lifestyle & safety" },
];

type NeighborhoodOutputCanvasProps = {
  pack: NeighborhoodPack | null;
  activeTab: NeighborhoodTabId;
  setActiveTab: (tab: NeighborhoodTabId) => void;
  onSaveOutput: () => void;
  savingOutput: boolean;
};

export function NeighborhoodOutputCanvas({
  pack,
  activeTab,
  setActiveTab,
  onSaveOutput,
  savingOutput,
}: NeighborhoodOutputCanvasProps) {
  return (
    <OutputShell onSaveOutput={onSaveOutput} savingOutput={savingOutput}>
      {/* Tab pills */}
      <div className="mb-4 inline-flex flex-wrap gap-1 text-xs">
        {NEIGHBORHOOD_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors " +
              (activeTab === tab.id
                ? "border-amber-100/80 bg-amber-50/10 text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.35)]"
                : "border-slate-700/70 bg-slate-950/40 text-slate-300/90 hover:border-amber-100/60 hover:text-amber-50")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabbed content */}
      <div className="space-y-3 text-xs text-slate-100/90">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <>
            <OutputRow
              title="Area summary"
              value={pack?.overview?.areaSummary}
            />
            <OutputRow
              title="Who this area fits"
              value={pack?.overview?.whoItFits}
            />
            <OutputRow
              title="Price & housing vibe"
              value={pack?.overview?.priceVibe}
            />
            <OutputRow
              title="Buyer-ready talking points"
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
            <OutputRow
              title="Schools overview"
              value={pack?.schools?.schoolsOverview}
            />
            <OutputRow
              title="Notable schools"
              value={pack?.schools?.notableSchools}
            />
            <OutputRow
              title="Schools disclaimer"
              value={pack?.schools?.schoolsDisclaimer}
            />
          </>
        )}

        {/* MOBILITY TAB */}
        {activeTab === "mobility" && (
          <>
            <OutputRow
              title="Walkability"
              value={pack?.mobility?.walkability}
            />
            <OutputRow
              title="Bikeability"
              value={pack?.mobility?.bikeability}
            />
            <OutputRow
              title="Transit overview"
              value={pack?.mobility?.transitOverview}
            />
            <OutputRow
              title="Driving access"
              value={pack?.mobility?.drivingAccess}
            />
            <OutputRow title="Airports" value={pack?.mobility?.airports} />
            <OutputRow
              title="Commute examples"
              value={pack?.mobility?.commuteExamples}
            />
          </>
        )}

        {/* ESSENTIALS TAB */}
        {activeTab === "essentials" && (
          <>
            <OutputRow
              title="Groceries & essentials"
              value={pack?.essentials?.groceries}
            />
            <OutputRow
              title="Gyms & fitness"
              value={pack?.essentials?.gyms}
            />
            <OutputRow
              title="Daily errands"
              value={pack?.essentials?.errands}
            />
            <OutputRow
              title="Healthcare options"
              value={pack?.essentials?.healthcare}
            />
          </>
        )}

        {/* LIFESTYLE TAB */}
        {activeTab === "lifestyle" && (
          <>
            <OutputRow
              title="Parks & outdoors"
              value={pack?.lifestyle?.parksAndOutdoors}
            />
            <OutputRow
              title="Dining & nightlife"
              value={pack?.lifestyle?.diningNightlife}
            />
            <OutputRow
              title="Family activities"
              value={pack?.lifestyle?.familyActivities}
            />
            <OutputRow
              title="Safety overview"
              value={pack?.lifestyle?.safetyOverview}
            />
            <OutputRow
              title="Safety disclaimer"
              value={pack?.lifestyle?.safetyDisclaimer}
            />
          </>
        )}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run the Neighborhood Engine to populate this canvas with an area
            overview you can reuse in emails, tours, and listing presentations.
          </p>
        )}
      </div>
    </OutputShell>
  );
}