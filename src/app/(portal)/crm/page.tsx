// src/app/(portal)/crm/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";

/* ------------------------------------
 * Types
 * -----------------------------------*/

type Stage = "new" | "warm" | "hot" | "past";
type StageFilter = "active" | "new" | "warm" | "hot" | "past";

type Contact = {
  id: string;
  name: string;
  label?: string; // e.g. "potential buy"
  stage: Stage;
  type: "Buyer" | "Seller" | "Past / sphere";
  priceRange: string;
  areas: string;
  timeline: string;
  source: string;

  // Detail-side fields
  email?: string;
  phone?: string;
  nextTouchDate?: string;
  lastTouchNote?: string;
  workingNotes?: string;
};

/* ------------------------------------
 * Mock contacts (for now)
 * -----------------------------------*/

const CONTACTS: Contact[] = [
  {
    id: "1",
    name: "Alex",
    label: "potential buy",
    stage: "warm",
    type: "Buyer",
    priceRange: "Buyer $650K–$750K",
    areas: "Mission Valley, North Park",
    timeline: "3–6 months",
    source: "Portal inquiry",
    email: "alex@example.com",
    phone: "(555) 123-4567",
    nextTouchDate: "Today",
    lastTouchNote: "Asked about HOA fees + walkability.",
    workingNotes:
      "Send curated condos under $750K with strong amenities. Intro email on how you work + next steps.",
  },
  {
    id: "2",
    name: "Martins",
    label: "selling",
    stage: "hot",
    type: "Seller",
    priceRange: "Seller $1.4M–$1.6M",
    areas: "La Jolla",
    timeline: "0–60 days",
    source: "Open house",
    email: "martin.family@example.com",
    phone: "(555) 987-6543",
    nextTouchDate: "Tomorrow",
    lastTouchNote: "Tour went well, they’re comparing agents.",
    workingNotes:
      "Send short market update + pricing guidance. Prep listing presentation with comps + timing options.",
  },
  {
    id: "3",
    name: "Jordan & Taylor",
    label: "past clients",
    stage: "past",
    type: "Past / sphere",
    priceRange: "Closed at $925K",
    areas: "Clairemont",
    timeline: "Closed 2023",
    source: "Referral",
    email: "jordan.taylor@example.com",
    phone: "(555) 111-2222",
    nextTouchDate: "Next month",
    lastTouchNote: "Sent annual value update, they loved it.",
    workingNotes:
      "Great referral source. Add to quarterly check-ins + invite to client appreciation event.",
  },
];

/* ------------------------------------
 * Page
 * -----------------------------------*/

