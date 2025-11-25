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

/* ----------------------------------------
   Shared shell + row components
---------------------------------------- */

type OutputShellProps = {
  children: ReactNode;
  onSaveToCrm: () => void;
  savingCrm: boolean;
};

function OutputShell({ children, onSaveToCrm, savingCrm }: OutputShellProps) {
  return (
    <div className="avillo-card flex flex-col p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
            AI Output
          </p>
          <h3 className="text-sm font-semibold text-[var(--avillo-cream)]">
            Studio canvas
          </h3>
        </div>

        <button
          type="button"
          onClick={onSaveToCrm}
          disabled={savingCrm}
          className="avillo-btn-ghost text-[10px] uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingCrm ? "Saving…" : "Save to CRM"}
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
      // Reset label after a short delay
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
        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--avillo-cream)]">
          {displayValue}
        </pre>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className={
          "avillo-chip mt-1 text-[10px] uppercase tracking-[0.16em] transition-colors " +
          (copied ? "avillo-chip--success" : "")
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
  onSaveToCrm: () => void;
  savingCrm: boolean;
};

export function ListingOutputCanvas({
  pack,
  activeTab,
  setActiveTab,
  onSaveToCrm,
  savingCrm,
}: ListingOutputCanvasProps) {
  return (
    <OutputShell onSaveToCrm={onSaveToCrm} savingCrm={savingCrm}>
      {/* Tab pills */}
      <div className="avillo-pill-group mb-4 inline-flex flex-wrap gap-1">
        {LISTING_TABS.map((tab) => (
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

      {/* Tab content */}
      <div className="space-y-3 text-xs text-[var(--avillo-cream)]">
        {/* Listing copy */}
        {activeTab === "listing" && (
          <>
            <OutputRow title="Long MLS description" value={pack?.listing?.long} />
            <OutputRow title="Short description" value={pack?.listing?.short} />
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
            <OutputRow title="Seller email" value={pack?.emails?.seller_email} />
          </>
        )}

        {/* Talking points */}
        {activeTab === "talking" && (
          <>
            <OutputRow
              title="Seller highlights"
              value={
                pack?.talking_points?.highlights?.length
                  ? pack.talking_points.highlights.map((b) => `• ${b}`).join("\n")
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
                  ? pack.talking_points.responses.map((b) => `• ${b}`).join("\n")
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
          <p className="pt-2 text-[11px] text-[var(--avillo-cream-muted)]">
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
  onSaveToCrm: () => void;
  savingCrm: boolean;
};

export function SellerOutputCanvas({
  pack,
  activeTool,
  onSaveToCrm,
  savingCrm,
}: SellerOutputCanvasProps) {
  return (
    <OutputShell onSaveToCrm={onSaveToCrm} savingCrm={savingCrm}>
      <div className="space-y-3 text-xs text-[var(--avillo-cream)]">
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
          <p className="pt-2 text-[11px] text-[var(--avillo-cream-muted)]">
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
  onSaveToCrm: () => void;
  savingCrm: boolean;
};

export function BuyerOutputCanvas({
  pack,
  activeTool,
  onSaveToCrm,
  savingCrm,
}: BuyerOutputCanvasProps) {
  return (
    <OutputShell onSaveToCrm={onSaveToCrm} savingCrm={savingCrm}>
      <div className="space-y-3 text-xs text-[var(--avillo-cream)]">
        {activeTool === "search" && (
          <>
            <OutputRow
              title="Search recap email"
              value={pack?.search?.summary}
            />
            <OutputRow
              title="Recommended next steps"
              value={pack?.search?.nextSteps}
            />
            <OutputRow
              title="Text / DM follow-up"
              value={pack?.search?.smsFollowUp}
            />
          </>
        )}

        {activeTool === "tour" && (
          <>
            <OutputRow
              title="Tour follow-up email"
              value={pack?.tour?.recapEmail}
            />
            <OutputRow
              title="Highlights & standouts"
              value={pack?.tour?.highlights}
            />
            <OutputRow
              title="Concerns / open questions"
              value={pack?.tour?.concerns}
            />
          </>
        )}

        {activeTool === "offer" && (
          <>
            <OutputRow
              title="Offer-prep email"
              value={pack?.offer?.offerEmail}
            />
            <OutputRow
              title="Strategy summary"
              value={pack?.offer?.strategySummary}
            />
            <OutputRow
              title="Negotiation points"
              value={pack?.offer?.negotiationPoints}
            />
          </>
        )}

        {!pack && (
          <p className="pt-2 text-[11px] text-[var(--avillo-cream-muted)]">
            Run a Buyer Studio tool to populate this canvas with recaps, tour
            follow-ups, or offer strategy language.
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
  onSaveToCrm: () => void;
  savingCrm: boolean;
};

export function NeighborhoodOutputCanvas({
  pack,
  activeTab,
  setActiveTab,
  onSaveToCrm,
  savingCrm,
}: NeighborhoodOutputCanvasProps) {
  return (
    <OutputShell onSaveToCrm={onSaveToCrm} savingCrm={savingCrm}>
      {/* Tab pills */}
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

      {/* Tabbed content */}
      <div className="space-y-3 text-xs text-[var(--avillo-cream)]">
        {/* OVERVIEW TAB (includes buyer-ready talking points) */}
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
            <OutputRow title="Gyms & fitness" value={pack?.essentials?.gyms} />
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
          <p className="pt-2 text-[11px] text-[var(--avillo-cream-muted)]">
            Run the Neighborhood Engine to populate this canvas with an area
            overview you can reuse in emails, tours, and listing presentations.
          </p>
        )}
      </div>
    </OutputShell>
  );
}