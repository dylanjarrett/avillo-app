// src/app/(portal)/people/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { useCrmMobileWorkspaceScroll } from "@/hooks/useCrmMobileWorkspaceScroll";
import { FilterPill } from "@/components/ui/filter-pill";

/* ------------------------------------
 * Types
 * -----------------------------------*/

type Stage = "new" | "warm" | "hot" | "past";
type ContactRoleFilter = "all" | "buyers" | "sellers";
type StageFilter = "all" | "new" | "warm" | "hot" | "past";
type PeopleTab = "overview" | "activity";

// Internal, lowercase contact type values
type ContactType = "buyer" | "seller" | "buyer & seller" | null;

type ContactNote = {
  id: string;
  text: string;
  createdAt: string;
  taskAt?: string | null;
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
  type: ContactType;
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
 * Constants
 * -----------------------------------*/

const CONTACT_SOURCE_OPTIONS = [
  { value: "zillow", label: "Zillow" },
  { value: "referral", label: "Referral" },
  { value: "open house", label: "Open House" },
  { value: "website", label: "Website" },
  { value: "social media", label: "Social Media" },
  { value: "other", label: "Other" },
] as const;

/* ------------------------------------
 * Small helpers
 * -----------------------------------*/

function upsertLinkedListing(
  existing: LinkedListing[] | undefined,
  next: LinkedListing
): LinkedListing[] {
  const current = existing ?? [];
  const found = current.some((l) => l.id === next.id && l.role === next.role);
  if (!found) {
    return [...current, next];
  }
  return current.map((l) =>
    l.id === next.id && l.role === next.role ? { ...l, ...next } : l
  );
}

function normalizeContactType(raw: any): ContactType {
  if (!raw) return null;
  const v = String(raw).toLowerCase();
  if (v === "buyer") return "buyer";
  if (v === "seller") return "seller";
  if (v === "buyer & seller" || v === "buyer & seller") return "buyer & seller";
  return null;
}

function prettyContactType(type: ContactType): string {
  switch (type) {
    case "buyer":
      return "Buyer";
    case "seller":
      return "Seller";
    case "buyer & seller":
      return "Buyer & Seller";
    default:
      return "—";
  }
}

function prettySource(source: string): string {
  if (!source) return "—";
  const opt = CONTACT_SOURCE_OPTIONS.find((o) => o.value === source);
  if (opt) return opt.label;
  // Fallback: capitalize first letter of each word
  return source
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/* ------------------------------------
 * Page
 * -----------------------------------*/

export default function CrmPage() {
  const {
    listHeaderRef,
    workspaceRef,
    scrollToWorkspace,
    scrollBackToListHeader,
  } = useCrmMobileWorkspaceScroll();

  // scroll container for the contact list
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth < 1024;

  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [roleFilter, setRoleFilter] = useState<ContactRoleFilter>("all");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  // ✅ NEW: right-panel tabs (Overview / Activity)
  const [activeTab, setActiveTab] = useState<PeopleTab>("overview");

  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autopilotItems, setAutopilotItems] = useState<any[]>([]);
  const [autopilotTasks, setAutopilotTasks] = useState<any[]>([]);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------- Derived counts for pills ----------
  const totalContacts = contacts.length;

  const buyersCount = contacts.filter(
    (c) => c.type === "buyer" || c.type === "buyer & seller"
  ).length;

  const sellersCount = contacts.filter(
    (c) => c.type === "seller" || c.type === "buyer & seller"
  ).length;

  function handleStageFilterClick(next: StageFilter) {
    setStageFilter((current) => {
      // If you click the same pill again, go back to "all"
      if (current === next) return "all";
      return next;
    });
  }

  // Listings for tagging
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);

  // Notes (per contact) drafts + saving state
  const [noteDrafts, setNoteDrafts] = useState<
    Record<string, { text: string; taskAt: string }>
  >({});
  const [noteSaving, setNoteSaving] = useState(false);

  // Mobile: whether the right-hand workspace is showing (like Listings page)
  const [workspaceOpenMobile, setWorkspaceOpenMobile] = useState(false);

  // Convenience: go back to list & clear selection using the hook scroll
  function backToListAndClearSelection() {
    // hide workspace on mobile first
    setWorkspaceOpenMobile(false);

    scrollBackToListHeader(() => {
      setActiveContact(null);
      setSelectedId(null);
    });
  }

  // ✅ NEW: whenever you switch contacts, land on Overview tab
  useEffect(() => {
    if (activeContact) setActiveTab("overview");
  }, [activeContact?.id]);


  useEffect(() => {
  if (!activeContact?.id) return;
  if (activeTab !== "activity") return;

  let cancelled = false;

  async function loadAutopilot() {
    try {
      setAutopilotLoading(true);
      const res = await fetch(`/api/automations/activity?contactId=${activeContact.id}`);
      const data = await res.json().catch(() => null);

      if (!cancelled) {
        setAutopilotItems(Array.isArray(data?.items) ? data.items : []);
        setAutopilotTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      }
    } catch (e) {
      if (!cancelled) {
        setAutopilotItems([]);
        setAutopilotTasks([]);
      }
    } finally {
      if (!cancelled) setAutopilotLoading(false);
    }
  }

  loadAutopilot();
  return () => {
    cancelled = true;
  };
}, [activeContact?.id, activeTab]);


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
        const loaded: Contact[] = (data.contacts ?? []).map((c: any) => {
          const type: ContactType = normalizeContactType(c.type);
          const stage: Stage =
            (c.stage as Stage) && ["new", "warm", "hot", "past"].includes(c.stage)
              ? c.stage
              : "new";

          return {
            id: c.id,
            name: c.name ?? "",
            label: c.label ?? "",
            stage,
            type,
            priceRange: c.priceRange ?? "",
            areas: c.areas ?? "",
            timeline: c.timeline ?? "",
            source: (c.source ?? "").toString().toLowerCase(),
            email: c.email ?? "",
            phone: c.phone ?? "",
            notes: Array.isArray(c.notes) ? c.notes : [],
            linkedListings: Array.isArray(c.linkedListings)
              ? c.linkedListings
              : [],
          };
        });

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
            err?.message || "We couldn’t load your contacts. Try again in a moment."
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
        if (!cancelled) setListings([]);
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
    if (stageFilter !== "all") {
      list = list.filter((c) => c.stage === stageFilter);
    }

    // Role filter
    if (roleFilter === "buyers") {
      list = list.filter(
        (c) => c.type === "buyer" || c.type === "buyer & seller"
      );
    } else if (roleFilter === "sellers") {
      list = list.filter(
        (c) => c.type === "seller" || c.type === "buyer & seller"
      );
    }

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
  }, [contacts, stageFilter, roleFilter, search, selectedId, activeContact]);

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

  // Mobile: when a contact is selected, show workspace + scroll detail into view
  useEffect(() => {
    if (!isMobile()) {
      setWorkspaceOpenMobile(false);
      return;
    }

    if (!activeContact) {
      setWorkspaceOpenMobile(false);
      return;
    }

    setWorkspaceOpenMobile(true);
    scrollToWorkspace();
  }, [activeContact?.id, scrollToWorkspace]);

  // Desktop: keep selected contact in view inside the left scroll area
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) return;
    if (!selectedId || selectedId === "new") return;

    const container = listScrollRef.current;
    if (!container) return;

    const el = container.querySelector<HTMLElement>(
      `[data-contact-id="${selectedId}"]`
    );
    if (!el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    // Only move if it's actually outside the visible portion
    if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId, filteredContacts.length]);

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

    // On mobile, immediately show the workspace like Listings page
    if (isMobile()) {
      setWorkspaceOpenMobile(true);
      scrollToWorkspace();
    }
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
    field: "text" | "taskAt",
    value: string
  ) {
    setNoteDrafts((prev) => ({
      ...prev,
      [contactId]: {
        text: field === "text" ? value : prev[contactId]?.text ?? "",
        taskAt:
          field === "taskAt" ? value : prev[contactId]?.taskAt ?? "",
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
          taskAt: draft.taskAt || undefined,
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
        [contactId]: { text: "", taskAt: "" },
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

  async function handleSave(silent: boolean = false): Promise<Contact | null> {
    if (!activeContact) return null;

    const isMobileView =
      typeof window !== "undefined" && window.innerWidth < 1024;

    // --- MOBILE: scroll back *before* saving ---
    if (isMobileView && !silent) {
      backToListAndClearSelection();
    }

    try {
      setSaving(true);
      setError(null);

      const { firstName, lastName } = splitName(activeContact.name);

      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeContact.id,
          firstName: firstName ?? "",
          lastName: lastName ?? "",
          email: activeContact.email ?? "",
          phone: activeContact.phone ?? "",
          stage: activeContact.stage, 
          label: activeContact.label ?? "",
          type: activeContact.type ?? null,
          priceRange: activeContact.priceRange ?? "",
          areas: activeContact.areas ?? "",
          timeline: activeContact.timeline ?? "",
          source: activeContact.source ?? "",
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
        stage:
          (data.contact.stage as Stage) && ["new", "warm", "hot", "past"].includes(data.contact.stage)
            ? (data.contact.stage as Stage)
            : "new",
        type: normalizeContactType(data.contact.type),
        priceRange: data.contact.priceRange ?? "",
        areas: data.contact.areas ?? "",
        timeline: data.contact.timeline ?? "",
        source: (data.contact.source ?? "").toString().toLowerCase(),
        email: data.contact.email ?? "",
        phone: data.contact.phone ?? "",
        notes: Array.isArray(data.contact.notes) ? data.contact.notes : [],
        linkedListings: activeContact.linkedListings ?? [],
      };

      // Update local list
      setContacts((prev) => {
        const index = prev.findIndex((c) => c.id === saved.id);
        if (index === -1) return [saved, ...prev];
        const next = [...prev];
        next[index] = saved;
        return next;
      });

      // Desktop OR silent save keeps detail panel open
      if (!isMobileView || silent) {
        setSelectedId(saved.id!);
        setActiveContact(saved);
      }

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
      // Unsaved new contact
      setActiveContact(null);
      setSelectedId(contacts[0]?.id ?? null);

      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        backToListAndClearSelection();
      }
      return;
    }

    const confirmed = window.confirm(
      "Delete this contact from your CRM? This can’t be undone."
    );
    if (!confirmed) return;

    const isMobileView =
      typeof window !== "undefined" && window.innerWidth < 1024;

    // --- MOBILE: scroll back BEFORE deleting (fix the jump) ---
    if (isMobileView) {
      backToListAndClearSelection();
    }

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

      // Desktop fallback
      if (!isMobileView) {
        setActiveContact(remaining[0] ?? null);
        setSelectedId(remaining[0]?.id ?? null);
      }
    } catch (err: any) {
      console.error("Delete contact error", err);
      setError(
        err?.message || "We couldn’t delete this contact. Try again in a moment."
      );
    } finally {
      setDeleting(false);
    }
  }

  // Ensure a contact has an id before linking/unlinking listings
  async function ensureContactSaved(): Promise<Contact | null> {
    if (!activeContact) return null;
    if (activeContact.id) return activeContact;

    // Silent save: do NOT scroll back or clear the detail panel
    const saved = await handleSave(true);
    return saved;
  }

  // Refresh contacts after linking/unlinking so CRM & Listings stay in sync
  async function refreshContactsAndSelect(contactId: string) {
    try {
      const res = await fetch("/api/crm/contacts");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to reload contacts.");
      }
      const data = await res.json();
      const loaded: Contact[] = (data.contacts ?? []).map((c: any) => {
        const type: ContactType = normalizeContactType(c.type);
        const stage: Stage =
          (c.stage as Stage) && ["new", "warm", "hot", "past"].includes(c.stage)
            ? c.stage
            : "new";

        return {
          id: c.id,
          name: c.name ?? "",
          label: c.label ?? "",
          stage,
          type,
          priceRange: c.priceRange ?? "",
          areas: c.areas ?? "",
          timeline: c.timeline ?? "",
          source: (c.source ?? "").toString().toLowerCase(),
          email: c.email ?? "",
          phone: c.phone ?? "",
          notes: Array.isArray(c.notes) ? c.notes : [],
          linkedListings: Array.isArray(c.linkedListings)
            ? c.linkedListings
            : [],
        };
      });

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

  // Toggle listing link
  async function toggleListingLink(listingId: string) {
    try {
      const saved = await ensureContactSaved();
      if (!saved?.id) return;

      const relType: ContactType = saved.type ?? "buyer";

      const wantsSeller =
        relType === "seller" || relType === "buyer & seller";
      const wantsBuyer = relType === "buyer" || relType === "buyer & seller";

      if (!wantsSeller && !wantsBuyer) {
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

  // Unlink a specific role
  async function handleUnlinkListing(
    listingId: string,
    role: "buyer" | "seller"
  ) {
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

  /* ------------------------------------
   * Render
   * -----------------------------------*/

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="People"
        title="Pipeline & relationships"
        subtitle="Manage buyers, sellers, and past relationships — with notes, tasks, activity tracking, and listing context."
      />

      <section className="space-y-5">
        {/* Top bar: label + actions */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Contacts & opportunities
            </p>
            <p className="mt-1 max-w-xl text-xs text-[var(--avillo-cream-soft)]">
              Filter by contact type, stage, or search by name or area. Select a contact to view their overview and recent activity.
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
          <div className="flex flex-col gap-2">
            {/* Buyer / seller filter */}
            <div className="inline-flex flex-wrap gap-2 text-[11px]">
              <FilterPill
                label="All"
                active={roleFilter === "all"}
                onClick={() => setRoleFilter("all")}
                count={totalContacts || undefined}
              />
              <FilterPill
                label="Buyers"
                active={roleFilter === "buyers"}
                onClick={() => setRoleFilter("buyers")}
                count={buyersCount}
              />
              <FilterPill
                label="Sellers"
                active={roleFilter === "sellers"}
                onClick={() => setRoleFilter("sellers")}
                count={sellersCount}
              />
            </div>

            {/* Stage filter */}
            <div className="inline-flex flex-wrap gap-2 text-xs">
              <FilterPill
                label="New"
                active={stageFilter === "new"}
                badgeColor="new"
                onClick={() => handleStageFilterClick("new")}
              />
              <FilterPill
                label="Warm"
                active={stageFilter === "warm"}
                badgeColor="warm"
                onClick={() => handleStageFilterClick("warm")}
              />
              <FilterPill
                label="Hot"
                active={stageFilter === "hot"}
                badgeColor="hot"
                onClick={() => handleStageFilterClick("hot")}
              />
              <FilterPill
                label="Past / sphere"
                active={stageFilter === "past"}
                badgeColor="past"
                onClick={() => handleStageFilterClick("past")}
              />
            </div>
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
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)]">
          {/* LEFT: CONTACT LIST */}
          <div
            ref={listHeaderRef}
            className={
              "relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "hidden" : "block") +
              " lg:block lg:flex lg:flex-col lg:max-h-[calc(100vh-200px)]"
            }
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

            {/* Scroll wrapper for the contact list */}
            <div
              ref={listScrollRef}
              className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1"
            >
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
                  const isBuyer = relType === "buyer";
                  const isSeller = relType === "seller";

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
                      data-contact-id={contact.id ?? "new"}
                      onClick={() => {
                        setSelectedId(contact.id ?? ("new" as const));
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
                          {prettyContactType(contact.type)}
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
                        Source: {prettySource(contact.source)}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* RIGHT: DETAIL PANEL */}
<div
  ref={workspaceRef as any}
  className={
    "relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
    (workspaceOpenMobile ? "block" : "hidden") +
    " lg:block lg:flex lg:flex-col lg:max-h-[calc(100vh-200px)]"
  }
>
  <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

  {/* Scrollable detail content */}
  <div className="flex-1 overflow-y-auto">
    {!activeContact && (
      <div className="flex h-full flex-col items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
        <p className="font-semibold text-[var(--avillo-cream-soft)]">
          No contact selected
        </p>
        <p className="mt-1 max-w-xs">
          Choose a contact from the list to see details and add notes — or click
          “Add contact” to start new.
        </p>
      </div>
    )}

    {activeContact && (
      <div className="space-y-4 text-xs text-[var(--avillo-cream-soft)]">
        {/* Mobile Back Button */}
        <div className="relative mb-2 lg:hidden">
          <button
            type="button"
            onClick={backToListAndClearSelection}
            className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-[var(--avillo-cream-soft)] shadow-[0_0_18px_rgba(15,23,42,0.9)] hover:border-amber-100/80 hover:text-amber-50 hover:bg-slate-900/95"
          >
            <span className="text-xs">←</span>
            <span>Back</span>
          </button>
        </div>
        <div className="h-3 lg:hidden" />

        {/* Header: Contact name + lead status */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Contact name
            </label>
            <input
              value={activeContact.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
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

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={
              "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] " +
              (activeTab === "overview"
                ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.32)]"
                : "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50")
            }
          >
            Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={
              "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] " +
              (activeTab === "activity"
                ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.32)]"
                : "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50")
            }
          >
            Activity
          </button>
        </div>

        {/* ----------------------------
            OVERVIEW TAB
        ---------------------------- */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Relationship type */}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Relationship type
              </p>
              <div className="inline-flex flex-wrap gap-2">
                <RoleToggle
                  label="Buyer"
                  active={activeContact.type === "buyer"}
                  onClick={() => handleFieldChange("type", "buyer")}
                />
                <RoleToggle
                  label="Seller"
                  active={activeContact.type === "seller"}
                  onClick={() => handleFieldChange("type", "seller")}
                />
                <RoleToggle
                  label="Buyer & Seller"
                  active={activeContact.type === "buyer & seller"}
                  onClick={() => handleFieldChange("type", "buyer & seller")}
                />
              </div>
            </div>

            {/* Quick stats row 1: price / budget + address/areas */}
            {(() => {
              const relType = activeContact.type;
              const isBuyerOnly = relType === "buyer";

              const priceLabel =
                relType === "buyer"
                  ? "Budget"
                  : relType === "seller"
                  ? "Price"
                  : "Price / budget";

              const pricePlaceholder =
                relType === "buyer"
                  ? "Ex: $650K–$750K"
                  : relType === "seller"
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

              <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                  Source
                </p>

                <select
                  value={activeContact.source || ""}
                  onChange={(e) => handleFieldChange("source", e.target.value)}
                  className="mt-0.5 w-full border-none bg-transparent pt-0.5 text-[11px] text-slate-50 outline-none"
                >
                  <option value="" disabled>
                    Select source…
                  </option>
                  {CONTACT_SOURCE_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      className="bg-slate-900 text-slate-50"
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
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

            {/* Linked listings summary */}
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
                        <span className="max-w-[160px] truncate sm:max-w-[220px]">
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
                          onClick={() => handleUnlinkListing(l.id, l.role)}
                          className="rounded-full border border-slate-700/80 bg-slate-900/80 px-1.5 text-[9px] leading-none text-[var(--avillo-cream-muted)] hover:border-rose-400/80 hover:bg-rose-900/50 hover:text-rose-50"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* Tag to listing */}
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
                    <span className="font-semibold">buyer, seller, or both</span>{" "}
                    based on the relationship type above.
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {listings.map((l) => {
                      const relType: ContactType = activeContact.type ?? "buyer";
                      const wantsSeller =
                        relType === "seller" || relType === "buyer & seller";
                      const wantsBuyer =
                        relType === "buyer" || relType === "buyer & seller";

                      const links = activeContact.linkedListings ?? [];
                      const linkedAsSeller = links.some(
                        (link) => link.id === l.id && link.role === "seller"
                      );
                      const linkedAsBuyer = links.some(
                        (link) => link.id === l.id && link.role === "buyer"
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
          </div>
        )}

        {/* ----------------------------
            ACTIVITY TAB
        ---------------------------- */}
        {activeTab === "activity" && (
          <div className="space-y-4">
 {/* ✅ NEW: Autopilot activity card (above Notes & tasks) */}
    <AutopilotActivityCard
  loading={autopilotLoading}
  items={autopilotItems}
  tasks={autopilotTasks}
  expandedRuns={expandedRuns}
  setExpandedRuns={setExpandedRuns}
/>

    {/* Notes & tasks */}
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
      <p className="text-[11px] font-semibold text-amber-100/90">Notes & tasks</p>

      {!activeContact.id ? (
        <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
          Save this contact first, then you’ll be able to log notes and create tasks tied to your
          dashboard.
        </p>
      ) : (
        <>
          {/* Existing notes */}
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {(activeContact.notes ?? []).length === 0 && (
              <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">
                No notes yet. Log your first touchpoint below.
              </p>
            )}

            {activeContact.notes
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
              .map((note) => (
                <div
                  key={note.id}
                  className="rounded-md border border-slate-800/80 bg-slate-900/60 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      {new Date(note.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>

                    {note.taskAt && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        Task{" "}
                        {new Date(note.taskAt).toLocaleString(undefined, {
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
              value={activeContact.id ? noteDrafts[activeContact.id]?.text ?? "" : ""}
              onChange={(e) =>
                activeContact.id &&
                updateNoteDraft(activeContact.id, "text", e.target.value)
              }
              placeholder="Log a quick note, call summary, or next steps…"
              className="w-full resize-none rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-[10px] text-[var(--avillo-cream-muted)]">
                Set to create a Task:
                <input
                  type="datetime-local"
                  value={activeContact.id ? noteDrafts[activeContact.id]?.taskAt ?? "" : ""}
                  onChange={(e) =>
                    activeContact.id &&
                    updateNoteDraft(activeContact.id, "taskAt", e.target.value)
                  }
                  className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-50 outline-none focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
                />
              </label>

              <button
                type="button"
                onClick={() => activeContact.id && handleAddNote(activeContact.id)}
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
  </div>
)}

        {/* Footer buttons — match Listings */}
        <div className="flex items-center justify-between gap-3 pb-1">
          {/* Delete contact */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-full border border-red-400/80 bg-red-500/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete Contact
          </button>

          {/* Save contact */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------
 * Small components & helpers
 * -----------------------------------*/

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

function AutopilotActivityCard({
  loading,
  items,
  tasks,
  expandedRuns,
  setExpandedRuns,
}: {
  loading: boolean;
  items: any[];
  tasks: any[];
  expandedRuns: Record<string, boolean>;
  setExpandedRuns: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const hasRuns = Array.isArray(items) && items.length > 0;
  const hasTasks = Array.isArray(tasks) && tasks.length > 0;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-amber-100/90">
            Autopilot activity
          </p>
          <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
            When automations run on this contact, you’ll see it logged here.
          </p>
        </div>
      </div>

      {loading && (
        <p className="mt-3 text-[11px] text-[var(--avillo-cream-muted)]">
          Loading Autopilot activity…
        </p>
      )}

      {!loading && !hasRuns && !hasTasks && (
        <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
          <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">
            No Autopilot activity yet for this contact.
          </p>
          <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
            Once an automation runs with this contact, it will appear here.
          </p>
        </div>
      )}

      {!loading && hasRuns && (
  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
    {(items ?? []).slice(0, 50).map((run: any) => {
            const runId = String(
              run?.id ?? run?.runId ?? `${run?.automationName ?? "run"}-${run?.executedAt ?? ""}`
            );
            const expanded = !!expandedRuns[runId];

            const statusRaw = String(run?.status ?? "").toUpperCase();
            const ok =
              statusRaw === "SUCCESS" ||
              statusRaw === "OK" ||
              statusRaw === "COMPLETED";

            const steps = Array.isArray(run?.steps) ? run.steps : [];
            const totalSteps =
              typeof run?.totalSteps === "number" ? run.totalSteps : steps.length;

            const failedSteps =
              typeof run?.failedSteps === "number"
                ? run.failedSteps
                : steps.filter((s: any) => String(s?.status ?? "").toUpperCase() === "FAILED").length;

            const executedAt = run?.executedAt ? new Date(run.executedAt) : null;

            return (
              <div
                key={runId}
                className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-slate-50">
                      {run?.automationName || run?.name || "Automation run"}
                    </p>

                    <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                      {executedAt
                        ? executedAt.toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Logged activity"}
                      {totalSteps ? (
                        <>
                          {" "}
                          • {totalSteps} step{totalSteps === 1 ? "" : "s"}
                          {failedSteps ? ` • ${failedSteps} failed` : ""}
                        </>
                      ) : null}
                    </p>

                    {run?.message ? (
                      <p className="mt-1 line-clamp-1 text-[10px] text-[var(--avillo-cream-soft)]">
                        {run.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={
                        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                        (ok
                          ? "border-emerald-200/70 bg-emerald-500/10 text-emerald-100"
                          : "border-amber-200/70 bg-amber-500/10 text-amber-100")
                      }
                    >
                      {ok ? "Success" : statusRaw ? statusRaw.toLowerCase() : "Logged"}
                    </span>

                    {steps.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }))
                        }
                        className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50"
                      >
                        {expanded ? "Hide steps" : "View steps"}
                      </button>
                    )}
                  </div>
                </div>

                {expanded && steps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {steps.slice(0, 2).map((s: any, idx: number) => {
                      const label =
                        s?.label ||
                        s?.name ||
                        s?.stepType ||
                        s?.type ||
                        `Step ${idx + 1}`;
                      const msg = s?.message || s?.summary || "";
                      return (
                        <div
                          key={`${runId}-step-${idx}`}
                          className="rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5"
                        >
                          <p className="text-[10px] font-semibold text-slate-50">
                            {String(label)}
                          </p>
                          {msg ? (
                            <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                              {String(msg)}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}

                    {steps.length > 2 && (
                      <p className="pt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                        +{steps.length - 2} more step{steps.length - 2 === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && hasTasks && (
        <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
            Tasks created by Autopilot
          </p>

          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
            {(tasks ?? []).slice(0, 3).map((t: any) => (
              <div
                key={String(t?.id ?? Math.random())}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-slate-50">
                    {t?.title || "Task"}
                  </p>
                  {(t?.dueAt || t?.createdAt) && (
                    <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                      {t?.dueAt
                        ? `Due ${new Date(t.dueAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : `Created ${new Date(t.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`}
                    </p>
                  )}
                </div>

                <span className="shrink-0 rounded-full border border-amber-200/70 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                  {String(t?.status || "OPEN").toLowerCase()}
                </span>
              </div>
            ))}

            {(tasks ?? []).length > 3 && (
              <p className="pt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                +{(tasks ?? []).length - 3} more task{(tasks ?? []).length - 3 === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}