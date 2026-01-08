// src/app/(portal)/intelligence/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";

import ListingEngine from "@/components/intelligence/engines/ListingEngine";
import SellerEngine from "@/components/intelligence/engines/SellerEngine";
import BuyerEngine from "@/components/intelligence/engines/BuyerEngine";
import NeighborhoodEngine from "@/components/intelligence/engines/NeighborhoodEngine";

import OutputHistory, { OutputHistoryEntry } from "@/components/intelligence/OutputHistory";
import UpgradeModal from "@/components/billing/UpgradeModal";

import { ComplianceGuardBanner } from "@/components/intelligence/compliance-guard-banner";

type ActiveEngine = "listing" | "seller" | "buyer" | "neighborhood";
type EngineWire = ActiveEngine;

type EngineContextType = "none" | "listing" | "contact";

type EngineContext = {
  type: EngineContextType;
  id: string | null;
  label: string | null;
};

type ListingOption = { id: string; label: string };
type ContactOption = { id: string; name: string };

// ✅ compliance types (matches your API)
type ComplianceHit = { type: "HARD" | "SOFT"; match: string; rule: string };

// ✅ HARD-only guard state
type ComplianceGuardState = {
  error: string;
  hits: ComplianceHit[];
} | null;

export default function IntelligencePage() {
  const [activeEngine, setActiveEngine] = useState<ActiveEngine>("listing");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ HARD-only compliance banner state
  const [complianceGuard, setComplianceGuard] = useState<ComplianceGuardState>(null);

  const [engineContext, setEngineContext] = useState<EngineContext>({
    type: "none",
    id: null,
    label: null,
  });

  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // used to hydrate engines when a history card is clicked
  const [restoreRequest, setRestoreRequest] = useState<{
    engine: EngineWire;
    prompt: string;
  } | null>(null);

  // used to tell <OutputHistory> to re-fetch after a save
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Auto-clear restore to avoid infinite loop
  useEffect(() => {
    if (!restoreRequest) return;
    const t = setTimeout(() => setRestoreRequest(null), 250);
    return () => clearTimeout(t);
  }, [restoreRequest]);

  // When a history entry is clicked
  function handleHistorySelect(entry: OutputHistoryEntry) {
    if (!entry.engineSlug || entry.engineSlug === "unknown") return;
    if (!entry.prompt) return;

    setActiveEngine(entry.engineSlug as EngineWire);

    setRestoreRequest({
      engine: entry.engineSlug as EngineWire,
      prompt: entry.prompt.trim(),
    });

    // also update the context pill based on the entry’s context, if present
    if (entry.contextType && entry.contextType !== "none" && entry.contextLabel) {
      setEngineContext({
        type: entry.contextType,
        id: entry.contextId ?? null,
        label: entry.contextLabel,
      });
    } else {
      setEngineContext({ type: "none", id: null, label: null });
    }

    // ✅ if user is restoring, clear any old banner/errors
    setComplianceGuard(null);
    setError(null);
  }

  // called by engines after save-output succeeds
  function handleSavedRun() {
    setHistoryRefreshKey((k) => k + 1);
  }

  /* ------------------------------------
   * Load listings + contacts
   * -----------------------------------*/
  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        setOptionsLoading(true);

        const [listingsRes, contactsRes] = await Promise.all([
          fetch("/api/listings"),
          fetch("/api/crm/contacts"),
        ]);

        if (!listingsRes.ok) throw new Error("Failed to load listings.");
        if (!contactsRes.ok) throw new Error("Failed to load contacts.");

        const listingsData = await listingsRes.json();
        const contactsData = await contactsRes.json();
        if (cancelled) return;

        setListingOptions(
          (listingsData.listings ?? []).map((l: any) => ({
            id: l.id,
            label: l.address ?? "Unnamed listing",
          }))
        );

        setContactOptions(
          (contactsData.contacts ?? []).map((c: any) => ({
            id: c.id,
            name: c.name ?? "Unnamed contact",
          }))
        );
      } catch (err) {
        console.error("Intelligence loadOptions error", err);
        if (!cancelled) {
          setError(
            "We couldn’t load your listings/contacts for context. You can still generate outputs."
          );
        }
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------
   * Derived helpers
   * -----------------------------------*/
  const currentEngineLabel = useMemo(() => {
    switch (activeEngine) {
      case "listing":
        return "Listing Engine";
      case "seller":
        return "Seller Studio";
      case "buyer":
        return "Buyer Studio";
      case "neighborhood":
        return "Neighborhood Engine";
      default:
        return "Engine";
    }
  }, [activeEngine]);

  const allowListingContext =
    activeEngine === "listing" || activeEngine === "neighborhood";
  const allowContactContext =
    activeEngine === "seller" || activeEngine === "buyer";

  useEffect(() => {
    setEngineContext((prev) => {
      if (!allowListingContext && prev.type === "listing") {
        return { type: "none", id: null, label: null };
      }
      if (!allowContactContext && prev.type === "contact") {
        return { type: "none", id: null, label: null };
      }
      return prev;
    });
  }, [allowListingContext, allowContactContext]);

  // ✅ HARD-only handler passed into engines (422 responses)
  function handleComplianceGuard(payload: { error?: string; hits?: ComplianceHit[] }) {
    const hits = payload.hits ?? [];
    const hardHits = hits.filter((h) => h.type === "HARD");

    // ✅ Ignore SOFT completely
    if (hardHits.length === 0) return;

    setComplianceGuard({
      error:
        payload.error ||
        "We blocked this request due to protected-class targeting or steering language.",
      hits: hardHits,
    });

    // Keep the generic error bar clean
    setError(null);
  }

  function clearComplianceGuard() {
    setComplianceGuard(null);
  }

  /* ------------------------------------
   * Render
   * -----------------------------------*/
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AI Tools for Real Estate"
        title="Avillo AI Studio"
        subtitle="Turn messy notes into listing packs, seller scripts, buyer follow-ups, and neighborhood snapshots — built for fast iteration, reruns, and compliant output."
      />

      {/* ENGINE SELECTOR */}
      <EngineSelector
        activeEngine={activeEngine}
        setActiveEngine={(e) => {
          setActiveEngine(e);
          // ✅ switching engines clears old banner/errors
          setComplianceGuard(null);
          setError(null);
        }}
      />

      {/* CONTEXT STRIP */}
      <ContextStrip
        activeEngine={activeEngine}
        engineLabel={currentEngineLabel}
        engineContext={engineContext}
        setEngineContext={setEngineContext}
        listingOptions={listingOptions}
        contactOptions={contactOptions}
        allowListingContext={allowListingContext}
        allowContactContext={allowContactContext}
        optionsLoading={optionsLoading}
      />

      {/* ✅ HARD-only compliance banner */}
      {complianceGuard ? (
        <ComplianceGuardBanner
          error={complianceGuard.error}
          hits={complianceGuard.hits}
          onClose={clearComplianceGuard}
        />
      ) : null}

      {error && <div className="avillo-error-bar mt-1">{error}</div>}

      {/* ENGINES */}
      <section className="grid gap-7 lg:grid-cols-1">
        {activeEngine === "listing" && (
          <ListingEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={() => {}}
            setError={setError}
            restoreRequest={restoreRequest}
            contextType={engineContext.type}
            contextId={engineContext.id}
            onSavedRun={handleSavedRun}
            onComplianceGuard={handleComplianceGuard}
            clearComplianceGuard={clearComplianceGuard}
          />
        )}

        {activeEngine === "seller" && (
          <SellerEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={() => {}}
            setError={setError}
            restoreRequest={restoreRequest}
            contextType={engineContext.type}
            contextId={engineContext.id}
            onSavedRun={handleSavedRun}
            onComplianceGuard={handleComplianceGuard}
            clearComplianceGuard={clearComplianceGuard}
          />
        )}

        {activeEngine === "buyer" && (
          <BuyerEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={() => {}}
            setError={setError}
            restoreRequest={restoreRequest}
            contextType={engineContext.type}
            contextId={engineContext.id}
            onSavedRun={handleSavedRun}
            onComplianceGuard={handleComplianceGuard}
            clearComplianceGuard={clearComplianceGuard}
          />
        )}

        {activeEngine === "neighborhood" && (
          <NeighborhoodEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={() => {}}
            setError={setError}
            restoreRequest={restoreRequest}
            contextType={engineContext.type}
            contextId={engineContext.id}
            onSavedRun={handleSavedRun}
            onComplianceGuard={handleComplianceGuard}
            clearComplianceGuard={clearComplianceGuard}
          />
        )}
      </section>

      {/* DB-BACKED HISTORY */}
      <OutputHistory
        onSelectEntry={handleHistorySelect}
        refreshKey={historyRefreshKey}
      />
    </div>
  );
}

