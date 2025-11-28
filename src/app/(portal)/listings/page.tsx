// src/app/(portal)/listings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";

/* ------------------------------------
 * Types (aligned with /api/listings + /api/listings/save)
 * -----------------------------------*/

type ListingStatus = "draft" | "active" | "pending" | "closed";

type ListingRow = {
  id: string;
  address: string;
  mlsId?: string | null;
  price?: number | null;
  status: ListingStatus | string;
  createdAt?: string;
  updatedAt?: string;
  sellerName?: string | null;
  buyerCount?: number;
};

type ListingDetail = {
  id?: string;
  address: string;
  mlsId?: string | null;
  price?: number | null;
  status: ListingStatus | string;
  description?: string | null;
  aiCopy?: string | null;
  aiNotes?: string | null;
  sellerContactId?: string | null;
  buyers?: {
    contactId: string;
    role?: string | null;
  }[];
};

/* ------------------------------------
 * Page
 * -----------------------------------*/

export default function ListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | ListingStatus>(
    "active"
  );
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Detail form state
  const [form, setForm] = useState<{
    id?: string;
    address: string;
    mlsId: string;
    price: string;
    status: ListingStatus | string;
    description: string;
    aiCopy: string;
    aiNotes: string;
    sellerContactId: string;
    buyerContactIds: string; // comma or newline separated IDs
  }>({
    id: undefined,
    address: "",
    mlsId: "",
    price: "",
    status: "draft",
    description: "",
    aiCopy: "",
    aiNotes: "",
    sellerContactId: "",
    buyerContactIds: "",
  });

  const [saving, setSaving] = useState(false);

  /* ------------------------------------
   * Load listings on mount
   * -----------------------------------*/
  useEffect(() => {
    let cancelled = false;

    async function load() {
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
          listings?: ListingRow[];
        };

        if (!cancelled) {
          setListings(data.listings ?? []);
          if ((data.listings ?? []).length > 0) {
            setSelectedId(data.listings![0].id);
            hydrateFormFromListing(data.listings![0]);
          }
        }
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

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------
   * Helpers
   * -----------------------------------*/

  function hydrateFormFromListing(listing: ListingRow | ListingDetail) {
    setForm({
      id: listing.id,
      address: listing.address ?? "",
      mlsId: listing.mlsId ?? "",
      price:
        listing.price != null && !Number.isNaN(listing.price)
          ? String(listing.price)
          : "",
      status: (listing.status as ListingStatus) ?? "draft",
      description: (listing as any).description ?? "",
      aiCopy: (listing as any).aiCopy ?? "",
      aiNotes: (listing as any).aiNotes ?? "",
      sellerContactId:
        (listing as any).seller?.id ??
        (listing as any).sellerContactId ??
        "",
      buyerContactIds:
        Array.isArray((listing as any).buyers) &&
        (listing as any).buyers.length > 0
          ? (listing as any).buyers
              .map(
                (b: any) =>
                  b.contactId ||
                  b.contact?.id ||
                  "" /* gracefully handle different shapes */
              )
              .filter(Boolean)
              .join(", ")
          : "",
    });
  }

  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (statusFilter !== "all") {
        if ((l.status as ListingStatus) !== statusFilter) return false;
      } else {
        // "all" means show everything
      }

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        l.address.toLowerCase().includes(q) ||
        (l.mlsId ?? "").toLowerCase().includes(q)
      );
    });
  }, [listings, statusFilter, search]);

  const selectedListingRow = useMemo(
    () => filteredListings.find((l) => l.id === selectedId) ?? null,
    [filteredListings, selectedId]
  );

  // Ensure selected listing always exists in filtered set
  useEffect(() => {
    if (!selectedListingRow && filteredListings[0]) {
      setSelectedId(filteredListings[0].id);
      hydrateFormFromListing(filteredListings[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListingRow, filteredListings]);

  function handleSelectListing(row: ListingRow) {
    setSelectedId(row.id);
    hydrateFormFromListing(row);
  }

  function handleNewListing() {
    setSelectedId(null);
    setForm({
      id: undefined,
      address: "",
      mlsId: "",
      price: "",
      status: "draft",
      description: "",
      aiCopy: "",
      aiNotes: "",
      sellerContactId: "",
      buyerContactIds: "",
    });
  }

  function onFormChange<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function normalizeBuyerContactIds(raw: string): { contactId: string }[] {
    const pieces = raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const uniqueIds = Array.from(new Set(pieces));
    return uniqueIds.map((id) => ({ contactId: id }));
  }

  /* ------------------------------------
   * Save handler (create or update)
   * -----------------------------------*/

  async function handleSave() {
    if (!form.address.trim()) {
      setError("Please add an address before saving this listing.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: ListingDetail = {
        id: form.id,
        address: form.address.trim(),
        mlsId: form.mlsId.trim() || null,
        price: form.price.trim()
          ? Number.isNaN(Number(form.price.trim()))
            ? null
            : Number(form.price.trim())
          : null,
        status: (form.status as ListingStatus) || "draft",
        description: form.description.trim() || null,
        aiCopy: form.aiCopy.trim() || null,
        aiNotes: form.aiNotes.trim() || null,
        sellerContactId: form.sellerContactId.trim() || null,
        buyers: normalizeBuyerContactIds(form.buyerContactIds),
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

      const data = (await res.json()) as {
        listing: any;
      };

      const saved = data.listing;

      // Build updated row for the left list
      const sellerName =
        saved?.seller?.name ||
        (saved?.seller
          ? `${saved.seller.firstName ?? ""} ${
              saved.seller.lastName ?? ""
            }`.trim()
          : "") ||
        null;

      const buyerCount = Array.isArray(saved?.buyers)
        ? saved.buyers.length
        : 0;

      const updatedRow: ListingRow = {
        id: saved.id,
        address: saved.address,
        mlsId: saved.mlsId,
        price: saved.price,
        status: saved.status,
        createdAt:
          typeof saved.createdAt === "string"
            ? saved.createdAt
            : saved.createdAt
            ? new Date(saved.createdAt).toISOString()
            : undefined,
        updatedAt:
          typeof saved.updatedAt === "string"
            ? saved.updatedAt
            : saved.updatedAt
            ? new Date(saved.updatedAt).toISOString()
            : undefined,
        sellerName,
        buyerCount,
      };

      // Update list in-place
      setListings((prev) => {
        const exists = prev.some((l) => l.id === updatedRow.id);
        if (exists) {
          return prev.map((l) => (l.id === updatedRow.id ? updatedRow : l));
        }
        return [updatedRow, ...prev];
      });

      setSelectedId(updatedRow.id);
      hydrateFormFromListing(saved);
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
   * Render helpers
   * -----------------------------------*/

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

  /* ------------------------------------
   * Render
   * -----------------------------------*/

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Listings"
        title="My listings"
        subtitle="Track your active, pending, and past listings — link sellers and interested buyers so your AI engines always have context."
      />

      {/* Top bar: summary + add button */}
      <section className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Inventory & assignments
            </p>
            <p className="mt-1 max-w-xl text-xs text-[var(--avillo-cream-soft)]">
              See your listings on the left, edit details on the right. Assign a
              seller and tag buyer contacts so Avillo can generate tailored
              follow-ups and scripts.
            </p>
          </div>

          <button
            type="button"
            onClick={handleNewListing}
            className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20"
          >
            + New listing
          </button>
        </div>

        {/* Filters + search */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex flex-wrap gap-2 text-xs">
            <StatusFilterPill
              label="Active"
              active={statusFilter === "active"}
              onClick={() => setStatusFilter("active")}
            />
            <StatusFilterPill
              label="All"
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            <StatusFilterPill
              label="Draft"
              active={statusFilter === "draft"}
              onClick={() => setStatusFilter("draft")}
            />
            <StatusFilterPill
              label="Pending"
              active={statusFilter === "pending"}
              onClick={() => setStatusFilter("pending")}
            />
            <StatusFilterPill
              label="Closed"
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

        {/* Main layout: list + detail */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)]">
          {/* LEFT: LIST */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)]" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Listing list
              </p>
              <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                {loadingList
                  ? "Loading…"
                  : `${filteredListings.length} ${
                      filteredListings.length === 1 ? "result" : "results"
                    }`}
              </p>
            </div>

            <div className="space-y-2">
              {!loadingList && filteredListings.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No listings match this filter yet. Adjust status, search
                  criteria, or create a new listing.
                </p>
              )}

              {filteredListings.map((l) => {
                const isSelected = l.id === selectedId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleSelectListing(l)}
                    className={
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors " +
                      (isSelected
                        ? "border-amber-200/80 bg-slate-900/90 shadow-[0_0_28px_rgba(248,250,252,0.22)]"
                        : "border-slate-800/80 bg-slate-900/60 hover:border-amber-100/70 hover:bg-slate-900/90")
                    }
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-slate-50">
                          {l.address}
                        </p>
                        <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                          {l.mlsId ? `MLS #${l.mlsId}` : "No MLS ID"}
                        </p>
                        {l.sellerName && (
                          <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                            Seller: {l.sellerName}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                            statusBadgeClass(l.status)
                          }
                        >
                          {statusLabel(l.status)}
                        </span>
                        {typeof l.price === "number" && (
                          <span className="text-[11px] text-[var(--avillo-cream-soft)]">
                            $
                            {l.price.toLocaleString("en-US", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        )}
                        {typeof l.buyerCount === "number" && l.buyerCount > 0 && (
                          <span className="text-[10px] text-[var(--avillo-cream-muted)]">
                            {l.buyerCount} tagged buyer
                            {l.buyerCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: DETAIL FORM */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)]" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                  Listing details
                </p>
                <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                  Edit core info, assign a seller, and tag buyers. Save to log
                  CRM activity and keep your AI engines in sync.
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-[var(--avillo-cream-soft)]">
              {/* Address + MLS */}
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                    Property address
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) => onFormChange("address", e.target.value)}
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
                      onChange={(e) => onFormChange("mlsId", e.target.value)}
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
                        onFormChange("status", e.target.value as any)
                      }
                      className="avillo-input w-full bg-[rgba(15,23,42,0.9)]"
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
                      value={form.price}
                      onChange={(e) => onFormChange("price", e.target.value)}
                      placeholder="1450000"
                      className="avillo-input w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Seller assignment */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                <p className="text-[11px] font-semibold text-slate-50">
                  Seller contact
                </p>
                <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                  Paste the CRM contact ID for the seller. Later we can upgrade
                  this to a searchable selector.
                </p>
                <div className="mt-2">
                  <input
                    value={form.sellerContactId}
                    onChange={(e) =>
                      onFormChange("sellerContactId", e.target.value)
                    }
                    placeholder="Contact ID (e.g. from CRM)"
                    className="avillo-input w-full"
                  />
                </div>
              </div>

              {/* Buyers */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                <p className="text-[11px] font-semibold text-slate-50">
                  Tagged buyers
                </p>
                <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                  Add contact IDs of buyers who are interested in this listing.
                  Separate with commas or line breaks.
                </p>
                <textarea
                  value={form.buyerContactIds}
                  onChange={(e) =>
                    onFormChange("buyerContactIds", e.target.value)
                  }
                  rows={3}
                  placeholder="contact-id-1, contact-id-2, contact-id-3"
                  className="avillo-textarea mt-2 w-full"
                />
              </div>

              {/* Notes + AI fields */}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                  <p className="text-[11px] font-semibold text-slate-50">
                    Listing description (human)
                  </p>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      onFormChange("description", e.target.value)
                    }
                    rows={4}
                    placeholder="Short description, key features, seller story…"
                    className="avillo-textarea mt-2 w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                    <p className="text-[11px] font-semibold text-slate-50">
                      AI copy (optional)
                    </p>
                    <textarea
                      value={form.aiCopy}
                      onChange={(e) => onFormChange("aiCopy", e.target.value)}
                      rows={3}
                      placeholder="Paste generated MLS copy, social captions, etc."
                      className="avillo-textarea mt-2 w-full"
                    />
                  </div>
                  <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                    <p className="text-[11px] font-semibold text-slate-50">
                      AI notes (optional)
                    </p>
                    <textarea
                      value={form.aiNotes}
                      onChange={(e) => onFormChange("aiNotes", e.target.value)}
                      rows={2}
                      placeholder="Internal notes, experiments, or reminders for future prompts."
                      className="avillo-textarea mt-2 w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Error + Save */}
              {error && (
                <p className="text-[11px] text-red-300">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save listing"}
                </button>
              </div>
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

type StatusFilterPillProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
};

function StatusFilterPill({ label, active, onClick }: StatusFilterPillProps) {
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