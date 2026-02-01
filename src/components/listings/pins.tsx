//components/listings/pins.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePinName } from "@/lib/pins/normalizePin";

type Pin = {
  id: string;
  name: string;
  nameKey?: string;
};

type ListingPin = {
  id: string;
  name: string;
  nameKey?: string;
  attachedAt?: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

/** tiny Levenshtein for fuzzy suggestions */
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const v0 = new Array(b.length + 1).fill(0);
  const v1 = new Array(b.length + 1).fill(0);

  for (let i = 0; i <= b.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export default function ListingPins({
  listingId,
  disabled,
  onRequiresSave,
}: {
  listingId?: string | null;
  disabled?: boolean;
  onRequiresSave?: () => void;
}) {
  const canUse = !!listingId && !disabled;

  // Data
  const [workspacePins, setWorkspacePins] = useState<Pin[]>([]);
  const [listingPins, setListingPins] = useState<ListingPin[]>([]);

  // Load states
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loadingListing, setLoadingListing] = useState(false); // initial load + manual refresh only
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Action states
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Input + suggestions
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  // Create-confirm state (prevents typos polluting global bank)
  const [createConfirmKey, setCreateConfirmKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurCloseTimer = useRef<number | null>(null);

  const busy = saving || creating;

  // -----------------------------
  // Loaders
  // -----------------------------

  async function loadWorkspacePins(signal?: AbortSignal) {
    const res = await fetch("/api/pins", { cache: "no-store", signal });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to load pins.");
    }
    const data = await res.json();
    const pins: Pin[] = Array.isArray(data?.pins) ? data.pins : [];
    setWorkspacePins(pins);
  }

  async function loadListingPins(id: string, signal?: AbortSignal) {
    const res = await fetch(`/api/pins/listings/attach/${id}`, { cache: "no-store", signal });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to load listing pins.");
    }
    const data = await res.json();
    const pins: ListingPin[] = Array.isArray(data?.pins) ? data.pins : [];
    setListingPins(pins);
  }

  async function refreshWorkspace(opts?: { silent?: boolean }) {
    try {
      if (!opts?.silent) setError(null);
      await loadWorkspacePins();
    } catch (e: any) {
      if (!opts?.silent && listingId) setError(e?.message || "We couldn’t load pins right now.");
    }
  }

  async function refreshListing(id: string, opts?: { silent?: boolean }) {
    try {
      if (!opts?.silent) {
        setError(null);
        setLoadingListing(true);
      }
      await loadListingPins(id);
    } catch (e: any) {
      if (!opts?.silent) setError(e?.message || "We couldn’t load listing pins right now.");
    } finally {
      if (!opts?.silent) setLoadingListing(false);
    }
  }

  async function manualRefresh() {
    if (!listingId) return;
    try {
      setManualRefreshing(true);
      setError(null);
      setLoadingListing(true);
      await Promise.all([loadWorkspacePins(), loadListingPins(listingId)]);
    } catch (e: any) {
      setError(e?.message || "We couldn’t load pins right now.");
    } finally {
      setLoadingListing(false);
      setManualRefreshing(false);
    }
  }

  // Preload workspace pins once
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoadingWorkspace(true);
        await loadWorkspacePins(ac.signal);
      } catch {
        // silent
      } finally {
        setLoadingWorkspace(false);
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial listing load
  useEffect(() => {
    if (!listingId) {
      setListingPins([]);
      setQuery("");
      setError(null);
      setOpen(false);
      setActiveIdx(0);
      setLoadingListing(false);
      setManualRefreshing(false);
      setCreateConfirmKey(null);
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        setError(null);
        setLoadingListing(true);
        await loadListingPins(listingId, ac.signal);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "We couldn’t load listing pins right now.");
      } finally {
        setLoadingListing(false);
      }
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  // -----------------------------
  // Suggestions
  // -----------------------------

  const attachedKeySet = useMemo(() => {
    return new Set(listingPins.map((p) => (p.nameKey ?? p.name.toLowerCase())));
  }, [listingPins]);

  const normalizedQuery = useMemo(() => normalizePinName(query), [query]);
  const queryKey = normalizedQuery.nameKey;

  const suggestions = useMemo(() => {
    const q = queryKey;
    const candidates = workspacePins.filter((p) => !attachedKeySet.has(p.nameKey ?? p.name.toLowerCase()));
    if (!q) return candidates.slice(0, 8);

    return candidates
      .filter((p) => (p.nameKey ?? p.name.toLowerCase()).includes(q))
      .slice(0, 8);
  }, [queryKey, workspacePins, attachedKeySet]);

  const canCreate = useMemo(() => {
    if (!queryKey) return false;
    if (attachedKeySet.has(queryKey)) return false;

    // if exact exists in workspace, don’t show create
    const exists = workspacePins.some((p) => (p.nameKey ?? p.name.toLowerCase()) === queryKey);
    if (exists) return false;

    return !busy;
  }, [queryKey, attachedKeySet, workspacePins, busy]);

  // Billion-dollar polish: fuzzy “did you mean…”
  const didYouMean = useMemo(() => {
    const q = queryKey;
    if (!q || q.length < 4) return [];

    // Don’t fuzz if we already have strong suggestions
    if (suggestions.length > 0) return [];

    // Cap work: only fuzzy over a filtered subset
    const first = q[0];
    const pool = workspacePins
      .filter((p) => {
        const k = (p.nameKey ?? p.name.toLowerCase());
        return k[0] === first || k.includes(q.slice(0, 2));
      })
      .slice(0, 250); // hard cap

    const scored = pool
      .map((p) => {
        const k = (p.nameKey ?? p.name.toLowerCase());
        const d = levenshtein(q, k);
        return { pin: p, d };
      })
      .filter((x) => x.d <= 2)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.pin);

    return scored;
  }, [queryKey, workspacePins, suggestions.length]);

  useEffect(() => {
    const q = query.trim();

    // ✅ Dropdown only for real content (suggestions / did-you-mean)
    const shouldOpen = Boolean(q) && (suggestions.length > 0 || didYouMean.length > 0) && canUse;
    setOpen(shouldOpen);
    setActiveIdx(0);

    // If user changes the text after arming confirm, disarm
    if (createConfirmKey && createConfirmKey !== queryKey) {
      setCreateConfirmKey(null);
    }
  }, [query, suggestions.length, didYouMean.length, canUse, createConfirmKey, queryKey]);

  function scheduleCloseDropdown() {
    if (blurCloseTimer.current) window.clearTimeout(blurCloseTimer.current);
    blurCloseTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  function cancelCloseDropdown() {
    if (blurCloseTimer.current) window.clearTimeout(blurCloseTimer.current);
    blurCloseTimer.current = null;
  }

  // -----------------------------
  // Mutations (optimistic + silent revalidate)
  // -----------------------------

  async function attachByPinId(pinId: string) {
    if (!listingId) return;

    const pin = workspacePins.find((p) => p.id === pinId);
    const optimisticName = pin?.name ?? "Pin";
    const optimisticKey = pin?.nameKey ?? optimisticName.toLowerCase();

    const tempId = `temp:${Date.now()}`;
    setListingPins((prev) => [{ id: tempId, name: optimisticName, nameKey: optimisticKey }, ...prev]);
    setQuery("");
    setOpen(false);
    setCreateConfirmKey(null);

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/pins/listings/attach/${listingId}`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ pinId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to attach pin.");
      }

      await refreshListing(listingId, { silent: true });
      inputRef.current?.focus();
    } catch (e: any) {
      setListingPins((prev) => prev.filter((p) => p.id !== tempId));
      console.error("attachByPinId error:", e);
      setError(e?.message || "We couldn’t attach that pin.");
    } finally {
      setSaving(false);
    }
  }

  async function createAndAttachConfirmed(nameRaw: string) {
    if (!listingId) return;

    const { name, nameKey } = normalizePinName(nameRaw);
    if (!nameKey) return;

    // Optimistic add
    const tempId = `temp:${Date.now()}`;
    setListingPins((prev) => [{ id: tempId, name, nameKey }, ...prev]);
    setQuery("");
    setOpen(false);
    setCreateConfirmKey(null);

    try {
      setCreating(true);
      setError(null);

      const res = await fetch(`/api/pins/listings/attach/${listingId}`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name, allowCreate: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create pin.");
      }

      await Promise.all([refreshWorkspace({ silent: true }), refreshListing(listingId, { silent: true })]);
      inputRef.current?.focus();
    } catch (e: any) {
      setListingPins((prev) => prev.filter((p) => p.id !== tempId));
      console.error("createAndAttachConfirmed error:", e);
      setError(e?.message || "We couldn’t create that pin.");
    } finally {
      setCreating(false);
    }
  }

  async function detach(pinId: string) {
    if (!listingId) return;

    const snapshot = listingPins;
    setListingPins((prev) => prev.filter((p) => p.id !== pinId));

    try {
      setRemoving((p) => ({ ...p, [pinId]: true }));
      setError(null);

      const res = await fetch(`/api/pins/listings/detach/${listingId}/${pinId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to remove pin.");
      }

      await refreshListing(listingId, { silent: true });
    } catch (e: any) {
      setListingPins(snapshot);
      console.error("detach error:", e);
      setError(e?.message || "We couldn’t remove that pin.");
    } finally {
      setRemoving((p) => ({ ...p, [pinId]: false }));
    }
  }

  function armCreateConfirm() {
    if (!canCreate) return;
    if (!queryKey) return;
    setCreateConfirmKey(queryKey);
    setOpen(false); // ✅ don’t compete with dropdown
  }

  // Commit (second enter)
  function commit() {
    if (!listingId) {
      onRequiresSave?.();
      return;
    }

    const { name, nameKey } = normalizePinName(query);
    if (!nameKey) return;

    // If already armed, this Enter confirms the global create
    if (createConfirmKey === nameKey) {
      void createAndAttachConfirmed(name);
      return;
    }

    // Otherwise, arm confirm instead of creating immediately
    if (canCreate) {
      armCreateConfirm();
    }
  }

  // -----------------------------
  // Keyboard
  // -----------------------------

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setOpen(false);
      setCreateConfirmKey(null);
      return;
    }

    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }

    if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (!canUse || busy) return;

      if (open && suggestions[activeIdx]) {
        void attachByPinId(suggestions[activeIdx].id);
        return;
      }

      // If no suggestion selected, Enter is “create” flow (but guarded)
      commit();
    }
  }

  // -----------------------------
  // UI
  // -----------------------------

  const showEmptyState = !!listingId && !loadingListing && listingPins.length === 0;
  const showChips = !!listingId && !loadingListing && listingPins.length > 0;

  const isConfirmArmed = !!createConfirmKey && createConfirmKey === queryKey;

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-950/60 to-slate-900/50 p-4 shadow-[0_0_40px_rgba(2,6,23,0.55)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-200/80 shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/90">Pins</p>
          </div>
          <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
            Zero-friction tags for preferences, status, context — type and press Enter.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void manualRefresh()}
          disabled={!listingId || manualRefreshing || loadingListing}
          className="rounded-full border border-slate-700/70 bg-slate-950/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {manualRefreshing || loadingListing ? "Syncing…" : "Refresh"}
        </button>
      </div>

      {/* Requires save state */}
      {!listingId && (
        <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
          <p className="text-[11px] text-[var(--avillo-cream-muted)]">Save this listing to start pinning.</p>
          {onRequiresSave && (
            <button
              type="button"
              onClick={onRequiresSave}
              className="mt-2 inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100 hover:bg-amber-50/20"
            >
              Save listing
            </button>
          )}
        </div>
      )}

      {listingId && (
        <>
          {/* Error */}
          {error && (
            <div className="mt-4 rounded-xl border border-rose-400/60 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-50">
              {error}
            </div>
          )}

          {/* Attached pins */}
          <div className="mt-4 min-h-[44px]">
            {loadingListing ? (
              <div className="flex flex-wrap gap-2">
                <div className="h-8 w-24 rounded-full bg-white/5 animate-pulse" />
                <div className="h-8 w-20 rounded-full bg-white/5 animate-pulse" />
                <div className="h-8 w-28 rounded-full bg-white/5 animate-pulse" />
              </div>
            ) : showEmptyState ? (
              <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">No pins yet — add your first below.</p>
            ) : showChips ? (
              <div className="flex flex-wrap gap-2">
                {listingPins.map((p) => (
                  <span
                    key={p.id}
                    className="group inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-950/50 px-3 py-1.5 text-[10px] text-[var(--avillo-cream-soft)] shadow-[0_0_18px_rgba(15,23,42,0.35)]"
                  >
                    <span className="max-w-[220px] truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => void detach(p.id)}
                      disabled={!!removing[p.id]}
                      className="rounded-full border border-slate-700/60 bg-slate-950/60 px-1.5 text-[10px] leading-none text-[var(--avillo-cream-muted)] opacity-80 hover:border-rose-400/80 hover:bg-rose-900/40 hover:text-rose-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Remove pin"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Input + dropdown */}
          <div className="mt-4">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <span className="text-[12px] font-semibold text-amber-100/80">+</span>
              </div>

              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCreateConfirmKey(null);
                }}
                onKeyDown={onInputKeyDown}
                onFocus={() => {
                  cancelCloseDropdown();
                  const q = query.trim();
                  if (q && (suggestions.length > 0 || didYouMean.length > 0) && canUse) setOpen(true);
                }}
                onBlur={() => scheduleCloseDropdown()}
                placeholder={disabled ? "Pins disabled" : "Add a pin…"}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/50 py-3 pl-8 pr-28 text-[12px] text-slate-50 outline-none shadow-[0_0_30px_rgba(2,6,23,0.45)] placeholder:text-slate-400/70 focus:border-amber-100/70 focus:shadow-[0_0_40px_rgba(251,191,36,0.10)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canUse}
              />

              {/* Right HUD helper */}
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
                  {busy ? "Saving…" : isConfirmArmed ? "Confirm" : "Enter"}
                </span>
              </div>

              {/* Dropdown = ONLY when we have content */}
              {open && (suggestions.length > 0 || didYouMean.length > 0) && (
                <div
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#050814] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                  onMouseEnter={cancelCloseDropdown}
                  onMouseLeave={scheduleCloseDropdown}
                >
                  <div className="max-h-[240px] overflow-auto">
                    {/* Fuzzy “Did you mean…” */}
                    {didYouMean.length > 0 && (
                      <div className="border-b border-white/10 bg-white/[0.02] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
                          Did you mean
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {didYouMean.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => void attachByPinId(p.id)}
                              disabled={!canUse || busy}
                              className="rounded-full border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-[10px] font-semibold text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50 disabled:opacity-50"
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {suggestions.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void attachByPinId(s.id)}
                        disabled={!canUse || busy}
                        className={cx(
                          "w-full px-3 py-2 text-left text-[12px] text-[var(--avillo-cream-soft)]",
                          "border-b border-white/5 last:border-b-0",
                          idx === activeIdx ? "bg-white/10" : "bg-transparent hover:bg-white/5"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{s.name}</span>
                          <span className="ml-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
                            Add
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ✅ Create confirm = compact single bar (never competes with dropdown) */}
            {canCreate && (
              <div className="mt-2">
                {!isConfirmArmed ? (
                  <button
                    type="button"
                    onClick={() => armCreateConfirm()}
                    disabled={!canUse || busy}
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/35 px-3 py-2 text-left text-[11px] text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50 disabled:opacity-50"
                  >
                    <span className="text-[var(--avillo-cream-muted)]">Create</span>{" "}
                    <span className="text-amber-100">{normalizedQuery.name}</span>{" "}
                    <span className="text-[10px] text-[var(--avillo-cream-muted)]">as a global pin</span>
                    <span className="float-right text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
                      Tap to arm
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/25 bg-amber-500/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[var(--avillo-cream-soft)]">
                        Create <span className="text-amber-100">{normalizedQuery.name}</span> globally?
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                        Press <span className="text-amber-100">Enter</span> again (desktop) or tap confirm.
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => void createAndAttachConfirmed(normalizedQuery.name)}
                        disabled={!canUse || busy}
                        className="rounded-full border border-amber-100/60 bg-amber-50/10 px-3 py-1.5 text-[10px] font-semibold text-amber-50 hover:bg-amber-50/20 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateConfirmKey(null)}
                        className="rounded-full border border-slate-700/70 bg-slate-950/40 px-3 py-1.5 text-[10px] font-semibold text-[var(--avillo-cream-muted)] hover:border-rose-400/70 hover:text-rose-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Micro-instruction (only when it helps) */}
            {query.trim() && (suggestions.length > 0 || didYouMean.length > 0) && (
              <p className="mt-2 text-[10px] text-[var(--avillo-cream-muted)]">
                {suggestions.length
                  ? "Use ↑/↓ then Enter — or click a suggestion."
                  : "Tap a suggestion to avoid creating a typo pin."}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}