/* ------------------------------------
 * Engine Selector
 * -----------------------------------*/
function EngineSelector({
  activeEngine,
  setActiveEngine,
}: {
  activeEngine: ActiveEngine;
  setActiveEngine: (e: ActiveEngine) => void;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
        Engines
      </p>

      <div className="-mx-4 overflow-x-auto pb-3 sm:mx-0 sm:overflow-visible">
        <div className="flex gap-2 px-4 text-xs snap-x snap-mandatory sm:inline-flex sm:flex-wrap sm:px-0">
          <EnginePill
            label="Listing Engine"
            description="MLS, social, emails, talking points."
            active={activeEngine === "listing"}
            onClick={() => setActiveEngine("listing")}
          />
          <EnginePill
            label="Neighborhood Engine"
            description="Schools, lifestyle, access, talking points."
            active={activeEngine === "neighborhood"}
            onClick={() => setActiveEngine("neighborhood")}
          />
          <EnginePill
            label="Seller Studio"
            description="Prelistings, presentations, objections."
            active={activeEngine === "seller"}
            onClick={() => setActiveEngine("seller")}
          />
          <EnginePill
            label="Buyer Studio"
            description="Tours, summaries, offers, nurture."
            active={activeEngine === "buyer"}
            onClick={() => setActiveEngine("buyer")}
          />
          <div className="w-2 flex-shrink-0 sm:hidden" />
        </div>
      </div>
    </div>
  );
}

