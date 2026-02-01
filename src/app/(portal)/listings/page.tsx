//app/(portal)/listings/page.tsx
"use client";
import type React from "react";
import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import PageHeader from "@/components/layout/page-header";
import { createClient } from "@supabase/supabase-js";
import { useListingsMobileWorkspaceScroll } from "@/hooks/useListingsMobileWorkspaceScroll";
import { FilterPill } from "@/components/ui/filter-pill";
import ListingPins from "@/components/listings/pins";
import ListingAutopilotActivityCard from "@/components/listings/listing-autopilot-activity-card";
import ListingNotesTasksCard from "@/components/listings/listing-notes-tasks-card";
import { avilloTabPillClass } from "@/components/ui/tabPills";

/* ------------------------------------
 * Types
 * -----------------------------------*/
type ListingStatus = "draft" | "active" | "pending" | "closed";

type ListingPhoto = {
  id?: string;
  url: string;
  isCover?: boolean;
  sortOrder?: number;
};

type ListingRow = {
  id: string;
  address: string;
  mlsId?: string | null;
  price?: number | null;
  status: ListingStatus | string;
  createdAt?: string | null;
  updatedAt?: string | null;
  sellerName?: string | null;
  buyerCount?: number;
  coverPhotoUrl?: string | null;
};