export default function CrmPage() {
  const [stageFilter, setStageFilter] = useState<StageFilter>("active");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    CONTACTS[0]?.id ?? null
  );

  const filteredContacts = useMemo(() => {
    return CONTACTS.filter((contact) => {
      // Stage filter
      if (stageFilter === "active" && contact.stage === "past") return false;
      if (stageFilter !== "active" && stageFilter !== contact.stage) return false;

      // Search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        contact.name.toLowerCase().includes(q) ||
        contact.areas.toLowerCase().includes(q) ||
        contact.priceRange.toLowerCase().includes(q) ||
        (contact.workingNotes ?? "").toLowerCase().includes(q)
      );
    });
  }, [stageFilter, search]);

  const selectedContact = useMemo(
    () => filteredContacts.find((c) => c.id === selectedId) ?? null,
    [filteredContacts, selectedId]
  );

  // If selected contact falls out of the filter, default to first visible
  useEffect(() => {
    if (!selectedContact && filteredContacts[0]) {
      setSelectedId(filteredContacts[0].id);
    }
  }, [selectedContact, filteredContacts]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="CRM"
        title="Pipeline & relationships"
        subtitle="A light CRM tuned for real estate — keep leads, active clients, and past relationships organized and ready to flow into your AI engines."
      />

      <section className="space-y-5">
        {/* Top bar: label + actions */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Contacts & opportunities
            </p>
            <p className="mt-1 max-w-xl text-xs text-[var(--avillo-cream-soft)]">
              Filter by stage, search by name or area, then drill into details on the
              right. Closed / past contacts are hidden by default under{" "}
              <span className="font-semibold">“Past / sphere”</span>.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20"
          >
            + Add contact
          </button>
        </div>

        {/* Filters + search */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex flex-wrap gap-2 text-xs">
            <FilterPill
              label="Active"
              active={stageFilter === "active"}
              onClick={() => setStageFilter("active")}
            />
            <FilterPill
              label="New"
              active={stageFilter === "new"}
              onClick={() => setStageFilter("new")}
            />
            <FilterPill
              label="Warm"
              active={stageFilter === "warm"}
              onClick={() => setStageFilter("warm")}
            />
            <FilterPill
              label="Hot"
              active={stageFilter === "hot"}
              onClick={() => setStageFilter("hot")}
            />
            <FilterPill
              label="Past / sphere"
              active={stageFilter === "past"}
              onClick={() => setStageFilter("past")}
            />
          </div>

          <div className="w-full md:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, area, notes..."
              className="avillo-input w-full"
            />
          </div>
        </div>

        {/* Main layout: list + detail */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)]">
          {/* ---------------------------------
           * LEFT: CONTACT LIST (CARD ROWS)
           * --------------------------------*/}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)]" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Contact list
              </p>
              <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                {filteredContacts.length}{" "}
                {filteredContacts.length === 1 ? "result" : "results"}
              </p>
            </div>

            <div className="space-y-2">
              {filteredContacts.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No contacts match this filter yet. Adjust the stage or search query,
                  or add a new contact.
                </p>
              )}

              {filteredContacts.map((contact) => {
                const isSelected = contact.id === selectedContact?.id;

                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedId(contact.id)}
                    className={
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors " +
                      (isSelected
                        ? "border-amber-200/80 bg-slate-900/90 shadow-[0_0_28px_rgba(248,250,252,0.22)]"
                        : "border-slate-800/80 bg-slate-900/60 hover:border-amber-100/70 hover:bg-slate-900/90")
                    }
                  >
                    {/* Top row: name + stage */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-slate-50">
                          {contact.name}
                        </p>
                        {contact.label && (
                          <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                            {contact.label}
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                          stageBadgeClass(contact.stage)
                        }
                      >
                        {stageLabel(contact.stage)}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div className="mt-2 grid gap-1 text-[11px] text-[var(--avillo-cream-soft)] sm:grid-cols-2">
                      <span className="truncate">
                        <span className="text-[var(--avillo-cream-muted)]">
                          Type:
                        </span>{" "}
                        {contact.type}
                      </span>
                      <span className="truncate">
                        <span className="text-[var(--avillo-cream-muted)]">
                          Price:
                        </span>{" "}
                        {contact.priceRange}
                      </span>
                      <span className="truncate">
                        <span className="text-[var(--avillo-cream-muted)]">
                          Areas:
                        </span>{" "}
                        {contact.areas}
                      </span>
                      <span className="truncate">
                        <span className="text-[var(--avillo-cream-muted)]">
                          Timeline:
                        </span>{" "}
                        {contact.timeline}
                      </span>
                    </div>

                    {/* Source row */}
                    <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                      Source: {contact.source}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------------------------
           * RIGHT: DETAIL PANEL (kept as-is)
           * --------------------------------*/}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)]" />

            {!selectedContact && (
              <div className="flex h-full flex-col items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
                <p className="font-semibold text-[var(--avillo-cream-soft)]">
                  No contact selected
                </p>
                <p className="mt-1 max-w-xs">
                  Choose a contact from the list to see details, notes, and quick AI
                  actions.
                </p>
              </div>
            )}

            {selectedContact && (
              <div className="space-y-4 text-xs text-[var(--avillo-cream-soft)]">
                {/* Header + core info */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                      {selectedContact.type}
                    </p>
                    <h2 className="mt-1 text-sm font-semibold text-slate-50">
                      {selectedContact.name}
                    </h2>
                    {selectedContact.label && (
                      <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                        {selectedContact.label}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                        stageBadgeClass(selectedContact.stage)
                      }
                    >
                      {stageLabel(selectedContact.stage)}
                    </span>
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <DetailChip label="Price / budget" value={selectedContact.priceRange} />
                  <DetailChip label="Areas" value={selectedContact.areas} />
                  <DetailChip label="Timeline" value={selectedContact.timeline} />
                  <DetailChip label="Source" value={selectedContact.source} />
                </div>

                {/* Contact methods */}
                <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <DetailChip label="Email" value={selectedContact.email ?? "—"} />
                  <DetailChip label="Phone" value={selectedContact.phone ?? "—"} />
                </div>

                {/* Touch cadence */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-slate-50">
                    Timeline & touchpoints
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                    Next touch:{" "}
                    <span className="font-semibold">
                      {selectedContact.nextTouchDate ?? "Not set"}
                    </span>
                  </p>
                  {selectedContact.lastTouchNote && (
                    <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                      Last touch: {selectedContact.lastTouchNote}
                    </p>
                  )}
                </div>

                {/* Working notes */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-slate-50">Working notes</p>
                  <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)] whitespace-pre-wrap">
                    {selectedContact.workingNotes ||
                      "Add quick context and next steps here."}
                  </p>
                </div>

                {/* Quick AI actions */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-50">
                    Quick AI actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <QuickActionChip label="Buyer Studio" />
                    <QuickActionChip label="Seller Studio" />
                    <QuickActionChip label="Listing Engine" />
                    <QuickActionChip label="Neighborhood Engine" />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-slate-500/80 bg-slate-900/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:bg-slate-800/80"
                  >
                    Save changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------
 * Small components & helpers
 * -----------------------------------*/

type FilterPillProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
};

function FilterPill({ label, active, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors " +
        (active
          ? "border-amber-100/80 bg-amber-50/15 text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.35)]"
          : "border-slate-700/80 text-[var(--avillo-cream-muted)] hover:border-amber-100/60 hover:text-amber-50")
      }
    >
      {label}
    </button>
  );
}

type DetailChipProps = {
  label: string;
  value: string;
};

function DetailChip({ label, value }: DetailChipProps) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--avillo-cream-soft)]">{value}</p>
    </div>
  );
}

type QuickActionChipProps = {
  label: string;
};

function QuickActionChip({ label }: QuickActionChipProps) {
  return (
    <button
      type="button"
      className="rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)] hover:border-amber-100/80 hover:text-amber-50"
    >
      {label}
    </button>
  );
}

/* ------------------------------------
 * Stage helpers
 * -----------------------------------*/

function stageLabel(stage: Stage): string {
  switch (stage) {
    case "new":
      return "New";
    case "warm":
      return "Warm / nurturing";
    case "hot":
      return "Hot / active";
    case "past":
      return "Past / sphere";
    default:
      return stage;
  }
}

function stageBadgeClass(stage: Stage): string {
  switch (stage) {
    case "new":
      return "border-sky-300/80 bg-sky-500/10 text-sky-100";
    case "warm":
      return "border-amber-200/80 bg-amber-400/10 text-amber-100";
    case "hot":
      return "border-rose-300/80 bg-rose-500/10 text-rose-100";
    case "past":
      return "border-slate-500/80 bg-slate-800/60 text-slate-200";
    default:
      return "border-slate-600/80 bg-slate-900/70 text-slate-200";
  }
}