function EnginePill({
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
      className={[
        "inline-flex items-center rounded-full border px-4 py-2 text-left transition-all duration-200",
        "min-w-[78%] justify-between snap-center",
        "sm:min-w-[170px] sm:justify-start",
        active
          ? "border-[rgba(242,235,221,0.95)] bg-[rgba(242,235,221,0.10)] text-[var(--avillo-cream)] shadow-[0_0_0_1px_rgba(242,235,221,0.5),0_0_18px_rgba(242,235,221,0.65)]"
          : "border-[rgba(242,235,221,0.35)] text-[var(--avillo-cream-muted)] hover:bg-[rgba(242,235,221,0.06)]",
      ].join(" ")}
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

/* ------------------------------------
 * Context Strip
 * -----------------------------------*/
type AccountMe = {
  plan?: string | null;
  entitlements?: Record<string, any> | null;
  [key: string]: any;
};

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
  const can = ((account.entitlements as any)?.can ?? {}) as Record<string, boolean>;
  return Boolean(
    can.INTELLIGENCE_SAVE ||
    can.AUTOMATIONS_RUN ||
    can.AUTOMATIONS_PERSIST
  );
}

function ContextStrip({
  activeEngine,
  engineLabel,
  engineContext,
  setEngineContext,
  listingOptions,
  contactOptions,
  allowListingContext,
  allowContactContext,
  optionsLoading,
}: {
  activeEngine: ActiveEngine;
  engineLabel: string;
  engineContext: EngineContext;
  setEngineContext: (ctx: EngineContext) => void;
  listingOptions: ListingOption[];
  contactOptions: ContactOption[];
  allowListingContext: boolean;
  allowContactContext: boolean;
  optionsLoading: boolean;
}) {
  const [account, setAccount] = useState<AccountMe | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isPro = isProAccount(account);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
        setAccountLoading(true);
        const res = await fetch("/api/account/me");
        if (!res.ok) {
          if (!cancelled) setAccount(null);
          return;
        }
        const data = (await res.json().catch(() => null)) as AccountMe | null;
        if (!cancelled) setAccount(data);
      } catch {
        if (!cancelled) setAccount(null);
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  // Starter should never persist an attached record
  useEffect(() => {
    if (accountLoading) return;
    if (!isPro && engineContext.type !== "none") {
      setEngineContext({ type: "none", id: null, label: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, accountLoading]);

  const contextBadgeLabel =
    engineContext.type === "listing"
      ? "Attached to listing"
      : engineContext.type === "contact"
      ? "Attached to contact"
      : "Not attached yet";

  const contextBadgeDetail =
    engineContext.label && engineContext.type !== "none"
      ? engineContext.label
      : !isPro && !accountLoading
      ? "Upgrade to attach runs to a listing or contact."
      : allowListingContext
      ? "Choose a listing for this run."
      : allowContactContext
      ? "Choose a contact for this run."
      : "This engine doesn’t attach to records.";

  return (
    <>
      <section className="rounded-3xl border border-slate-800/80 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-slate-950/95 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,244,233,0.18),transparent_55%)] opacity-60 blur-3xl" />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Context for this run
            </p>

            <p className="text-[11px] text-[var(--avillo-cream-soft)] max-w-xl">
              Anchor your{" "}
              <span className="font-semibold text-[var(--avillo-cream)]">
                {engineLabel}
              </span>{" "}
              prompt to the right record.
            </p>

            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-[10px]">
              <span className="rounded-full border border-amber-100/60 bg-amber-50/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                {contextBadgeLabel}
              </span>
              <span className="truncate text-[var(--avillo-cream-soft)]">
                {contextBadgeDetail}
              </span>
            </div>

            {!accountLoading && !isPro && (
              <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                Starter can generate and copy outputs. Pro unlocks attaching runs to listings/contacts for better continuity.
              </p>
            )}
          </div>

          {/* Right */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {accountLoading ? (
              <div className="min-w-[240px] rounded-2xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                Checking plan…
              </div>
            ) : !isPro ? (
              <button
                type="button"
                onClick={() => setUpgradeOpen(true)}
                className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-50/20"
              >
                Upgrade to attach context
              </button>
            ) : (
              <>
                {allowListingContext && (
                  <div className="flex flex-col gap-1 min-w-[220px]">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                      Attach to listing
                    </label>
                    <select
                      value={
                        engineContext.type === "listing" && engineContext.id
                          ? engineContext.id
                          : ""
                      }
                      onChange={(e) => {
                        const id = e.target.value || null;
                        const label =
                          listingOptions.find((l) => l.id === id)?.label ?? null;

                        setEngineContext(
                          id
                            ? { type: "listing", id, label }
                            : { type: "none", id: null, label: null }
                        );
                      }}
                      disabled={optionsLoading}
                      className="rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-[11px] text-[var(--avillo-cream-soft)] outline-none focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
                    >
                      <option value="">No listing selected</option>
                      {listingOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {allowContactContext && (
                  <div className="flex flex-col gap-1 min-w-[220px]">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                      Attach to contact
                    </label>
                    <select
                      value={
                        engineContext.type === "contact" && engineContext.id
                          ? engineContext.id
                          : ""
                      }
                      onChange={(e) => {
                        const id = e.target.value || null;
                        const name =
                          contactOptions.find((c) => c.id === id)?.name ?? null;

                        setEngineContext(
                          id
                            ? { type: "contact", id, label: name }
                            : { type: "none", id: null, label: null }
                        );
                      }}
                      disabled={optionsLoading}
                      className="rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-[11px] text-[var(--avillo-cream-soft)] outline-none focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
                    >
                      <option value="">No contact selected</option>
                      {contactOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="Attach context"
        source="intelligence_context_strip"
      />
    </>
  );
}