type ListingDetail = {
  id: string;
  address: string;
  mlsId?: string | null;
  price?: number | null;
  status: ListingStatus | string;
  description?: string | null;
  aiCopy?: string | null;
  aiNotes?: string | null;
  sellerContactId?: string | null;
  buyers?: { contactId: string; role?: string | null }[];
  photos?: ListingPhoto[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ContactOption = {
  id: string;
  name: string;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
};

/* ------------------------------------
 * Supabase client helper
 * -----------------------------------*/
const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
    : null;

/* ------------------------------------
 * Initial form state
 * -----------------------------------*/
const INITIAL_FORM: {
  id?: string;
  address: string;
  mlsId: string;
  price: string;
  status: ListingStatus | string;
  description: string;
  sellerContactId: string;
  buyers: { contactId: string; role?: string | null }[];
} = {
  id: undefined,
  address: "",
  mlsId: "",
  price: "",
  status: "draft",
  description: "",
  sellerContactId: "",
  buyers: [],
};

/* ------------------------------------
 * Page
 * -----------------------------------*/
export default function ListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | ListingStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

  // form for the workspace
  const [form, setForm] = useState<typeof INITIAL_FORM>(INITIAL_FORM);

  // contacts for selectors
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  // listingId -> photos
  const [photoState, setPhotoState] = useState<Record<string, ListingPhoto[]>>(
    {}
  );

  // slideshow index for each listing in gallery
  const [galleryIndexByListing, setGalleryIndexByListing] = useState<
    Record<string, number>
  >({});

  // full listing details from API
  const [listingDetails, setListingDetails] = useState<
    Record<string, ListingDetail>
  >({});

  // mobile workspace toggle (always visible on md+)
  const [workspaceOpenMobile, setWorkspaceOpenMobile] = useState(false);

  /* ------------------------------------
   * Workspace tabs (Overview | Activity | Pins)
   * -----------------------------------*/
  type WorkspaceTab = "overview" | "activity" | "pins";
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");

  type ListingNote = {
    id: string;
    text: string;
    createdAt: string; // ISO
    taskAt: string | null; // ISO | null
  };

  const [notesByListingId, setNotesByListingId] = useState<Record<string, ListingNote[]>>({});
  const [notesLoadedFor, setNotesLoadedFor] = useState<Record<string, boolean>>({});

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth < 1024;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // NEW: scroll container for the gallery list (desktop)
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  // centralized mobile scroll behaviour
  const {
    workspaceRef,
    captureListScrollY,
    scrollToWorkspaceTop,
    scrollBackToLastListPosition,
  } = useListingsMobileWorkspaceScroll();

  useEffect(() => {
    if (!isMobile()) return;
    if (!workspaceOpenMobile) return;
    scrollToWorkspaceTop();
  }, [workspaceOpenMobile, scrollToWorkspaceTop]);

  /* ------------------------------------
   * Load listings
   * -----------------------------------*/
  useEffect(() => {
    let cancelled = false;

    async function loadListings() {
      try {
        setLoadingList(true);
        setError(null);

        const res = await fetch("/api/listings", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to load listings.");
        }

        const data = (await res.json()) as {
          listings?: any[];
        };

        const apiListings = data.listings ?? [];
        if (cancelled) return;

        // details map
        const detailsMap: Record<string, ListingDetail> = {};
        apiListings.forEach((l: any) => {
          detailsMap[l.id] = {
            id: l.id,
            address: l.address,
            mlsId: l.mlsId ?? null,
            price: typeof l.price === "number" ? l.price : null,
            status: l.status,
            description: l.description ?? "",
            aiCopy: l.aiCopy ?? null,
            aiNotes: l.aiNotes ?? null,
            sellerContactId: l.seller?.id ?? l.sellerContactId ?? "",
            buyers: Array.isArray(l.buyers)
              ? l.buyers
                  .map((b: any) => ({
                    contactId: b.contactId ?? b.contact?.id ?? "",
                    role: b.role ?? null,
                  }))
                  .filter((b: any) => b.contactId)
              : [],
            photos: Array.isArray(l.photos)
              ? l.photos.map((p: any, index: number) => ({
                  id: p.id,
                  url: p.url,
                  isCover: p.isCover,
                  sortOrder:
                    typeof p.sortOrder === "number" ? p.sortOrder : index,
                }))
              : [],
            createdAt: l.createdAt ?? null,
            updatedAt: l.updatedAt ?? null,
          };
        });

        const rows: ListingRow[] = apiListings.map((l: any) => {
          const cover =
            Array.isArray(l.photos) && l.photos.length > 0
              ? l.photos.find((p: any) => p.isCover) ?? l.photos[0]
              : null;

          return {
            id: l.id,
            address: l.address,
            mlsId: l.mlsId ?? null,
            price: typeof l.price === "number" ? l.price : null,
            status: l.status,
            createdAt: l.createdAt ?? null,
            updatedAt: l.updatedAt ?? null,
            sellerName: l.seller?.name ?? null,
            buyerCount: Array.isArray(l.buyers) ? l.buyers.length : 0,
            coverPhotoUrl: cover ? cover.url : null,
          };
        });

        const initialPhotos: Record<string, ListingPhoto[]> = {};
        apiListings.forEach((l: any) => {
          initialPhotos[l.id] = Array.isArray(l.photos)
            ? l.photos.map((p: any, index: number) => ({
                id: p.id,
                url: p.url,
                isCover: p.isCover,
                sortOrder:
                  typeof p.sortOrder === "number" ? p.sortOrder : index,
              }))
            : [];
        });

        setListings(rows);
        setPhotoState(initialPhotos);
        setListingDetails(detailsMap);
        setSelectedId(null);
        setForm(INITIAL_FORM);
      } catch (err: any) {
        console.error("load listings error", err);
        if (!cancelled) {
          setError(
            err?.message ||
              "We couldn’t load your listings. Try again or contact support@avillo.io."
          );
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    loadListings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function prefetchListingNotes(listingId: string) {
  if (notesLoadedFor[listingId]) return;

  try {
    const res = await fetch(`/api/listings/${listingId}/activity`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) return;

    const data = (await res.json()) as { items?: any[] };
    const items = Array.isArray(data.items) ? data.items : [];

    const notes: ListingNote[] = items
      .filter((it) => it?.kind === "note" && it?.meta?.noteId)
      .map((it) => ({
        id: String(it.meta.noteId),
        text: String(it.subtitle ?? ""),
        createdAt: String(it.at),
        taskAt: it?.meta?.taskAt ? String(it.meta.taskAt) : null,
      }));

    setNotesByListingId((prev) => ({ ...prev, [listingId]: notes }));
    setNotesLoadedFor((prev) => ({ ...prev, [listingId]: true }));
  } catch {
    // best-effort
  }
}

  /* ------------------------------------
   * Load CRM contacts
   * -----------------------------------*/
  useEffect(() => {
    let cancelled = false;

    async function loadContacts() {
      try {
        setContactsLoading(true);
        setContactsError(null);

        const res = await fetch("/api/crm/contacts", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to load contacts.");
        }

        const data = (await res.json()) as {
          contacts?: any[];
        };

        if (cancelled) return;

        const mapped: ContactOption[] = (data.contacts ?? []).map((c) => ({
          id: c.id,
          name: c.name ?? "Unnamed contact",
          type: c.clientRole ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
        }));
        setContacts(mapped);
      } catch (err: any) {
        console.error("load contacts error", err);
        if (!cancelled) {
          setContactsError(
            err?.message ||
              "We couldn’t load your CRM contacts. Searchable selectors may be limited."
          );
        }
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    }

    loadContacts();
    return () => {
      cancelled = true;
    };
  }, []);


  /* ------------------------------------
   * Helpers
   * -----------------------------------*/
  function hydrateFormFromApi(l: any) {
    setForm({
      id: l.id,
      address: l.address ?? "",
      mlsId: l.mlsId ?? "",
      price: formatPriceDisplay(l.price),
      status: (l.status as ListingStatus) ?? "draft",
      description: l.description ?? "",
      sellerContactId: l.seller?.id ?? l.sellerContactId ?? "",
      buyers: Array.isArray(l.buyers)
        ? l.buyers
            .map((b: any) => ({
              contactId: b.contactId ?? b.contact?.id ?? "",
              role: b.role ?? null,
            }))
            .filter((b: any) => b.contactId)
        : [],
    });

    if (Array.isArray(l.photos)) {
      setPhotoState((prev) => ({
        ...prev,
        [l.id]: l.photos.map((p: any, index: number) => ({
          id: p.id,
          url: p.url,
          isCover: p.isCover,
          sortOrder: typeof p.sortOrder === "number" ? p.sortOrder : index,
        })),
      }));
    }
  }

  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (statusFilter !== "all") {
        if ((l.status as ListingStatus) !== statusFilter) return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        l.address.toLowerCase().includes(q) ||
        (l.mlsId ?? "").toLowerCase().includes(q)
      );
    });
  }, [listings, statusFilter, search]);

  /* ------------------------------------
   * Desktop: keep selected listing card in view
   * -----------------------------------*/
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) return;
    if (!selectedId) return;

    const container = listScrollRef.current;
    if (!container) return;

    const el = container.querySelector<HTMLElement>(
      `[data-listing-id="${selectedId}"]`
    );
    if (!el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest"});
    }
  }, [selectedId, filteredListings.length]);

  // Track previous listing selection so we only reset tabs when the listing changes.
  const prevListingIdRef = useRef<string | null>(null);

  const [activityRefreshNonce, setActivityRefreshNonce] = useState(0);
  
  useEffect(() => {
    const current = form.id || selectedId || null;

    // If nothing is selected, always reset
    if (!current) {
      prevListingIdRef.current = null;
      setActiveTab("overview");
      return;
    }

    // If selection changed (different listing), reset to Overview
    if (prevListingIdRef.current !== current) {
      prevListingIdRef.current = current;
      setActiveTab("overview");
    }
  }, [form.id, selectedId]);

  function onFormChange<K extends keyof typeof form>(key: K, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function formatPriceDisplay(value?: number | null): string {
    if (typeof value !== "number" || Number.isNaN(value)) return "";
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function handlePriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^0-9]/g, "");
    if (!cleaned) {
      onFormChange("price", "");
      return;
    }
    const numeric = Number(cleaned);
    const formatted = numeric.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
    onFormChange("price", formatted);
  }

  function statusLabel(status: ListingStatus | string): string {
    switch (status) {
      case "draft":
        return "Draft";
      case "active":
        return "Active";
      case "pending":
        return "Pending";
      case "closed":
        return "Closed";
      default:
        return String(status || "Draft");
    }
  }

  function statusBadgeClass(status: ListingStatus | string): string {
    switch (status) {
      case "draft":
        return "border-slate-500/80 bg-slate-800/60 text-slate-200";
      case "active":
        return "border-emerald-300/80 bg-emerald-500/10 text-emerald-100";
      case "pending":
        return "border-amber-300/80 bg-amber-500/10 text-amber-100";
      case "closed":
        return "border-sky-300/80 bg-sky-500/10 text-sky-100";
      default:
        return "border-slate-600/80 bg-slate-900/70 text-slate-200";
    }
  }

  // nicer status select styling in workspace
  function statusSelectClass(status: ListingStatus | string): string {
    const base = "avillo-input w-full bg-[rgba(15,23,42,0.9)]";
    switch (status) {
      case "active":
        return base + " border-emerald-300/80 text-emerald-100 bg-emerald-500/5";
      case "pending":
        return base + " border-amber-300/80 text-amber-100 bg-amber-500/5";
      case "closed":
        return base + " border-sky-300/80 text-sky-100 bg-sky-500/5";
      case "draft":
        return base + " border-slate-600/80 text-slate-100";
      default:
        return (
          base + " border-slate-700/80 text-[var(--avillo-cream-soft)]"
        );
    }
  }

  const total = listings.length;
  const activeCount = listings.filter((l) => l.status === "active").length;
  const pendingCount = listings.filter((l) => l.status === "pending").length;
  const closedCount = listings.filter((l) => l.status === "closed").length;
  const draftCount = listings.filter((l) => l.status === "draft").length;

  const statusCounts = {
    all: total,
    active: activeCount,
    pending: pendingCount,
    closed: closedCount,
    draft: draftCount,
  };

  const sellerOptions = useMemo(() => {
    return contacts.filter((c) => {
      const role = (c.type ?? "").toLowerCase();
      return role === "seller" || role === "both";
    });
  }, [contacts]);

  const buyerOptions = useMemo(() => {
    return contacts.filter((c) => {
      const role = (c.type ?? "").toLowerCase();
      return role === "buyer" || role === "both";
    });
  }, [contacts]);

  const selectedBuyers = useMemo(() => {
    const ids = new Set(form.buyers.map((b) => b.contactId));
    return buyerOptions.filter((b) => ids.has(b.id));
  }, [buyerOptions, form.buyers]);

  const selectedSeller =
    sellerOptions.find((c) => c.id === form.sellerContactId) ?? null;

  /* ------------------------------------
   * Photo helpers (Supabase)
   * -----------------------------------*/
  async function uploadFilesToSupabase(listingId: string, files: FileList) {
    if (!supabase) {
      console.warn("Supabase not configured – cannot upload images.");
      return;
    }

    const bucket = "listing-photos";
    const uploaded: ListingPhoto[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${listingId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false });

      if (uploadError) {
        console.error("Supabase upload error", uploadError);
        continue;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = data.publicUrl;

      uploaded.push({
        url: publicUrl,
        isCover: false,
      });
    }

    if (uploaded.length === 0) return;

    setPhotoState((prev) => {
      const current = prev[listingId] ?? [];
      const merged = [...current, ...uploaded];
      if (!merged.some((p) => p.isCover) && merged.length > 0) {
        merged[0] = { ...merged[0], isCover: true };
      }
      return {
        ...prev,
        [listingId]: merged.map((p, index) => ({
          ...p,
          sortOrder:
            typeof p.sortOrder === "number" ? p.sortOrder : index,
        })),
      };
    });
  }

  function handleSelectFiles(
    e: React.ChangeEvent<HTMLInputElement>,
    listingId?: string
  ) {
    const targetListingId = listingId || form.id || selectedId;
    if (!targetListingId || !e.target.files || e.target.files.length === 0)
      return;
    void uploadFilesToSupabase(targetListingId, e.target.files);
    e.target.value = "";
  }

  function handleDropFiles(
    e: React.DragEvent<HTMLElement>,
    listingId?: string
  ) {
    e.preventDefault();
    const targetListingId = listingId || form.id || selectedId;
    if (
      !targetListingId ||
      !e.dataTransfer.files ||
      e.dataTransfer.files.length === 0
    )
      return;
    void uploadFilesToSupabase(targetListingId, e.dataTransfer.files);
  }

  function removePhoto(listingId: string, url: string) {
    setPhotoState((prev) => {
      const current = prev[listingId] ?? [];
      const filtered = current.filter((p) => p.url !== url);
      if (filtered.length > 0 && !filtered.some((p) => p.isCover)) {
        filtered[0] = { ...filtered[0], isCover: true };
      }
      return {
        ...prev,
        [listingId]: filtered.map((p, index) => ({
          ...p,
          sortOrder: index,
        })),
      };
    });
  }

  function setCoverPhoto(listingId: string, url: string) {
    setPhotoState((prev) => {
      const current = prev[listingId] ?? [];
      const updated = current.map((p, index) => ({
        ...p,
        isCover: p.url === url,
        sortOrder:
          typeof p.sortOrder === "number" ? p.sortOrder : index,
      }));
      return {
        ...prev,
        [listingId]: updated,
      };
    });
  }

  /* ------------------------------------
   * Gallery slideshow helpers
   * -----------------------------------*/
  function getPhotosForListingCard(row: ListingRow): ListingPhoto[] {
    const fromState = photoState[row.id];
    if (fromState && fromState.length > 0) return fromState;
    return row.coverPhotoUrl
      ? [
          {
            url: row.coverPhotoUrl,
            isCover: true,
            sortOrder: 0,
          },
        ]
      : [];
  }

  function getCurrentCardPhotoUrl(row: ListingRow): string | null {
    const photos = getPhotosForListingCard(row);
    if (photos.length === 0) return null;

    const coverIndex =
      photos.findIndex((p) => p.isCover) >= 0
        ? photos.findIndex((p) => p.isCover)
        : 0;
    const rawIndex = galleryIndexByListing[row.id] ?? coverIndex;
    const clamped = Math.max(0, Math.min(rawIndex, photos.length - 1));
    return photos[clamped]?.url ?? null;
  }

  function showPrevPhoto(listingId: string) {
    setGalleryIndexByListing((prev) => {
      const photos = photoState[listingId] ?? [];
      if (photos.length <= 1) return prev;
      const coverIndex =
        photos.findIndex((p) => p.isCover) >= 0
          ? photos.findIndex((p) => p.isCover)
          : 0;
      const current = prev[listingId] ?? coverIndex;
      const next = (current - 1 + photos.length) % photos.length;
      return {
        ...prev,
        [listingId]: next,
      };
    });
  }

  function showNextPhoto(listingId: string) {
    setGalleryIndexByListing((prev) => {
      const photos = photoState[listingId] ?? [];
      if (photos.length <= 1) return prev;
      const coverIndex =
        photos.findIndex((p) => p.isCover) >= 0
          ? photos.findIndex((p) => p.isCover)
          : 0;
      const current = prev[listingId] ?? coverIndex;
      const next = (current + 1) % photos.length;
      return {
        ...prev,
        [listingId]: next,
      };
    });
  }

  /* ------------------------------------
   * Buyer toggle
   * -----------------------------------*/
  function toggleBuyer(contactId: string) {
    setForm((prev) => {
      const exists = prev.buyers.some((b) => b.contactId === contactId);
      if (exists) {
        return {
          ...prev,
          buyers: prev.buyers.filter((b) => b.contactId !== contactId),
        };
      }
      return {
        ...prev,
        buyers: [...prev.buyers, { contactId }],
      };
    });
  }

  /* ------------------------------------
   * New listing
   * -----------------------------------*/
  async function handleNewListingClick() {
    captureListScrollY();

    setCreatingNew(true);
    try {
      const res = await fetch("/api/listings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing: {
            address: "New listing",
            status: "draft",
            description: "",
            mlsId: null,
            price: null,
            aiCopy: null,
            aiNotes: null,
            photos: [],
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create listing.");
      }

      const { listing: saved } = (await res.json()) as { listing: any };

      const savedSellerContactId =
        saved.sellerContactId ?? saved.seller?.id ?? "";

      const newRow: ListingRow = {
        id: saved.id,
        address: saved.address,
        mlsId: saved.mlsId ?? null,
        price: typeof saved.price === "number" ? saved.price : null,
        status: saved.status,
        createdAt: saved.createdAt ?? null,
        updatedAt: saved.updatedAt ?? null,
        sellerName: saved.seller?.name ?? null,
        buyerCount: Array.isArray(saved.buyers) ? saved.buyers.length : 0,
        coverPhotoUrl:
          (saved.photos ?? []).find((p: any) => p.isCover)?.url ??
          (saved.photos ?? [])[0]?.url ??
          null,
      };

      const normalizedPhotos: ListingPhoto[] = Array.isArray(saved.photos)
        ? saved.photos.map((p: any, index: number) => ({
            id: p.id,
            url: p.url,
            isCover: p.isCover,
            sortOrder:
              typeof p.sortOrder === "number" ? p.sortOrder : index,
          }))
        : [];

      setListings((prev) => [newRow, ...prev]);
      setSelectedId(saved.id);
      setWorkspaceOpenMobile(true);

      setForm({
        id: saved.id,
        address: saved.address ?? "New listing",
        mlsId: saved.mlsId ?? "",
        price: formatPriceDisplay(saved.price),
        status: (saved.status as ListingStatus) ?? "draft",
        description: saved.description ?? "",
        sellerContactId: savedSellerContactId,
        buyers: Array.isArray(saved.buyers)
          ? saved.buyers
              .map((b: any) => ({
                contactId: b.contactId ?? b.contact?.id ?? "",
                role: b.role ?? null,
              }))
              .filter((b: any) => b.contactId)
          : [],
      });

      setPhotoState((prev) => ({
        ...prev,
        [saved.id]: normalizedPhotos,
      }));

      setListingDetails((prev) => ({
        ...prev,
        [saved.id]: {
          id: saved.id,
          address: saved.address,
          mlsId: saved.mlsId ?? null,
          price: typeof saved.price === "number" ? saved.price : null,
          status: saved.status,
          description: saved.description ?? "",
          aiCopy: saved.aiCopy ?? null,
          aiNotes: saved.aiNotes ?? null,
          sellerContactId: savedSellerContactId,
          buyers: Array.isArray(saved.buyers)
            ? saved.buyers
                .map((b: any) => ({
                  contactId: b.contactId ?? b.contact?.id ?? "",
                  role: b.role ?? null,
                }))
                .filter((b: any) => b.contactId)
            : [],
          photos: normalizedPhotos,
          createdAt: saved.createdAt ?? null,
          updatedAt: saved.updatedAt ?? null,
        },
      }));

      setGalleryIndexByListing((prev) => ({
        ...prev,
        [saved.id]: 0,
      }));
    } catch (err) {
      console.error("New listing error", err);
    } finally {
      setCreatingNew(false);
    }
  }

  /* ------------------------------------
   * Save listing (with contact sync)
   * -----------------------------------*/
  async function handleSaveListing(opts?: { keepWorkspaceOpen?: boolean }) {
    if (!form.id) return;

    const isMobileView =
      typeof window !== "undefined" && window.innerWidth < 1024;

    if (isMobileView && !opts?.keepWorkspaceOpen) {
      setSelectedId(null);
      setWorkspaceOpenMobile(false);
      scrollBackToLastListPosition();
    }

    setSaving(true);
    setError(null);

    try {
      const listingId = form.id;
      const prevDetail = listingDetails[listingId];
      const prevSellerId = prevDetail?.sellerContactId || null;
      const prevBuyerIds = new Set(
        (prevDetail?.buyers ?? []).map((b) => b.contactId)
      );

      const newSellerId = form.sellerContactId || null;
      const newBuyerIdsArray = (form.buyers ?? []).map((b) => b.contactId);
      const newBuyerIds = new Set(newBuyerIdsArray);
      const photosForListing = photoState[listingId] ?? [];

      const payload = {
        id: listingId,
        address: form.address.trim() || "Untitled listing",
        mlsId: form.mlsId || null,
        price: form.price.trim()
          ? Number(form.price.trim().replace(/[^0-9.]/g, "")) || null
          : null,
        status: (form.status as ListingStatus) || "draft",
        description: form.description || null,
        aiCopy: null,
        aiNotes: null,
        photos: photosForListing.map((p, index) => ({
          url: p.url,
          isCover: !!p.isCover,
          sortOrder:
            typeof p.sortOrder === "number" ? p.sortOrder : index,
        })),
      };

      const res = await fetch("/api/listings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing: payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save listing.");
      }

      const { listing: saved } = (await res.json()) as { listing: any };

      const normalizedPhotos: ListingPhoto[] = Array.isArray(saved.photos)
        ? saved.photos.map((p: any, index: number) => ({
            id: p.id,
            url: p.url,
            isCover: p.isCover,
            sortOrder:
              typeof p.sortOrder === "number" ? p.sortOrder : index,
          }))
        : [];

      setPhotoState((prev) => ({
        ...prev,
        [saved.id]: normalizedPhotos,
      }));

      const contactSyncOps: Promise<any>[] = [];

      if (prevSellerId !== newSellerId) {
        if (prevSellerId) {
          contactSyncOps.push(
            fetch("/api/listings/unlink-contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId: saved.id,
                contactId: prevSellerId,
                role: "seller",
              }),
            }).catch((err) =>
              console.error("unlink seller contact error", err)
            )
          );
        }
        if (newSellerId) {
          contactSyncOps.push(
            fetch("/api/listings/assign-contact", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId: saved.id,
                contactId: newSellerId,
                role: "seller",
              }),
            }).catch((err) =>
              console.error("assign seller contact error", err)
            )
          );
        }
      }

      const toAddBuyers: string[] = [];
      const toRemoveBuyers: string[] = [];

      newBuyerIds.forEach((id) => {
        if (!prevBuyerIds.has(id)) toAddBuyers.push(id);
      });
      prevBuyerIds.forEach((id) => {
        if (!newBuyerIds.has(id)) toRemoveBuyers.push(id);
      });

      for (const id of toAddBuyers) {
        contactSyncOps.push(
          fetch("/api/listings/assign-contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              listingId: saved.id,
              contactId: id,
              role: "buyer",
            }),
          }).catch((err) =>
            console.error("assign buyer contact error", err)
          )
        );
      }

      for (const id of toRemoveBuyers) {
        contactSyncOps.push(
          fetch("/api/listings/unlink-contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              listingId: saved.id,
              contactId: id,
              role: "buyer",
            }),
          }).catch((err) =>
            console.error("unlink buyer contact error", err)
          )
        );
      }

      if (contactSyncOps.length > 0) {
        await Promise.all(contactSyncOps);
      }

      setListingDetails((prev) => {
        const existing = prev[saved.id] as ListingDetail | undefined;
        const newDetail: ListingDetail = {
          id: saved.id,
          address: saved.address,
          mlsId: saved.mlsId ?? null,
          price:
            typeof saved.price === "number"
              ? saved.price
              : payload.price,
          status: saved.status ?? payload.status,
          description:
            saved.description ??
            (payload.description as string | null) ??
            "",
          aiCopy: saved.aiCopy ?? null,
          aiNotes: saved.aiNotes ?? null,
          sellerContactId: newSellerId,
          buyers: newBuyerIdsArray.map((id) => ({
            contactId: id,
            role: "buyer",
          })),
          photos: normalizedPhotos,
          createdAt:
            (saved.createdAt as string | null) ??
            existing?.createdAt ??
            null,
          updatedAt:
            (saved.updatedAt as string | null) ??
            existing?.updatedAt ??
            null,
        };
        return {
          ...prev,
          [saved.id]: newDetail,
        };
      });

      const sellerFromContacts = newSellerId
        ? contacts.find((c) => c.id === newSellerId)
        : null;

      setListings((prev) => {
        const idx = prev.findIndex((l) => l.id === saved.id);
        const row: ListingRow = {
          id: saved.id,
          address: saved.address,
          mlsId: saved.mlsId ?? null,
          price:
            typeof saved.price === "number"
              ? saved.price
              : payload.price,
          status: saved.status ?? payload.status,
          createdAt: saved.createdAt ?? null,
          updatedAt: saved.updatedAt ?? null,
          sellerName: sellerFromContacts?.name ?? null,
          buyerCount: newBuyerIdsArray.length,
          coverPhotoUrl:
            normalizedPhotos.find((p) => p.isCover)?.url ??
            normalizedPhotos[0]?.url ??
            null,
        };
        if (idx >= 0) {
          const clone = [...prev];
          clone[idx] = row;
          return clone;
        }
        return [row, ...prev];
      });
    } catch (err: any) {
      console.error("save listing error", err);
      setError(
        err?.message ||
          "We couldn’t save your listing. Try again or contact support@avillo.io."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------
 * Pins helpers
 * -----------------------------------*/
function handlePinsRequiresSave() {
  // Defensive: if we somehow have a selection but no form.id yet, hydrate id and bail.
  if (!form.id && selectedId) {
    setForm((prev) => ({ ...prev, id: selectedId }));
    return;
  }

  // People behavior: allow Pins to trigger a "silent save" without collapsing the workspace on mobile
  if (form.id) {
    void handleSaveListing({ keepWorkspaceOpen: true });
    return;
  }

  // Nothing selected → bounce back to Overview
  setActiveTab("overview");
}

  /* ------------------------------------
   * Delete listing
   * -----------------------------------*/
  async function handleDeleteListing() {
    if (!form.id) return;
    const listingId = form.id;

    const confirmed = window.confirm(
      "Delete this listing and its photos? This can’t be undone."
    );
    if (!confirmed) return;

    const isMobileView =
      typeof window !== "undefined" && window.innerWidth < 1024;

    if (isMobileView) {
      setSelectedId(null);
      setWorkspaceOpenMobile(false);
      setForm(INITIAL_FORM);
      scrollBackToLastListPosition();
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/listings/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listingId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete listing.");
      }

      const updatedListings = listings.filter((l) => l.id !== listingId);
      setListings(updatedListings);

      setPhotoState((prev) => {
        const clone = { ...prev };
        delete clone[listingId];
        return clone;
      });

      setGalleryIndexByListing((prev) => {
        const clone = { ...prev };
        delete clone[listingId];
        return clone;
      });

      if (!isMobileView) {
        // desktop: auto-select next listing if any
        if (updatedListings.length > 0) {
          const next = updatedListings[0];
          setSelectedId(next.id);
          const nextDetail = listingDetails[next.id];
          if (nextDetail) {
            hydrateFormFromApi({
              ...nextDetail,
              photos: photoState[next.id] ?? nextDetail.photos ?? [],
            });
          } else {
            const apiLike: ListingDetail = {
              id: next.id,
              address: next.address,
              mlsId: next.mlsId,
              price: next.price,
              status: next.status,
              description: "",
              sellerContactId: "",
              buyers: [],
              photos: photoState[next.id] ?? [],
              aiCopy: null,
              aiNotes: null,
              createdAt: next.createdAt ?? null,
              updatedAt: next.updatedAt ?? null,
            };
            hydrateFormFromApi(apiLike);
          }
        } else {
          setSelectedId(null);
          setForm(INITIAL_FORM);
        }
      }

      setListingDetails((prev) => {
        const clone: Record<string, ListingDetail> = { ...prev };
        delete clone[listingId];
        return clone;
      });
    } catch (err: any) {
      console.error("delete listing error", err);
      setError(
        err?.message ||
          "We couldn’t delete this listing. Try again or contact support@avillo.io."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------
   * Select listing from gallery
   * -----------------------------------*/
  function handleSelectListing(row: ListingRow) {
    captureListScrollY();

    setSelectedId(row.id);
    void prefetchListingNotes(row.id);
    setWorkspaceOpenMobile(true);

    const full = listingDetails[row.id];
    if (full) {
      hydrateFormFromApi({
        ...full,
        photos: photoState[row.id] ?? full.photos ?? [],
      });
    } else {
      const apiLike: ListingDetail = {
        id: row.id,
        address: row.address,
        mlsId: row.mlsId,
        price: row.price,
        status: row.status,
        description: "",
        sellerContactId: "",
        buyers: [],
        photos: photoState[row.id] ?? [],
        aiCopy: null,
        aiNotes: null,
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
      };
      hydrateFormFromApi(apiLike);
    }
  }

  const currentListingId = form.id || selectedId || null;
  const hasSelection = !!(form.id || selectedId);

  /* ------------------------------------
   * Derived photos for workspace
   * -----------------------------------*/
  const workspacePhotos: ListingPhoto[] =
    (form.id && photoState[form.id]) ||
    (selectedId && photoState[selectedId]) ||
    [];

  /* ------------------------------------
   * Render
   * -----------------------------------*/
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Listings"
        title="My listings"
        subtitle="Turn each property into a living workspace — assign sellers and buyers, and keep every listing marketing-ready."
      />

      <section className="space-y-5">
        {/* Top bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Inventory & workspaces
            </p>
            <p className="mt-1 max-w-xl text-xs text-[var(--avillo-cream-soft)]">
              Each card is a listing workspace. Set a cover image, tweak
              details, and attach the people who matter from your CRM.
            </p>
          </div>

          {/* New listing button */}
          <div className="w-full md:w-auto">
            <button
              type="button"
              onClick={handleNewListingClick}
              disabled={creatingNew}
              className="inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingNew ? "Creating..." : "+ New listing"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total listings" value={total} />
          <StatCard label="Active" value={activeCount} tone="green" />
          <StatCard label="Pending" value={pendingCount} tone="amber" />
          <StatCard label="Closed" value={closedCount} tone="blue" />
        </div>

        {/* Filters + search */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex flex-wrap gap-2 text-xs">
            <FilterPill
              label="All"
              count={statusCounts.all}
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            <FilterPill
              label="Draft"
              count={statusCounts.draft}
              active={statusFilter === "draft"}
              onClick={() => setStatusFilter("draft")}
            />
            <FilterPill
              label="Active"
              count={statusCounts.active}
              active={statusFilter === "active"}
              onClick={() => setStatusFilter("active")}
            />
            <FilterPill
              label="Pending"
              count={statusCounts.pending}
              active={statusFilter === "pending"}
              onClick={() => setStatusFilter("pending")}
            />
            <FilterPill
              label="Closed"
              count={statusCounts.closed}
              active={statusFilter === "closed"}
              onClick={() => setStatusFilter("closed")}
            />
          </div>

          <div className="w-full md:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by address or MLS ID..."
              className="avillo-input w-full"
            />
          </div>
        </div>

        {/* Main grid: gallery + workspace */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)]">
          {/* LEFT: Listing gallery */}
          <div
            className={
              "relative rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "hidden" : "block") +
              " md:block lg:flex lg:flex-col lg:max-h-[calc(100vh-170px)]"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Listing gallery
              </p>
              <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                {loadingList
                  ? "Loading…"
                  : `${filteredListings.length} ${
                      filteredListings.length === 1 ? "result" : "results"
                    }`}
              </p>
            </div>

            {/* Desktop scroll wrapper */}
            <div
              ref={listScrollRef}
              className="flex-1 min-h-0 pt-2 pb-1 lg:overflow-y-auto lg:pr-1"
            >
              {error && !loadingList && (
                <p className="mb-3 text-[11px] text-red-300">{error}</p>
              )}

              {loadingList && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Loading your listings…
                </p>
              )}

              {!loadingList && filteredListings.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No listings match this filter yet. Adjust status, search
                  criteria, or create a new listing.
                </p>
              )}

              {!loadingList && filteredListings.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {filteredListings.map((l) => {
                    const isSelected = l.id === selectedId;
                    const currentPhotoUrl = getCurrentCardPhotoUrl(l);
                    const photosForCard = getPhotosForListingCard(l);

                    const priceFormatted =
                      typeof l.price === "number"
                        ? `$${l.price.toLocaleString("en-US", {
                            maximumFractionDigits: 0,
                          })}`
                        : "Price TBD";

                    const updatedLabel = l.updatedAt
                      ? new Date(l.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : null;

                    return (
                      <div
                        key={l.id}
                        data-listing-id={l.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectListing(l)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelectListing(l);
                          }
                        }}
                        aria-pressed={isSelected}
                        className={
                          "group flex flex-col overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 " +
                          (isSelected
                            ? "border-amber-200/80 bg-[#050b16]/95 shadow-[0_20px_40px_rgba(0,0,0,0.9)]"
                            : "border-slate-800/80 bg-[#050b16]/90 hover:border-amber-100/70 hover:bg-[#050b16]")
                        }
                      >
                        {/* Cover / slideshow */}
                        <div className="relative w-full overflow-hidden rounded-t-2xl md:h-40 md:aspect-auto aspect-[4/3]">
                          {currentPhotoUrl ? (
                            <>
                              <Image
                                src={currentPhotoUrl}
                                alt={l.address}
                                fill
                                sizes="(min-width: 1024px) 320px, 100vw"
                                className="object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-[1.08]"
                              />
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050b16]/95 via-transparent to-transparent" />
                            </>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                              <div className="flex flex-col items-center gap-2 text-[11px] text-[var(--avillo-cream-soft)]">
                                <span className="rounded-full bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-soft)]">
                                  Listing cover
                                </span>
                                <span className="text-[10px] text-[var(--avillo-cream-muted)]">
                                  Add a photo from the workspace.
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Status pill */}
                          <div className="absolute left-3 top-3 flex items-center gap-2">
                            <span
                              className={
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                                statusBadgeClass(l.status)
                              }
                            >
                              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                              {statusLabel(l.status)}
                            </span>
                          </div>

                          {/* Slideshow arrows */}
                          {photosForCard.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showPrevPhoto(l.id);
                                }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-[12px] text-slate-50 hover:bg-black/80"
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showNextPhoto(l.id);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-[12px] text-slate-50 hover:bg-black/80"
                              >
                                ›
                              </button>
                            </>
                          )}
                        </div>

                        {/* Card body */}
                        <div className="flex flex-1 flex-col gap-2 px-4 py-3 text-xs text-[var(--avillo-cream-soft)]">
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                              {priceFormatted}
                            </p>
                            <p className="text-[13px] font-semibold text-[#f7f2e9] line-clamp-2">
                              {l.address}
                            </p>
                            <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                              {l.mlsId ? `MLS #${l.mlsId}` : "No MLS ID yet"}
                            </p>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[var(--avillo-cream-muted)]">
                            <span>
                              {l.sellerName
                                ? `Seller: ${l.sellerName}`
                                : "No seller linked"}
                            </span>
                            {updatedLabel && <span>Updated {updatedLabel}</span>}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-[10px]">
                            <span className="text-[var(--avillo-cream-muted)]">
                              Select to edit
                            </span>
                            {typeof l.buyerCount === "number" &&
                            l.buyerCount > 0 ? (
                              <span className="rounded-full border border-slate-700/80 px-2 py-1 text-[10px] text-[var(--avillo-cream-soft)]">
                                {l.buyerCount} buyer
                                {l.buyerCount === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-800/80 px-2 py-1 text-[10px] text-[var(--avillo-cream-muted)]">
                                No tagged buyers
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Workspace */}
          <div
            ref={workspaceRef}
            id="listing-workspace"
            className={
              "relative rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] overflow-visible scroll-mt-24 " +
              (workspaceOpenMobile ? "block" : "hidden") +
              " md:block lg:flex lg:flex-col lg:max-h-[calc(100vh-170px)] lg:overflow-hidden"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                  Listing workspace
                </p>
                <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                  {hasSelection
                    ? "Update the core details, attach the seller, tag buyers, and manage your listing photos."
                    : "Choose a listing from the gallery or create a new one to start."}
                </p>
              </div>

              {/* Mobile back to gallery */}
              <button
                type="button"
                onClick={() => {
                  setWorkspaceOpenMobile(false);
                  setSelectedId(null);
                  scrollBackToLastListPosition();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-[var(--avillo-cream-soft)] shadow-[0_0_18px_rgba(15,23,42,0.9)] hover:border-amber-100/80 hover:text-amber-50 hover:bg-slate-900/95 md:hidden"
              >
                <span className="text-xs">←</span>
                <span>Back</span>
              </button>
            </div>

            {/* Tabs (hide on empty state) */}
            {hasSelection && (
              <div className="mb-3 flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={avilloTabPillClass(activeTab === "overview")}
                >
                  Overview
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("activity")}
                  className={avilloTabPillClass(activeTab === "activity")}
                >
                  Activity
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("pins")}
                  className={avilloTabPillClass(activeTab === "pins")}
                >
                  Pins
                </button>
              </div>
            )}

            {/* Scrollable workspace body */}
            <div className="flex-1 overflow-y-auto">
              {!form.id && !selectedId ? (
                // Empty state
                <div className="flex h-[420px] items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  <div>
                    <p className="font-semibold text-[var(--avillo-cream-soft)]">
                      No listing selected
                    </p>
                    <p className="mt-1 max-w-xs">
                      Choose a listing card from the gallery on the left, or
                      click
                      <span className="font-semibold"> “+ New listing”</span> to
                      start a fresh workspace.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="pb-2 text-xs text-[var(--avillo-cream-soft)]">
                    {activeTab === "overview" && (
                      <div className="space-y-4">
                    {/* Photos */}
                    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold text-slate-50">
                            Listing photos
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                            Upload multiple photos and choose which one should be
                            the cover in your gallery.
                          </p>
                        </div>
                      </div>

                      {form.id ? (
                        <>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={(e) => handleSelectFiles(e, form.id)}
                          />

                          <div
                            onClick={() => {
                              if (!form.id) {
                                alert(
                                  "Save or create the listing before uploading photos."
                                );
                                return;
                              }
                              fileInputRef.current?.click();
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDrop={(e) => handleDropFiles(e, form.id)}
                            className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/70 px-4 py-4 text-center text-[11px] text-[var(--avillo-cream-muted)] hover:border-amber-200/80 hover:bg-slate-900/80"
                          >
                            <span className="mb-1 font-semibold text-[var(--avillo-cream-soft)]">
                              Drop photos here or tap to upload
                            </span>
                            <span className="text-[10px]">
                              JPG, PNG. Multiple files allowed.
                            </span>
                          </div>

                          {workspacePhotos.length > 0 ? (
                          <div
                            className={[
                              "mt-3",
                              // Force vertical scrolling instead of wrapping forever
                              "max-h-56 sm:max-h-64 md:max-h-72",
                              "overflow-y-auto overflow-x-hidden",
                              // Nice scrolling on iOS + spacing for scrollbar
                              "pr-1",
                              "[&::-webkit-scrollbar]:w-2",
                              "[&::-webkit-scrollbar-track]:bg-transparent",
                              "[&::-webkit-scrollbar-thumb]:rounded-full",
                              "[&::-webkit-scrollbar-thumb]:bg-slate-700/70",
                              "scrollbar-thin scrollbar-thumb-slate-700/70 scrollbar-track-transparent",
                            ].join(" ")}
                          >
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                              {workspacePhotos.map((photo) => (
                                <div
                                  key={photo.url}
                                  className={
                                    "group relative overflow-hidden rounded-xl border transition " +
                                    (photo.isCover
                                      ? "border-amber-200/80 shadow-[0_0_22px_rgba(248,250,252,0.35)]"
                                      : "border-slate-700/80 hover:border-amber-100/70")
                                  }
                                >
                                  <div className="relative h-20 w-full md:h-24">
                                    <Image
                                      src={photo.url}
                                      alt="Listing photo"
                                      fill
                                      sizes="150px"
                                      className="object-cover transition group-hover:scale-[1.03]"
                                    />
                                  </div>

                                  {/* Delete */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removePhoto(form.id as string, photo.url)
                                    }
                                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-slate-50 hover:bg-red-600/80"
                                    title="Delete photo"
                                  >
                                    ✕
                                  </button>

                                  {/* Cover toggle */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCoverPhoto(form.id as string, photo.url)
                                    }
                                    className={
                                      "absolute inset-x-1 bottom-1 rounded-full px-2 py-1 text-[10px] font-medium transition " +
                                      (photo.isCover
                                        ? "bg-amber-100 text-[#050b16]"
                                        : "bg-black/55 text-[var(--avillo-cream-soft)] hover:bg-black/75")
                                    }
                                  >
                                    {photo.isCover ? "Cover photo" : "Set as cover"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-[10px] text-[var(--avillo-cream-muted)]">
                            No photos added yet. Upload at least one image to make this workspace feel alive.
                          </p>
                        )}
                        </>
                      ) : (
                        <p className="mt-3 text-[11px] text-[var(--avillo-cream-muted)]">
                          Save or create a listing first, then you’ll be able to
                          upload and manage photos.
                        </p>
                      )}
                    </div>

                    {/* Address + MLS + Status + Price */}
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                          Property address
                        </label>
                        <input
                          value={form.address}
                          onChange={(e) =>
                            onFormChange("address", e.target.value)
                          }
                          placeholder="1234 Ocean View Dr, San Diego, CA"
                          className="avillo-input w-full"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[1.2fr_minmax(0,0.9fr)_minmax(0,0.9fr)]">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                            MLS ID (optional)
                          </label>
                          <input
                            value={form.mlsId}
                            onChange={(e) =>
                              onFormChange("mlsId", e.target.value)
                            }
                            placeholder="MLS #"
                            className="avillo-input w-full"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                            Status
                          </label>
                          <select
                            value={form.status}
                            onChange={(e) =>
                              onFormChange(
                                "status",
                                e.target.value as any
                              )
                            }
                            className={statusSelectClass(form.status)}
                          >
                            <option value="draft">Draft</option>
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                            Price (optional)
                          </label>
                          <input
                            value={form.price ?? ""}
                            onChange={handlePriceChange}
                            placeholder="1,450,000"
                            className="avillo-input w-full"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Seller select */}
                    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                      <p className="text-[11px] font-semibold text-slate-50">
                        Seller contact
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                        Search your CRM for the seller attached to this listing.
                      </p>
                      <div className="mt-3">
                        <SellerSelect
                          options={sellerOptions}
                          loading={contactsLoading}
                          error={contactsError}
                          valueId={form.sellerContactId}
                          onChange={(id) =>
                            onFormChange("sellerContactId", id)
                          }
                        />
                      </div>
                      {selectedSeller && (
                        <p className="mt-2 text-[10px] text-[var(--avillo-cream-muted)]">
                          Linked to{" "}
                          <span className="font-medium text-[var(--avillo-cream-soft)]">
                            {selectedSeller.name}
                          </span>
                          {selectedSeller.email && ` · ${selectedSeller.email}`}
                          {selectedSeller.phone && ` · ${selectedSeller.phone}`}
                        </p>
                      )}
                    </div>

                    {/* Buyers select */}
                    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                      <p className="text-[11px] font-semibold text-slate-50">
                        Tagged buyers
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                        Add buyers from your CRM who are actively watching or
                        considering this property.
                      </p>
                      <div className="mt-3">
                        <BuyerMultiSelect
                          options={buyerOptions}
                          loading={contactsLoading}
                          error={contactsError}
                          selectedIds={form.buyers.map(
                            (b) => b.contactId
                          )}
                          onToggle={toggleBuyer}
                        />
                      </div>
                      {selectedBuyers.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedBuyers.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => toggleBuyer(b.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-amber-100/70 bg-amber-50/10 px-3 py-1 text-[11px] font-medium text-amber-50 shadow-[0_0_14px_rgba(248,250,252,0.25)]"
                            >
                              <span>{b.name}</span>
                              <span className="ml-0.5 text-[10px] opacity-80">
                                ✕
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Error + Save/Delete */}
                    {error && (
                      <p className="text-[11px] text-red-300">{error}</p>
                    )}

                    <div className="flex items-center justify-between gap-3 pb-1">
                      <button
                        type="button"
                        onClick={handleDeleteListing}
                        disabled={saving || !form.id}
                        className="inline-flex items-center justify-center rounded-full border border-red-400/80 bg-red-500/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete listing
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveListing()}
                        disabled={saving || !form.id}
                        className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? "Saving…" : "Save listing"}
                      </button>
                    </div>
                  </div>
                  )}

                  {activeTab === "activity" && (
                    <div className="space-y-3">
                      {/* Notes + (optional) task creation */}
                      <ListingNotesTasksCard
                        listingId={currentListingId}
                        disabled={!currentListingId}
                        prefetchedNotes={
                          currentListingId ? notesByListingId[currentListingId] ?? null : null
                        }
                        onNoteCreated={(note) => {

                          setActivityRefreshNonce((n) => n + 1);

                          const id = currentListingId;
                          if (!id) return;

                          const normalized: ListingNote = {
                            id: String(note.id),
                            text: String(note.text ?? ""),
                            createdAt: String(note.createdAt),
                            taskAt: note.taskAt ?? null,
                          };

                          setNotesByListingId((prev) => ({
                            ...prev,
                            [id]: [normalized, ...(prev[id] ?? [])],
                          }));
                          setNotesLoadedFor((prev) => ({ ...prev, [id]: true }));
                        }}
                      />
                      
                      {/* Full activity feed */}
                      <ListingAutopilotActivityCard
                        key={`${currentListingId ?? "none"}:${activityRefreshNonce}`}
                        listingId={currentListingId}
                        enabled={activeTab === "activity"}
                      />
                    </div>
                  )}

                  {/* Pins kept mounted (preserve state across tab changes) */}
                  <div style={{ display: activeTab === "pins" ? "block" : "none" }}>
                    <div className="space-y-3">
                        <ListingPins
                          listingId={currentListingId ?? undefined}
                          disabled={!currentListingId}
                          onRequiresSave={handlePinsRequiresSave}
                        />
                    </div>
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
 * Small components
 * -----------------------------------*/
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "blue";
}) {
  // keep Listings glow colors the same as you had
  const glow =
    tone === "green"
      ? "shadow-[0_0_25px_rgba(34,197,94,0.28)]"
      : tone === "amber"
      ? "shadow-[0_0_25px_rgba(245,158,11,0.22)]"
      : tone === "blue"
      ? "shadow-[0_0_25px_rgba(59,130,246,0.25)]"
      : "shadow-[0_0_18px_rgba(15,23,42,0.55)]";

  // Tasks-style ring behavior, but mapped to Listings tones
  const ring =
    tone === "green"
      ? "border-emerald-300/30"
      : tone === "amber"
      ? "border-amber-300/30"
      : tone === "blue"
      ? "border-sky-300/30"
      : "border-[#1d2940]";

  return (
    <div
      className={cx(
        "rounded-2xl border bg-gradient-to-br from-[#050b16] to-[#0a1223] px-4 py-3 text-xs text-[#c0c9de]/90",
        ring,
        glow
      )}
    >
      <div className="text-[0.65rem] uppercase tracking-[0.22em] text-[#8f9bb8]/80">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[#f7f2e9]">{value}</div>
    </div>
  );
}

/* ------------------------------------
 * Seller & buyer selectors
 * -----------------------------------*/
type SellerSelectProps = {
  options: ContactOption[];
  valueId: string;
  onChange: (id: string) => void;
  loading?: boolean;
  error?: string | null;
};

function SellerSelect({
  options,
  valueId,
  onChange,
  loading,
  error,
}: SellerSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const selected = options.find((o) => o.id === valueId) ?? null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-left text-[12px] text-[var(--avillo-cream-soft)] hover:border-amber-100/60"
      >
        <span
          className={!selected ? "text-[var(--avillo-cream-muted)]" : ""}
        >
          {selected ? selected.name : "Search & select seller…"}
        </span>
        <span className="text-[10px] text-[var(--avillo-cream-muted)]">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-700/80 bg-[#050b16] shadow-[0_18px_45px_rgba(0,0,0,0.85)]">
          {/* Sticky search */}
          <div className="sticky top-0 z-10 border-b border-slate-800/80 bg-[#050b16] px-3 py-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a seller name…"
              className="w-full rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] text-[var(--avillo-cream-soft)] outline-none"
            />
          </div>

          {/* scrollable list */}
          <div className="max-h-64 overflow-y-auto text-xs">
            {loading && (
              <p className="px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                Loading contacts…
              </p>
            )}
            {error && !loading && (
              <p className="px-3 py-2 text-[11px] text-red-300">
                {error}
              </p>
            )}
            {!loading && !error && filtered.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                No sellers found.
              </p>
            )}
            {!loading &&
              !error &&
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={
                    "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-900/90 " +
                    (c.id === valueId ? "bg-slate-900/90" : "")
                  }
                >
                  <span className="text-[12px] text-[#f7f2e9]">
                    {c.name}
                  </span>
                  <span className="text-[10px] text-[var(--avillo-cream-muted)]">
                    {c.email || c.phone || c.type || "CRM contact"}
                  </span>
                </button>
              ))}
          </div>

          {/* Done button */}
          <div className="flex justify-end border-t border-slate-800/80 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-600/80 px-3 py-1 text-[10px] text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type BuyerMultiSelectProps = {
  options: ContactOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  loading?: boolean;
  error?: string | null;
};

function BuyerMultiSelect({
  options,
  selectedIds,
  onToggle,
  loading,
  error,
}: BuyerMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const selectedCount = selectedIds.length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-left text-[12px] text-[var(--avillo-cream-soft)] hover:border-amber-100/60"
      >
        <span
          className={
            selectedCount === 0
              ? "text-[var(--avillo-cream-muted)]"
              : ""
          }
        >
          {selectedCount === 0
            ? "Search & tag buyers…"
            : `${selectedCount} buyer${
                selectedCount === 1 ? "" : "s"
              } tagged`}
        </span>
        <span className="text-[10px] text-[var(--avillo-cream-muted)]">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-700/80 bg-[#050b16] shadow-[0_18px_45px_rgba(0,0,0,0.85)]">
          {/* Sticky search */}
          <div className="sticky top-0 z-10 border-b border-slate-800/80 bg-[#050b16] px-3 py-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a buyer name…"
              className="w-full rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] text-[var(--avillo-cream-soft)] outline-none"
            />
          </div>

          {/* scrollable list */}
          <div className="max-h-64 overflow-y-auto text-xs">
            {loading && (
              <p className="px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                Loading contacts…
              </p>
            )}
            {error && !loading && (
              <p className="px-3 py-2 text-[11px] text-red-300">
                {error}
              </p>
            )}
            {!loading && !error && filtered.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                No buyers found.
              </p>
            )}
            {!loading &&
              !error &&
              filtered.map((c) => {
                const checked = selectedSet.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggle(c.id)}
                    className={
                      "flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-900/90 " +
                      (checked ? "bg-slate-900/90" : "")
                    }
                  >
                    <div className="flex flex-col">
                      <span className="text-[12px] text-[#f7f2e9]">
                        {c.name}
                      </span>
                      <span className="text-[10px] text-[var(--avillo-cream-muted)]">
                        {c.email ||
                          c.phone ||
                          c.type ||
                          "CRM contact"}
                      </span>
                    </div>
                    <span className="ml-3 flex h-4 w-4 items-center justify-center rounded border border-slate-500/70 text-[10px]">
                      {checked ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
          </div>

          {/* Done button */}
          <div className="flex justify-end border-t border-slate-800/80 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-600/80 px-3 py-1 text-[10px] text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}