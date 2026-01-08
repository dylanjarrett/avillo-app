// src/components/intelligence/OutputCard.tsx
"use client";

import React, { ReactNode, useEffect, useMemo, useState } from "react";
import UpgradeModal from "@/components/billing/UpgradeModal";
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
    recapEmail?: string;
    bulletSummary?: string;
    nextSteps?: string;
    smsFollowUp?: string;
    questionsToAsk?: string;
    summary?: string; // backwards-compat
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
  Shared helpers
---------------------------------------- */

type OutputRowModel = {
  id: string; // stable within the current canvas
  title: string;
  value?: string | null;
};

function cleanValue(v?: string | null) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > 0 ? t : "";
}

/**
 * Normalize a value that is "supposed" to be string[]
 * but might come back as a string (bullets/newlines) or undefined.
 */
function normalizeToStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
      .filter(Boolean);
  }

  if (typeof v === "string") {
    const raw = v.trim();
    if (!raw) return [];

    // Split on newlines; strip common bullet/number prefixes.
    return raw
      .split(/\r?\n+/)
      .map((s) => s.replace(/^(\s*[-•–—*]|\s*\d+[.)])\s+/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function toBulletedText(v: unknown) {
  const arr = normalizeToStringArray(v);
  return arr.length ? arr.map((b) => `• ${b}`).join("\n") : "";
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function buildCopyPayload(
  rows: OutputRowModel[],
  selected: Record<string, boolean>
) {
  const selectedRows = rows.filter((r) => selected[r.id]);

  const blocks = selectedRows.map((r) => {
    const body = cleanValue(r.value);
    return `${r.title}\n${body}`;
  });

  // Separate blocks with two newlines for readability when pasting into docs
  return blocks.join("\n\n");
}

/* ----------------------------------------
  Toolbar
---------------------------------------- */

function CopyToolbar({
  rows,
  selected,
  setSelected,
}: {
  rows: OutputRowModel[];
  selected: Record<string, boolean>;
  setSelected: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const selectableRows = useMemo(
    () => rows.filter((r) => cleanValue(r.value).length > 0),
    [rows]
  );

  const selectedCount = useMemo(() => {
    return selectableRows.reduce(
      (acc, r) => acc + (selected[r.id] ? 1 : 0),
      0
    );
  }, [selectableRows, selected]);

  const allSelected =
    selectableRows.length > 0 && selectedCount === selectableRows.length;

  const [copied, setCopied] = useState(false);

  async function handleCopySelected() {
    try {
      const payload = buildCopyPayload(selectableRows, selected);

      // Guard against empty payload
      if (!payload.trim()) return;

      await copyToClipboard(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error("Failed to copy selected outputs", err);
    }
  }

  function handleSelectAll() {
    setSelected((prev) => {
      const next = { ...prev };
      for (const r of selectableRows) next[r.id] = true;
      return next;
    });
  }

  function handleClear() {
    setSelected({});
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] text-slate-300/90">
        {selectedCount > 0 ? (
          <span>
            <span className="font-semibold text-slate-100">
              {selectedCount}
            </span>{" "}
            selected
          </span>
        ) : (
          <span>Select outputs to copy</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={allSelected ? handleClear : handleSelectAll}
          className="inline-flex items-center rounded-full border border-slate-600/80 bg-slate-950/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200 hover:border-amber-100/70 hover:text-amber-50"
        >
          {allSelected ? "Clear" : "Select all"}
        </button>

        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={handleCopySelected}
          className={
            "inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors " +
            (copied
              ? "border-emerald-300/80 bg-emerald-400/10 text-emerald-100"
              : selectedCount === 0
              ? "border-slate-700/70 bg-slate-900/40 text-slate-500 cursor-not-allowed"
              : "border-amber-100/70 bg-amber-50/10 text-amber-100 hover:bg-amber-50/20")
          }
        >
          {copied ? "Copied ✓" : "Copy selected"}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------
  Shell + Row components
---------------------------------------- */

type AccountMe = {
  plan?: string | null;
  entitlements?: Record<string, any> | null;
  [key: string]: any;
};

// --- Simple in-memory account cache to prevent UI flicker across remounts ---
let __accountCache: AccountMe | null | undefined = undefined;
let __accountCachePromise: Promise<AccountMe | null> | null = null;

async function getCachedAccount(): Promise<AccountMe | null> {
  if (__accountCache !== undefined) return __accountCache;

  if (!__accountCachePromise) {
    __accountCachePromise = fetch("/api/account/me")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as AccountMe | null;
      })
      .catch(() => null)
      .finally(() => {
        __accountCachePromise = null;
      });
  }

  __accountCache = await __accountCachePromise;
  return __accountCache;
}

function isProAccount(account: AccountMe | null): boolean {
  if (!account) return false;

  // 1) Support top-level plan (legacy / future-proof)
  const topLevelPlan = String(account.plan ?? "").toLowerCase();

  // 2) Source of truth: entitlements
  const entPlan = String((account.entitlements as any)?.plan ?? "").toLowerCase();
  const isPaidTier = Boolean((account.entitlements as any)?.isPaidTier);

  const plan = topLevelPlan || entPlan;

  if (plan === "pro" || plan === "founding_pro") return true;
  if (isPaidTier) return true;

  // 3) Fallback: capability-based gating
  const can = ((account.entitlements as any)?.can ?? {}) as Record<
    string,
    boolean
  >;
  return Boolean(
    can.INTELLIGENCE_SAVE || can.AUTOMATIONS_RUN || can.AUTOMATIONS_PERSIST
  );
}

type OutputShellProps = {
  children: ReactNode;
  onSaveOutput: () => void;
  savingOutput: boolean;
};

function OutputShell({ children, onSaveOutput, savingOutput }: OutputShellProps) {
  const [account, setAccount] = useState<AccountMe | null>(
    __accountCache !== undefined ? __accountCache : null
  );
  const [accountLoading, setAccountLoading] = useState<boolean>(
    __accountCache === undefined
  );

  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isPro = isProAccount(account);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      // If cache exists, no loading state (prevents glow-delay on remount)
      if (__accountCache !== undefined) {
        setAccount(__accountCache ?? null);
        setAccountLoading(false);
        return;
      }

      setAccountLoading(true);
      const data = await getCachedAccount();
      if (cancelled) return;

      setAccount(data);
      setAccountLoading(false);
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep label stable; only show (Pro) once we *know* they're not Pro
  const buttonLabel = isPro
    ? savingOutput
      ? "Saving…"
      : "Save Prompt"
    : accountLoading
    ? "Save Prompt"
    : "Save Prompt (Pro)";

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)]" />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
              AI Output
            </p>
            <h3 className="text-sm font-semibold text-slate-50">
              Studio canvas
            </h3>
          </div>

          <button
            type="button"
            onClick={() => {
              // Avoid flicker without showing "Checking plan…"
              if (accountLoading) return;

              if (!isPro) {
                setUpgradeOpen(true);
                return;
              }

              onSaveOutput();
            }}
            // NOTE: no disabled while loading so it looks steady,
            // but we still block click above while loading.
            disabled={isPro && savingOutput}
            className={
              "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors " +
              // IMPORTANT: while loading, render as Pro style to prevent “delayed glow”
              (isPro || accountLoading
                ? "border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(244,210,106,0.22)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
                : "border-slate-600/80 bg-slate-900/60 text-[var(--avillo-cream-soft)] hover:border-amber-100/60 hover:text-amber-50")
            }
          >
            {buttonLabel}
          </button>
        </div>

        {!isPro && !accountLoading && (
          <p className="mb-3 text-[10px] text-slate-300/90">
            Starter can generate and copy outputs. Pro unlocks saved prompts
            (history) for reruns and iteration.
          </p>
        )}

        {children}
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="Save prompts"
        source="output_card"
      />
    </>
  );
}

function OutputRow({
  title,
  value,
  checked,
  onToggle,
}: {
  title: string;
  value?: string | null;
  checked: boolean;
  onToggle: () => void;
}) {
  const displayValue = cleanValue(value) || "—";
  const disabled = displayValue === "—";

  return (
    <div
      onClick={!disabled ? onToggle : undefined}
      className={[
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs transition-colors",
        "border-slate-700/80 bg-slate-900/80",
        !disabled ? "cursor-pointer hover:border-amber-100/60" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // prevent double toggle
          onToggle();
        }}
        disabled={disabled}
        className={[
          "mt-1 inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
          disabled
            ? "border-slate-700/70 bg-slate-950/40 opacity-50 cursor-not-allowed"
            : checked
            ? "border-amber-100/80 bg-amber-50/15 shadow-[0_0_16px_rgba(248,250,252,0.18)]"
            : "border-slate-600/80 bg-slate-950/70 hover:border-amber-100/70",
        ].join(" ")}
        aria-label={checked ? "Deselect output" : "Select output"}
        title={
          disabled ? "No content to copy" : checked ? "Selected" : "Select to copy"
        }
      >
        {checked ? <span className="text-[10px] text-amber-100">✓</span> : null}
      </button>

      <div className="flex-1">
        <p className="mb-1 text-[11px] font-semibold text-slate-50">{title}</p>
        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-100/90">
          {displayValue}
        </pre>
      </div>
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
  const rows: OutputRowModel[] = useMemo(() => {
    if (activeTab === "listing") {
      return [
        {
          id: "listing.long",
          title: "Long MLS description",
          value: pack?.listing?.long,
        },
        {
          id: "listing.short",
          title: "Short description",
          value: pack?.listing?.short,
        },
        {
          id: "listing.bullets",
          title: "Feature bullets",
          value: toBulletedText(pack?.listing?.bullets),
        },
      ];
    }

    if (activeTab === "social") {
      return [
        {
          id: "social.ig",
          title: "Instagram caption",
          value: pack?.social?.instagram_caption,
        },
        {
          id: "social.fb",
          title: "Facebook post",
          value: pack?.social?.facebook_post,
        },
        {
          id: "social.li",
          title: "LinkedIn post",
          value: pack?.social?.linkedin_post,
        },
        { id: "social.ttHook", title: "TikTok hook", value: pack?.social?.tiktok_hook },
        {
          id: "social.ttScript",
          title: "TikTok script",
          value: pack?.social?.tiktok_script,
        },
      ];
    }

    if (activeTab === "emails") {
      return [
        { id: "emails.buyer", title: "Buyer email", value: pack?.emails?.buyer_email },
        { id: "emails.seller", title: "Seller email", value: pack?.emails?.seller_email },
      ];
    }

    if (activeTab === "talking") {
      return [
        {
          id: "talking.highlights",
          title: "Seller highlights",
          value: toBulletedText(pack?.talking_points?.highlights),
        },
        {
          id: "talking.concerns",
          title: "Buyer concerns",
          value: toBulletedText(pack?.talking_points?.buyer_concerns),
        },
        {
          id: "talking.responses",
          title: "Suggested responses",
          value: toBulletedText(pack?.talking_points?.responses),
        },
      ];
    }

    if (activeTab === "insights") {
      return [
        {
          id: "insights.score",
          title: "Marketability score (1–10)",
          value:
            pack?.marketability?.score_1_to_10 != null
              ? String(pack.marketability.score_1_to_10)
              : "",
        },
        {
          id: "insights.summary",
          title: "Marketability summary",
          value: pack?.marketability?.summary,
        },
        {
          id: "insights.improvements",
          title: "Improvement suggestions",
          value: toBulletedText(pack?.marketability?.improvement_suggestions),
        },
      ];
    }

    // pitch
    return [{ id: "pitch", title: "Open-house pitch", value: pack?.open_house_pitch }];
  }, [activeTab, pack]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Reset selection when tab/pack changes to prevent cross-tab surprises
  useEffect(() => {
    setSelected({});
  }, [activeTab]);

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

      <CopyToolbar rows={rows} selected={selected} setSelected={setSelected} />

      <div className="space-y-3 text-xs text-slate-100/90">
        {rows.map((r) => (
          <OutputRow
            key={r.id}
            title={r.title}
            value={r.value}
            checked={!!selected[r.id]}
            onToggle={() =>
              setSelected((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
            }
          />
        ))}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run the Listing Engine to populate this canvas with MLS copy, social content,
            emails, and talking points.
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
  const rows: OutputRowModel[] = useMemo(() => {
    if (activeTool === "prelisting") {
      return [
        { id: "prelisting.email1", title: "Email 1", value: pack?.prelisting?.email1 },
        { id: "prelisting.email2", title: "Email 2", value: pack?.prelisting?.email2 },
        { id: "prelisting.email3", title: "Email 3", value: pack?.prelisting?.email3 },
      ];
    }

    if (activeTool === "presentation") {
      return [
        { id: "presentation.opening", title: "Opening & rapport", value: pack?.presentation?.opening },
        { id: "presentation.questions", title: "Questions to ask them", value: pack?.presentation?.questions },
        { id: "presentation.story", title: "Property & neighborhood story", value: pack?.presentation?.story },
        { id: "presentation.pricing", title: "Pricing strategy", value: pack?.presentation?.pricing },
        { id: "presentation.marketing", title: "Marketing plan", value: pack?.presentation?.marketing },
        { id: "presentation.process", title: "Process & timeline", value: pack?.presentation?.process },
        { id: "presentation.value", title: "Your value", value: pack?.presentation?.value },
        { id: "presentation.nextSteps", title: "Next steps", value: pack?.presentation?.nextSteps },
      ];
    }

    // objection
    return [
      { id: "objection.talkTrack", title: "Live talk track", value: pack?.objection?.talkTrack },
      { id: "objection.smsReply", title: "Text message reply", value: pack?.objection?.smsReply },
      { id: "objection.emailFollowUp", title: "Email follow-up", value: pack?.objection?.emailFollowUp },
    ];
  }, [activeTool, pack]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelected({});
  }, [activeTool]);

  return (
    <OutputShell onSaveOutput={onSaveOutput} savingOutput={savingOutput}>
      <CopyToolbar rows={rows} selected={selected} setSelected={setSelected} />

      <div className="space-y-3 text-xs text-slate-100/90">
        {rows.map((r) => (
          <OutputRow
            key={r.id}
            title={r.title}
            value={r.value}
            checked={!!selected[r.id]}
            onToggle={() =>
              setSelected((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
            }
          />
        ))}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run a Seller Studio tool to populate this canvas with emails, presentation
            talking points, or objection scripts.
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

  const rows: OutputRowModel[] = useMemo(() => {
    if (activeTool === "search") {
      return [
        { id: "search.recapEmail", title: "Search recap email", value: search?.recapEmail ?? search?.summary },
        { id: "search.bulletSummary", title: "Snapshot of criteria", value: search?.bulletSummary },
        { id: "search.nextSteps", title: "Recommended next steps", value: search?.nextSteps },
        { id: "search.smsFollowUp", title: "Text / DM follow-up", value: search?.smsFollowUp },
        { id: "search.questionsToAsk", title: "Questions for next check-in", value: search?.questionsToAsk },
      ];
    }

    if (activeTool === "tour") {
      return [
        { id: "tour.recapEmail", title: "Tour follow-up email", value: tour?.recapEmail },
        { id: "tour.highlights", title: "Highlights & standouts", value: tour?.highlights },
        { id: "tour.concerns", title: "Concerns / open questions", value: tour?.concerns },
        { id: "tour.decisionFrame", title: "Decision framing", value: tour?.decisionFrame },
        { id: "tour.nextSteps", title: "Next steps", value: tour?.nextSteps },
      ];
    }

    // offer
    return [
      { id: "offer.offerEmail", title: "Offer-prep email", value: offer?.offerEmail },
      { id: "offer.strategySummary", title: "Strategy summary", value: offer?.strategySummary },
      { id: "offer.negotiationPoints", title: "Negotiation points", value: offer?.negotiationPoints },
      { id: "offer.riskNotes", title: "Risk & contingency notes", value: offer?.riskNotes },
      { id: "offer.smsUpdate", title: "Quick SMS / DM update", value: offer?.smsUpdate },
    ];
  }, [activeTool, offer, search, tour]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelected({});
  }, [activeTool]);

  return (
    <OutputShell onSaveOutput={onSaveOutput} savingOutput={savingOutput}>
      <CopyToolbar rows={rows} selected={selected} setSelected={setSelected} />

      <div className="space-y-3 text-xs text-slate-100/90">
        {rows.map((r) => (
          <OutputRow
            key={r.id}
            title={r.title}
            value={r.value}
            checked={!!selected[r.id]}
            onToggle={() =>
              setSelected((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
            }
          />
        ))}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run a Buyer Studio tool to populate this canvas with search recaps, tour follow-ups,
            and offer strategy language you can reuse across email, text, and calls.
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
  const rows: OutputRowModel[] = useMemo(() => {
    if (activeTab === "overview") {
      return [
        { id: "overview.areaSummary", title: "Area summary", value: pack?.overview?.areaSummary },
        { id: "overview.whoItFits", title: "Who this area fits", value: pack?.overview?.whoItFits },
        { id: "overview.priceVibe", title: "Price & housing vibe", value: pack?.overview?.priceVibe },
        {
          id: "overview.talkingPoints",
          title: "Buyer-ready talking points",
          value: toBulletedText(pack?.overview?.talkingPoints),
        },
      ];
    }

    if (activeTab === "schools") {
      return [
        { id: "schools.overview", title: "Schools overview", value: pack?.schools?.schoolsOverview },
        { id: "schools.notable", title: "Notable schools", value: pack?.schools?.notableSchools },
        { id: "schools.disclaimer", title: "Schools disclaimer", value: pack?.schools?.schoolsDisclaimer },
      ];
    }

    if (activeTab === "mobility") {
      return [
        { id: "mobility.walkability", title: "Walkability", value: pack?.mobility?.walkability },
        { id: "mobility.bikeability", title: "Bikeability", value: pack?.mobility?.bikeability },
        { id: "mobility.transit", title: "Transit overview", value: pack?.mobility?.transitOverview },
        { id: "mobility.driving", title: "Driving access", value: pack?.mobility?.drivingAccess },
        { id: "mobility.airports", title: "Airports", value: pack?.mobility?.airports },
        { id: "mobility.commute", title: "Commute examples", value: pack?.mobility?.commuteExamples },
      ];
    }

    if (activeTab === "essentials") {
      return [
        { id: "essentials.groceries", title: "Groceries & essentials", value: pack?.essentials?.groceries },
        { id: "essentials.gyms", title: "Gyms & fitness", value: pack?.essentials?.gyms },
        { id: "essentials.errands", title: "Daily errands", value: pack?.essentials?.errands },
        { id: "essentials.healthcare", title: "Healthcare options", value: pack?.essentials?.healthcare },
      ];
    }

    // lifestyle
    return [
      { id: "lifestyle.parks", title: "Parks & outdoors", value: pack?.lifestyle?.parksAndOutdoors },
      { id: "lifestyle.dining", title: "Dining & nightlife", value: pack?.lifestyle?.diningNightlife },
      { id: "lifestyle.family", title: "Family activities", value: pack?.lifestyle?.familyActivities },
      { id: "lifestyle.safety", title: "Safety overview", value: pack?.lifestyle?.safetyOverview },
      { id: "lifestyle.disclaimer", title: "Safety disclaimer", value: pack?.lifestyle?.safetyDisclaimer },
    ];
  }, [activeTab, pack]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelected({});
  }, [activeTab]);

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

      <CopyToolbar rows={rows} selected={selected} setSelected={setSelected} />

      <div className="space-y-3 text-xs text-slate-100/90">
        {rows.map((r) => (
          <OutputRow
            key={r.id}
            title={r.title}
            value={r.value}
            checked={!!selected[r.id]}
            onToggle={() =>
              setSelected((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
            }
          />
        ))}

        {!pack && (
          <p className="pt-2 text-[11px] text-slate-300/90">
            Run the Neighborhood Engine to populate this canvas with an area overview you can reuse
            in emails, tours, and listing presentations.
          </p>
        )}
      </div>
    </OutputShell>
  );
}