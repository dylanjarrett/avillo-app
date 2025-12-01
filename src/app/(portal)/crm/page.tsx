// src/app/(portal)/crm/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/layout/page-header";

/* ------------------------------------
 * Types
 * -----------------------------------*/

type Stage = "new" | "warm" | "hot" | "past";
type StageFilter = "active" | "new" | "warm" | "hot" | "past";

type ContactNote = {
  id: string;
  text: string;
  createdAt: string;
  reminderAt?: string | null;
};

type LinkedListing = {
  id: string;
  address: string;
  status: string | null;
  role: "buyer" | "seller";
};

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
  notes: ContactNote[];
  linkedListings: LinkedListing[];
};

type ListingOption = {
  id: string;
  label: string; // usually the address
};

/* ------------------------------------
 * Small helpers
 * -----------------------------------*/

function upsertLinkedListing(
  existing: LinkedListing[] | undefined,
  next: LinkedListing
): LinkedListing[] {
  const current = existing ?? [];
  const found = current.some(
    (l) => l.id === next.id && l.role === next.role
  );
  if (!found) {
    return [...current, next];
  }
  return current.map((l) =>
    l.id === next.id && l.role === next.role ? { ...l, ...next } : l
  );
}

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

  // Notes (per contact) drafts + saving state
  const [noteDrafts, setNoteDrafts] = useState<
    Record<string, { text: string; reminderAt: string }>
  >({});
  const [noteSaving, setNoteSaving] = useState(false);

  // Refs for mobile scroll behavior
  const listRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

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
          notes: Array.isArray(c.notes) ? c.notes : [],
          linkedListings: Array.isArray(c.linkedListings)
            ? c.linkedListings
            : [],
        }));

        if (!cancelled) {
          setContacts(loaded);
          if (loaded[0]) {
            setSelectedId(null);
            setActiveContact(null);
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
        const notesText = (c.notes ?? [])
          .map((n) => n.text)
          .join(" ")
          .toLowerCase();

        const linkedListingAddresses = (c.linkedListings ?? [])
          .map((l) => l.address || "")
          .join(" ")
          .toLowerCase();

        return (
          c.name.toLowerCase().includes(q) ||
          c.areas.toLowerCase().includes(q) ||
          c.priceRange.toLowerCase().includes(q) ||
          notesText.includes(q) ||
          linkedListingAddresses.includes(q)
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

  // Helper: scroll detail panel into view on mobile with offset for navbar
  function scrollToDetail() {
    if (!detailRef.current || typeof window === "undefined") return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) return;

    const rect = detailRef.current.getBoundingClientRect();
    const top = rect.top + window.scrollY - 95; // offset so the card header is visible
    window.scrollTo({ top, behavior: "smooth" });
  }

  // Mobile: when a contact is selected, scroll detail section into view
  useEffect(() => {
    if (!activeContact) return;
    if (typeof window === "undefined") return;
    scrollToDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, activeContact?.id]);

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
      notes: [],
      linkedListings: [],
    };
    setSelectedId("new");
    setActiveContact(fresh);
  }

  function handleFieldChange<K extends keyof Contact>(key: K, value: Contact[K]) {
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

  function updateNoteDraft(
    contactId: string,
    field: "text" | "reminderAt",
    value: string
  ) {
    setNoteDrafts((prev) => ({
      ...prev,
      [contactId]: {
        text: field === "text" ? value : prev[contactId]?.text ?? "",
        reminderAt:
          field === "reminderAt" ? value : prev[contactId]?.reminderAt ?? "",
      },
    }));
  }

  async function handleAddNote(contactId: string) {
    const draft = noteDrafts[contactId];
    if (!draft || !draft.text.trim()) return;

    try {
      setNoteSaving(true);
      setError(null);

      const res = await fetch(`/api/crm/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: draft.text,
          reminderAt: draft.reminderAt || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save note.");
      }

      const data = await res.json();
      const note: ContactNote = data.note;

      // prepend note to this contact in list
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId ? { ...c, notes: [note, ...(c.notes ?? [])] } : c
        )
      );

      // update active contact, if it’s the same one
      setActiveContact((prev) =>
        prev && prev.id === contactId
          ? { ...prev, notes: [note, ...(prev.notes ?? [])] }
          : prev
      );

      // clear draft
      setNoteDrafts((prev) => ({
        ...prev,
        [contactId]: { text: "", reminderAt: "" },
      }));
    } catch (err: any) {
      console.error("Save note error", err);
      setError(
        err?.message || "We couldn’t save this note. Try again in a moment."
      );
    } finally {
      setNoteSaving(false);
    }
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
        notes: Array.isArray(data.contact.notes) ? data.contact.notes : [],
        linkedListings: activeContact.linkedListings ?? [],
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

      return saved;
    } catch (err: any) {
      console.error("Save contact error", err);
      setError(
        err?.message || "We couldn’t save this contact. Try again in a moment."
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

  // Ensure a contact has an id before linking/unlinking listings
  async function ensureContactSaved(): Promise<Contact | null> {
    if (!activeContact) return null;
    if (activeContact.id) return activeContact;
    const saved = await handleSave();
    return saved;
  }

  // Refresh contacts after linking/unlinking so CRM & Listings stay in sync
  async function refreshContactsAndSelect(contactId: string) {
    try {
      // IMPORTANT: do NOT toggle `loading` here, so the left column
      // does not flash "Loading your contacts…" after each tag change.
      const res = await fetch("/api/crm/contacts");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to reload contacts.");
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
        notes: Array.isArray(c.notes) ? c.notes : [],
        linkedListings: Array.isArray(c.linkedListings)
          ? c.linkedListings
          : [],
      }));

      setContacts(loaded);
      const found = loaded.find((c) => c.id === contactId) ?? null;
      setSelectedId(found?.id ?? null);
      setActiveContact(found);
    } catch (err: any) {
      console.error("refreshContactsAndSelect error", err);
      setError(
        err?.message ||
          "We updated this contact, but couldn’t refresh the view."
      );
    }
  }

  // Toggle linking of this contact to a listing (buyer/seller based on contact.type)
  async function toggleListingLink(listingId: string) {
    try {
      const saved = await ensureContactSaved();
      if (!saved?.id) return;

      const relType = saved.type ?? "Buyer";

      const wantsSeller =
        relType === "Seller" || relType === "Buyer & Seller";
      const wantsBuyer =
        relType === "Buyer" || relType === "Buyer & Seller";

      if (!wantsSeller && !wantsBuyer) {
        // default to buyer if somehow no type set
        return;
      }

      const links = saved.linkedListings ?? [];
      const linkedAsSeller = links.some(
        (l) => l.id === listingId && l.role === "seller"
      );
      const linkedAsBuyer = links.some(
        (l) => l.id === listingId && l.role === "buyer"
      );

      const currentlyLinked =
        (wantsSeller && linkedAsSeller) || (wantsBuyer && linkedAsBuyer);

      const tasks: Promise<Response>[] = [];

      if (!currentlyLinked) {
        // LINK
        if (wantsSeller && !linkedAsSeller) {
          tasks.push(
            fetch("/api/listings/assign-contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId,
                contactId: saved.id,
                relationship: "seller",
              }),
            })
          );
        }
        if (wantsBuyer && !linkedAsBuyer) {
          tasks.push(
            fetch("/api/listings/assign-contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId,
                contactId: saved.id,
                relationship: "buyer",
              }),
            })
          );
        }
      } else {
        // UNLINK
        if (wantsSeller && linkedAsSeller) {
          tasks.push(
            fetch("/api/listings/unlink-contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId,
                contactId: saved.id,
                relationship: "seller",
              }),
            })
          );
        }
        if (wantsBuyer && linkedAsBuyer) {
          tasks.push(
            fetch("/api/listings/unlink-contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId,
                contactId: saved.id,
                relationship: "buyer",
              }),
            })
          );
        }
      }

      if (tasks.length > 0) {
        const responses = await Promise.all(tasks);
        const failed = responses.find((r) => !r.ok);
        if (failed) {
          const data = await failed.json().catch(() => null);
          throw new Error(
            data?.error || "We couldn’t update this contact’s listings."
          );
        }
      }

      await refreshContactsAndSelect(saved.id);
    } catch (err: any) {
      console.error("toggleListingLink error", err);
      setError(
        err?.message ||
          "We couldn’t update which listings this contact is linked to."
      );
    }
  }

  // Unlink a specific role (buyer/seller) from the summary pill "X"
  async function handleUnlinkListing(listingId: string, role: "buyer" | "seller") {
    try {
      const saved = await ensureContactSaved();
      if (!saved?.id) return;

      const res = await fetch("/api/listings/unlink-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          contactId: saved.id,
          relationship: role,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "We couldn’t remove this link from the listing."
        );
      }

      await refreshContactsAndSelect(saved.id);
    } catch (err: any) {
      console.error("handleUnlinkListing error", err);
      setError(
        err?.message || "We couldn’t unlink this contact from that listing."
      );
    }
  }

  // Mobile: back from detail → clear selection + scroll up to list header
function scrollBackToContacts() {
  if (typeof window !== "undefined" && listRef.current && window.innerWidth < 1024) {
    const rect = listRef.current.getBoundingClientRect();
    const HEADER_OFFSET = 280; // matches scrollToDetail offset (tweak if you want)
    const targetY = window.scrollY + rect.top - HEADER_OFFSET;

    window.scrollTo({
      top: targetY,
      behavior: "smooth",
    });
  }

  // Clear the selection after triggering the scroll
  setActiveContact(null);
  setSelectedId(null);
}

  /* ------------------------------------
   * Render
   * -----------------------------------*/

  return (
    <div className="space-y-12">
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
          <div
            ref={listRef}
            className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]"
          >
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
                      onClick={() => {
                        setSelectedId(contact.id ?? ("new" as const));
                        scrollToDetail();
                      }}
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
          <div
            ref={detailRef}
            className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]"
          >
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

                {/* Mobile Back Button (top-right, unified with Listings) */}
    <div className="relative mb-2 lg:hidden">
      <button
        type="button"
        onClick={scrollBackToContacts}
        className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-[var(--avillo-cream-soft)] shadow-[0_0_18px_rgba(15,23,42,0.9)] hover:border-amber-100/80 hover:text-amber-50 hover:bg-slate-900/95"
      >
        <span className="text-xs">←</span>
        <span>Back</span>
      </button>
    </div>
    <div className="h-3 lg:hidden"></div>

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

                {/* Linked listings summary (pills with X) */}
                {activeContact.linkedListings &&
                  activeContact.linkedListings.length > 0 && (
                    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                      <p className="text-[11px] font-semibold text-amber-100/90">
                        Linked listings
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                        This contact is connected to the listings below. Remove a
                        link with the “×”.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activeContact.linkedListings.map((l) => (
                          <span
                            key={`${l.id}-${l.role}`}
                            className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1.5 text-[10px] text-[var(--avillo-cream-soft)]"
                          >
                            <span className="truncate max-w-[160px] sm:max-w-[220px]">
                              {l.address || "Unnamed listing"}
                            </span>
                            <span
                              className={
                                "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] " +
                                (l.role === "seller"
                                  ? "border-amber-200/90 bg-amber-400/15 text-amber-50"
                                  : "border-sky-200/90 bg-sky-500/15 text-sky-50")
                              }
                            >
                              {l.role === "seller" ? "Seller" : "Buyer"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleUnlinkListing(l.id, l.role)
                              }
                              className="rounded-full border border-slate-700/80 bg-slate-900/80 px-1.5 text-[9px] leading-none text-[var(--avillo-cream-muted)] hover:border-rose-400/80 hover:bg-rose-900/50 hover:text-rose-50"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Tag to listing (multi-select, 2-way with listings panel) */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    Tag contact to listings
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
                        Tap any listing below to link or unlink this contact as a{" "}
                        <span className="font-semibold">
                          buyer, seller, or both
                        </span>{" "}
                        based on the relationship type above.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {listings.map((l) => {
                          const relType = activeContact.type ?? "Buyer";
                          const wantsSeller =
                            relType === "Seller" ||
                            relType === "Buyer & Seller";
                          const wantsBuyer =
                            relType === "Buyer" ||
                            relType === "Buyer & Seller";

                          const links = activeContact.linkedListings ?? [];
                          const linkedAsSeller = links.some(
                            (link) =>
                              link.id === l.id && link.role === "seller"
                          );
                          const linkedAsBuyer = links.some(
                            (link) =>
                              link.id === l.id && link.role === "buyer"
                          );

                          const isLinked =
                            (wantsSeller && linkedAsSeller) ||
                            (wantsBuyer && linkedAsBuyer);

                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => toggleListingLink(l.id)}
                              className={
                                "rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] " +
                                (isLinked
                                  ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.32)]"
                                  : "border-slate-700/80 bg-slate-900/80 text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50")
                              }
                            >
                              {l.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Notes & reminders */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-amber-100/90">
                    Notes & reminders
                  </p>

                  {!activeContact.id ? (
                    <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
                      Save this contact first, then you’ll be able to log notes and
                      create reminders tied to your dashboard.
                    </p>
                  ) : (
                    <>
                      {/* Existing notes */}
                      <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                        {(activeContact.notes ?? []).length === 0 && (
                          <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">
                            No notes yet. Log your first touchpoint below.
                          </p>
                        )}

                        {activeContact.notes
                          .slice()
                          .sort(
                            (a, b) =>
                              new Date(b.createdAt).getTime() -
                              new Date(a.createdAt).getTime()
                          )
                          .map((note) => (
                            <div
                              key={note.id}
                              className="rounded-md border border-slate-800/80 bg-slate-900/60 px-2 py-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-400">
                                  {new Date(note.createdAt).toLocaleString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                    }
                                  )}
                                </span>
                                {note.reminderAt && (
                                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                    Reminder{" "}
                                    {new Date(
                                      note.reminderAt
                                    ).toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-50">
                                {note.text}
                              </p>
                            </div>
                          ))}
                      </div>

                      {/* New note composer */}
                      <div className="mt-3 space-y-2">
                        <textarea
                          rows={3}
                          value={
                            activeContact.id
                              ? noteDrafts[activeContact.id]?.text ?? ""
                              : ""
                          }
                          onChange={(e) =>
                            activeContact.id &&
                            updateNoteDraft(
                              activeContact.id,
                              "text",
                              e.target.value
                            )
                          }
                          placeholder="Log a quick note, call summary, or next steps…"
                          className="w-full resize-none rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
                        />

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <label className="flex items-center gap-2 text-[10px] text-[var(--avillo-cream-muted)]">
                            Reminder
                            <input
                              type="datetime-local"
                              value={
                                activeContact.id
                                  ? noteDrafts[activeContact.id]?.reminderAt ??
                                    ""
                                  : ""
                              }
                              onChange={(e) =>
                                activeContact.id &&
                                updateNoteDraft(
                                  activeContact.id,
                                  "reminderAt",
                                  e.target.value
                                )
                              }
                              className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-50 outline-none focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              activeContact.id &&
                              handleAddNote(activeContact.id)
                            }
                            disabled={
                              !activeContact.id ||
                              noteSaving ||
                              !noteDrafts[activeContact.id]?.text?.trim()
                            }
                            className="inline-flex items-center justify-center rounded-full border border-amber-100/80 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.28)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {noteSaving ? "Saving note…" : "Save note"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
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
};

function DetailInput({ label, value, onChange, placeholder }: DetailInputProps) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full border-none bg-transparent pt-0.5 text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
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