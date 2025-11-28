// src/app/(portal)/crm/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/layout/page-header";

/* ------------------------------------
 * Types
 * -----------------------------------*/

type Stage = "new" | "warm" | "hot" | "past";
type StageFilter = "active" | "new" | "warm" | "hot" | "past";

type Contact = {
  id?: string; // undefined = not yet saved
  name: string;
  label: string;
  stage: Stage;
  type: "Buyer" | "Seller" | "Buyer & Seller" | null;
  priceRange: string;
  areas: string; // used for property address OR buyer areas
  timeline: string;
  source: string;
  email: string;
  phone: string;
  nextTouchDate: string;
  lastTouchNote: string;
  workingNotes: string;
};

type ListingOption = {
  id: string;
  label: string; // usually the address
};

/* ------------------------------------
 * Page
 * -----------------------------------*/

export default function CrmPage() {
  const router = useRouter();

  const [stageFilter, setStageFilter] = useState<StageFilter>("active");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listings for tagging
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null
  );

  // ---------- Load contacts & listings on mount ----------
  useEffect(() => {
    let cancelled = false;

    async function loadContacts() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/crm/contacts");
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to load contacts.");
        }
        const data = await res.json();
        const loaded: Contact[] = (data.contacts ?? []).map((c: any) => ({
          id: c.id,
          name: c.name ?? "",
          label: c.label ?? "",
          stage: (c.stage as Stage) ?? "new",
          type:
            (c.type as "Buyer" | "Seller" | "Buyer & Seller" | null) ??
            ("Buyer" as const),
          priceRange: c.priceRange ?? "",
          areas: c.areas ?? "",
          timeline: c.timeline ?? "",
          source: c.source ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          nextTouchDate: c.nextTouchDate ?? "",
          lastTouchNote: c.lastTouchNote ?? "",
          workingNotes: c.workingNotes ?? "",
        }));

        if (!cancelled) {
          setContacts(loaded);
          if (loaded[0]) {
            setSelectedId(loaded[0].id!);
            setActiveContact(loaded[0]);
          }
        }
      } catch (err: any) {
        console.error("Load contacts error", err);
        if (!cancelled) {
          setError(
            err?.message ||
              "We couldn’t load your contacts. Try again in a moment."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadListings() {
      try {
        setListingsLoading(true);
        const res = await fetch("/api/listings");
        if (!res.ok) throw new Error("Failed to load listings.");
        const data = await res.json();
        const items: ListingOption[] = (data.listings ?? []).map((l: any) => ({
          id: l.id,
          label: l.address ?? "Unnamed listing",
        }));
        if (!cancelled) setListings(items);
      } catch (err) {
        console.error("Load listings error", err);
        if (!cancelled) {
          // Silent fail in UI: just show “no listings” state
          setListings([]);
        }
      } finally {
        if (!cancelled) setListingsLoading(false);
      }
    }

    loadContacts();
    loadListings();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Derived: filtered contacts for list ----------
  const filteredContacts = useMemo(() => {
    const base = contacts.slice();
    let list = base;

    // Stage filter
    list = list.filter((c) => {
      if (stageFilter === "active") return c.stage !== "past";
      return c.stage === stageFilter;
    });

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          c.areas.toLowerCase().includes(q) ||
          c.priceRange.toLowerCase().includes(q) ||
          c.workingNotes.toLowerCase().includes(q)
        );
      });
    }

    // Surface “new contact” while editing
    if (selectedId === "new" && activeContact) {
      list = [
        {
          ...activeContact,
          id: "new",
          name: activeContact.name || "New contact",
        },
        ...list,
      ];
    }

    return list;
  }, [contacts, stageFilter, search, selectedId, activeContact]);

  // Keep activeContact in sync when selection changes
  useEffect(() => {
    if (selectedId === "new") return; // handled by Add Contact
    if (!selectedId) {
      setActiveContact(null);
      return;
    }
    const found = contacts.find((c) => c.id === selectedId) ?? null;
    setActiveContact(found);
  }, [selectedId, contacts]);

  // ---------- Actions ----------

  function handleAddContact() {
    const fresh: Contact = {
      id: undefined,
      name: "",
      label: "",
      stage: "new",
      type: null,
      priceRange: "",
      areas: "",
      timeline: "",
      source: "",
      email: "",
      phone: "",
      nextTouchDate: "",
      lastTouchNote: "",
      workingNotes: "",
    };
    setSelectedId("new");
    setActiveContact(fresh);
    setSelectedListingId(null);
  }

  function handleFieldChange<K extends keyof Contact>(
    key: K,
    value: Contact[K]
  ) {
    if (!activeContact) return;
    setActiveContact({ ...activeContact, [key]: value });
  }

  // Split "Contact name" into first + last for API
  function splitName(full: string): { firstName?: string; lastName?: string } {
    const trimmed = full.trim();
    if (!trimmed) return {};
    const parts = trimmed.split(" ");
    const firstName = parts.shift();
    const lastName = parts.join(" ") || undefined;
    return { firstName, lastName };
  }

  async function handleSave(): Promise<Contact | null> {
    if (!activeContact) return null;

    try {
      setSaving(true);
      setError(null);

      const { firstName, lastName } = splitName(activeContact.name);

      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeContact.id,
          firstName,
          lastName,
          email: activeContact.email || undefined,
          phone: activeContact.phone || undefined,
          stage: activeContact.stage,
          label: activeContact.label || undefined,
          type: activeContact.type,
          priceRange: activeContact.priceRange || undefined,
          areas: activeContact.areas || undefined,
          timeline: activeContact.timeline || undefined,
          source: activeContact.source || undefined,
          nextTouchDate: activeContact.nextTouchDate || undefined,
          lastTouchNote: activeContact.lastTouchNote || undefined,
          workingNotes: activeContact.workingNotes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save contact.");
      }

      const data = await res.json();
      const saved: Contact = {
        id: data.contact.id,
        name: data.contact.name ?? "",
        label: data.contact.label ?? "",
        stage: (data.contact.stage as Stage) ?? "new",
        type:
          (data.contact.type as "Buyer" | "Seller" | "Buyer & Seller" | null) ??
          ("Buyer" as const),
        priceRange: data.contact.priceRange ?? "",
        areas: data.contact.areas ?? "",
        timeline: data.contact.timeline ?? "",
        source: data.contact.source ?? "",
        email: data.contact.email ?? "",
        phone: data.contact.phone ?? "",
        nextTouchDate: data.contact.nextTouchDate ?? "",
        lastTouchNote: data.contact.lastTouchNote ?? "",
        workingNotes: data.contact.workingNotes ?? "",
      };

      // Update in-memory list
      setContacts((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === saved.id);
        if (existingIndex === -1) {
          return [saved, ...prev];
        }
        const next = [...prev];
        next[existingIndex] = saved;
        return next;
      });

      setSelectedId(saved.id!);
      setActiveContact(saved);

      // If a listing is selected, tag contact to that listing
      if (selectedListingId && saved.id) {
        const isSeller =
          saved.type === "Seller" || saved.type === "Buyer & Seller";
        const isBuyer =
          saved.type === "Buyer" || saved.type === "Buyer & Seller";

        const body: any = {
          id: selectedListingId,
        };
        if (isSeller) body.sellerContactId = saved.id;
        if (isBuyer) body.buyerIds = [saved.id];

        try {
          const linkRes = await fetch("/api/listings/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!linkRes.ok) {
            console.error("Failed to tag contact to listing");
          }
        } catch (err) {
          console.error("Tag listing error", err);
        }
      }

      return saved;
    } catch (err: any) {
      console.error("Save contact error", err);
      setError(
        err?.message ||
          "We couldn’t save this contact. Try again in a moment."
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activeContact?.id) {
      // If the new, unsaved contact is showing, just clear it
      setActiveContact(null);
      setSelectedId(contacts[0]?.id ?? null);
      setSelectedListingId(null);
      return;
    }

    const confirmed = window.confirm(
      "Delete this contact from your CRM? This can’t be undone."
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError(null);

      const res = await fetch("/api/crm/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeContact.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete contact.");
      }

      setContacts((prev) => prev.filter((c) => c.id !== activeContact.id));
      const remaining = contacts.filter((c) => c.id !== activeContact.id);
      setActiveContact(remaining[0] ?? null);
      setSelectedId(remaining[0]?.id ?? null);
      setSelectedListingId(null);
    } catch (err: any) {
      console.error("Delete contact error", err);
      setError(
        err?.message ||
          "We couldn’t delete this contact. Try again in a moment."
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveAndCreateListing() {
    const saved = await handleSave();
    if (saved?.id) {
      router.push(`/listings/new?contactId=${saved.id}`);
    }
  }

  /* ------------------------------------
   * Render
   * -----------------------------------*/

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
              Filter by stage, search by name or area, then drill into details on
              the right. Closed / past contacts are hidden by default under{" "}
              <span className="font-semibold">“Past / sphere”</span>.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddContact}
            className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20"
          >
            + Add contact
          </button>
        </div>

        {/* Error bar */}
        {error && (
          <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
            {error}
          </div>
        )}

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
              className="avillo-input w-full text-slate-50"
            />
          </div>
        </div>

        {/* Main layout: list + detail */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)]">
          {/* LEFT: CONTACT LIST */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

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
              {loading && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Loading your contacts…
                </p>
              )}

              {!loading && filteredContacts.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No contacts match this filter yet. Adjust the stage or search,
                  or add a new contact.
                </p>
              )}

              {!loading &&
                filteredContacts.map((contact) => {
                  const isSelected =
                    (selectedId === "new" && contact.id === "new") ||
                    (contact.id && contact.id === selectedId);

                  const relType = contact.type;
                  const isBuyer = relType === "Buyer";
                  const isSeller = relType === "Seller";

                  const priceLabel = isBuyer
                    ? "Budget"
                    : isSeller
                    ? "Price"
                    : "Price / budget";

                  const areasLabel = isBuyer
                    ? "Areas"
                    : isSeller
                    ? "Address"
                    : "Areas / address";

                  return (
                    <button
                      key={contact.id ?? "new-contact-row"}
                      type="button"
                      onClick={() =>
                        setSelectedId(contact.id ?? ("new" as const))
                      }
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
                            {contact.name || "New contact"}
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
                          {contact.type ?? "—"}
                        </span>
                        <span className="truncate">
                          <span className="text-[var(--avillo-cream-muted)]">
                            {priceLabel}:
                          </span>{" "}
                          {contact.priceRange || "—"}
                        </span>
                        <span className="truncate">
                          <span className="text-[var(--avillo-cream-muted)]">
                            {areasLabel}:
                          </span>{" "}
                          {contact.areas || "—"}
                        </span>
                        <span className="truncate">
                          <span className="text-[var(--avillo-cream-muted)]">
                            Timeline:
                          </span>{" "}
                          {contact.timeline || "—"}
                        </span>
                      </div>

                      {/* Source row */}
                      <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                        Source: {contact.source || "—"}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* RIGHT: DETAIL PANEL */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

            {!activeContact && (
              <div className="flex h-full flex-col items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
                <p className="font-semibold text-[var(--avillo-cream-soft)]">
                  No contact selected
                </p>
                <p className="mt-1 max-w-xs">
                  Choose a contact from the list to see details, notes, and quick
                  AI actions — or click “Add contact” to start new.
                </p>
              </div>
            )}

            {activeContact && (
              <div className="space-y-4 text-xs text-[var(--avillo-cream-soft)]">
                {/* Header: Contact name + lead status */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="w-full sm:max-w-xs">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                      Contact name
                    </label>
                    <input
                      value={activeContact.name}
                      onChange={(e) =>
                        handleFieldChange("name", e.target.value)
                      }
                      placeholder="Start here — add a name"
                      className="avillo-input w-full text-slate-50"
                    />
                    {activeContact.label && (
                      <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                        {activeContact.label}
                      </p>
                    )}
                  </div>

                  {/* Stage selector inside detail panel */}
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                      Lead status
                    </p>
                    <div className="inline-flex flex-wrap gap-1">
                      <StageChip
                        label="New"
                        stage="new"
                        active={activeContact.stage === "new"}
                        onClick={() => handleFieldChange("stage", "new")}
                      />
                      <StageChip
                        label="Warm"
                        stage="warm"
                        active={activeContact.stage === "warm"}
                        onClick={() => handleFieldChange("stage", "warm")}
                      />
                      <StageChip
                        label="Hot"
                        stage="hot"
                        active={activeContact.stage === "hot"}
                        onClick={() => handleFieldChange("stage", "hot")}
                      />
                      <StageChip
                        label="Past"
                        stage="past"
                        active={activeContact.stage === "past"}
                        onClick={() => handleFieldChange("stage", "past")}
                      />
                    </div>
                  </div>
                </div>

                {/* Relationship type */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                    Relationship type
                  </p>
                  <div className="inline-flex flex-wrap gap-2">
                    <RoleToggle
                      label="Buyer"
                      active={activeContact.type === "Buyer"}
                      onClick={() => handleFieldChange("type", "Buyer")}
                    />
                    <RoleToggle
                      label="Seller"
                      active={activeContact.type === "Seller"}
                      onClick={() => handleFieldChange("type", "Seller")}
                    />
                    <RoleToggle
                      label="Buyer & Seller"
                      active={activeContact.type === "Buyer & Seller"}
                      onClick={() =>
                        handleFieldChange("type", "Buyer & Seller")
                      }
                    />
                  </div>
                </div>

                {/* Quick stats row 1: price / budget + address/areas */}
                {(() => {
                  const relType = activeContact.type;
                  const isBuyerOnly = relType === "Buyer";

                  const priceLabel =
                    relType === "Buyer"
                      ? "Budget"
                      : relType === "Seller"
                      ? "Price"
                      : "Price / budget";

                  const pricePlaceholder =
                    relType === "Buyer"
                      ? "Ex: $650K–$750K"
                      : relType === "Seller"
                      ? "Ex: $1.3M–$1.5M"
                      : "Ex: Buyer $650K–$750K or Seller $1.3M";

                  const addressLabel = isBuyerOnly ? "Areas" : "Property address";
                  const addressPlaceholder = isBuyerOnly
                    ? "Ex: Mission Valley, North Park"
                    : "Ex: 1234 Coastal Dr, La Jolla";

                  return (
                    <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                      <DetailInput
                        label={priceLabel}
                        value={activeContact.priceRange}
                        onChange={(v) => handleFieldChange("priceRange", v)}
                        placeholder={pricePlaceholder}
                      />
                      <DetailInput
                        label={addressLabel}
                        value={activeContact.areas}
                        onChange={(v) => handleFieldChange("areas", v)}
                        placeholder={addressPlaceholder}
                      />
                    </div>
                  );
                })()}

                {/* Quick stats row 2: timeline + source */}
                <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <DetailInput
                    label="Timeline"
                    value={activeContact.timeline}
                    onChange={(v) => handleFieldChange("timeline", v)}
                    placeholder="Ex: 0–60 days, 3–6 months…"
                  />
                  <DetailInput
                    label="Source"
                    value={activeContact.source}
                    onChange={(v) => handleFieldChange("source", v)}
                    placeholder="Open house, portal, social, referral…"
                  />
                </div>

                {/* Contact methods */}
                <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <DetailInput
                    label="Email"
                    value={activeContact.email}
                    onChange={(v) => handleFieldChange("email", v)}
                    placeholder="email@client.com"
                  />
                  <DetailInput
                    label="Phone"
                    value={activeContact.phone}
                    onChange={(v) => handleFieldChange("phone", v)}
                    placeholder="(555) 123-4567"
                  />
                </div>

                {/* Tag to listing */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    Tag contact to listing
                  </p>
                  {listingsLoading ? (
                    <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
                      Loading your listings…
                    </p>
                  ) : listings.length === 0 ? (
                    <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
                      You don’t have any listings yet. Save this contact, then
                      create their first listing.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                        Choose an existing listing to associate this buyer or
                        seller with.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {listings.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() =>
                              setSelectedListingId(
                                selectedListingId === l.id ? null : l.id
                              )
                            }
                            className={
                              "rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] " +
                              (selectedListingId === l.id
                                ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.32)]"
                                : "border-slate-700/80 bg-slate-900/80 text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50")
                            }
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      Or create a brand-new listing from this contact.
                    </p>
                    <button
                      type="button"
                      onClick={handleSaveAndCreateListing}
                      className="inline-flex items-center justify-center rounded-full border border-sky-300/80 bg-sky-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-50 hover:bg-sky-500/20"
                    >
                      Save & create new listing
                    </button>
                  </div>
                </div>

                {/* Touch cadence */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    Timeline & touchpoints
                  </p>
                  <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                    <DetailInput
                      label="Next touch"
                      value={activeContact.nextTouchDate}
                      onChange={(v) => handleFieldChange("nextTouchDate", v)}
                      placeholder="Today, next week, a date…"
                      minimal
                    />
                    <DetailInput
                      label="Last touch note"
                      value={activeContact.lastTouchNote}
                      onChange={(v) => handleFieldChange("lastTouchNote", v)}
                      placeholder="What happened last time you spoke?"
                      minimal
                    />
                  </div>
                </div>

                {/* Working notes */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    Working notes
                  </p>
                  <textarea
                    value={activeContact.workingNotes}
                    onChange={(e) =>
                      handleFieldChange("workingNotes", e.target.value)
                    }
                    rows={3}
                    placeholder="Add quick context, next steps, and anything you want Avillo to remember for AI workflows."
                    className="mt-2 w-full resize-none border-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                  />
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

                {/* Footer buttons */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center justify-center rounded-full border border-rose-400/70 bg-rose-900/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-50 hover:bg-rose-800/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {activeContact.id ? "Delete contact" : "Discard new contact"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void handleSave();
                    }}
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-full border border-amber-100/80 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-50 shadow-[0_0_22px_rgba(248,250,252,0.28)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save changes"}
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

type DetailInputProps = {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minimal?: boolean;
};

function DetailInput({
  label,
  value,
  onChange,
  placeholder,
  minimal,
}: DetailInputProps) {
  return (
    <div
      className={
        minimal
          ? "space-y-1"
          : "rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          "mt-0.5 w-full border-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]" +
          (minimal ? "" : " pt-0.5")
        }
      />
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

type StageChipProps = {
  label: string;
  stage: Stage;
  active: boolean;
  onClick: () => void;
};

function StageChip({ label, stage, active, onClick }: StageChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] " +
        (active
          ? stageBadgeClass(stage)
          : "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-muted)] hover:border-amber-100/60 hover:text-amber-50")
      }
    >
      {label}
    </button>
  );
}

type RoleToggleProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function RoleToggle({ label, active, onClick }: RoleToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] " +
        (active
          ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.32)]"
          : "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50")
      }
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
