//components/listings/listing-notes-tasks-card.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ListingNote = {
  id: string;
  text: string;
  createdAt: string; // ISO
  taskAt?: string | null; // ISO
};

function ianaTZ() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function safeParseDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(iso: string) {
  const d = safeParseDate(iso);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ListingNotesTasksCard(props: {
  listingId: string | null | undefined;
  disabled?: boolean;
  className?: string;

  // NEW: optional prefetched notes (from Listings page cache)
  prefetchedNotes?: ListingNote[] | null;

  /**
   * Optional: if parent wants to refresh ListingActivityCard after a note is created
   * (ex: increment a key, or call a reload function).
   */
  onNoteCreated?: (note: ListingNote) => void;
}) {
  const {
    listingId,
    disabled = false,
    className,
    prefetchedNotes,
    onNoteCreated,
  } = props;

  // NEW: initialize from prefetched notes when provided
  const [notes, setNotes] = useState<ListingNote[]>(prefetchedNotes ?? []);
  const [loading, setLoading] = useState(false);

  const [draftText, setDraftText] = useState("");
  const [draftTaskAt, setDraftTaskAt] = useState(""); // datetime-local string
  const [saving, setSaving] = useState(false);

  const canUse = !!listingId && !disabled;
  const canSave = canUse && !saving && !!draftText.trim();

  // Lightweight load: we can pull notes from activity feed (kind="note") so we don't need a separate GET route.
  // If notes were prefetched, render instantly and skip the loading spinner.
  useEffect(() => {
    if (!listingId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    // NEW: if parent provided notes, hydrate immediately and don't fetch
    if (prefetchedNotes) {
      setNotes(prefetchedNotes);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadNotesFromActivity() {
      try {
        setLoading(true);
        const res = await fetch(`/api/listings/${listingId}/activity`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setNotes([]);
          return;
        }
        const data = await res.json().catch(() => null);
        const items = Array.isArray(data?.items) ? data.items : [];

        const next: ListingNote[] = items
          // NEW: don't require noteId to be a string (API may return number)
          .filter((it: any) => it?.kind === "note" && it?.meta?.noteId)
          .map((it: any) => ({
            id: String(it.meta.noteId),
            text: String(it.subtitle ?? ""),
            createdAt: String(it.at),
            taskAt: it?.meta?.taskAt ? String(it.meta.taskAt) : null,
          }));

        setNotes(next);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setNotes([]);
      } finally {
        setLoading(false);
      }
    }

    loadNotesFromActivity();
    return () => controller.abort();
  }, [listingId, prefetchedNotes]);

  const sortedNotes = useMemo(() => {
    return notes
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [notes]);

  async function handleSaveNote() {
    if (!listingId) return;
    if (!draftText.trim()) return;

    try {
      setSaving(true);

      const res = await fetch(`/api/listings/${listingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: draftText,
          taskAt: draftTaskAt || null, // datetime-local string; server interprets with tz
          tz: ianaTZ(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save note.");
      }

      const data = await res.json();
      const note: ListingNote = data?.note;

      if (!note?.id) throw new Error("Note saved but response was malformed.");

      // Optimistic prepend
      setNotes((prev) => [note, ...prev]);

      setDraftText("");
      setDraftTaskAt("");

      onNoteCreated?.(note);
    } catch (e: any) {
      // Keep same “inline error” style as People
      alert(e?.message || "We couldn’t save this note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={
        "rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3 " +
        (className ?? "")
      }
    >
      <p className="text-[11px] font-semibold text-amber-100/90">
        Notes & tasks
      </p>

      {!listingId ? (
        <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
          Select a listing first, then you can log notes and create tasks tied
          to your dashboard.
        </p>
      ) : (
        <>
          {/* Existing notes */}
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
            {loading && (
              <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                Loading notes…
              </p>
            )}

            {!loading && sortedNotes.length === 0 && (
              <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">
                No notes yet. Log your first touchpoint below.
              </p>
            )}

            {!loading &&
              sortedNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-md border border-slate-800/80 bg-slate-900/60 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      {fmt(note.createdAt)}
                    </span>

                    {note.taskAt && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        Task {fmt(note.taskAt)}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-50">
                    {note.text}
                  </p>
                </div>
              ))}
          </div>

          {/* Composer */}
          <div className="mt-3 space-y-2">
            <textarea
              rows={3}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Log a quick note, call summary, or next steps…"
              className="w-full resize-none rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
              disabled={!canUse}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-[10px] text-[var(--avillo-cream-muted)]">
                Set to create a Task:
                <input
                  type="datetime-local"
                  value={draftTaskAt}
                  onChange={(e) => setDraftTaskAt(e.target.value)}
                  className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-50 outline-none focus:border-sky-400/80 focus:ring-1 focus:ring-sky-400/60"
                  disabled={!canUse}
                />
              </label>

              <button
                type="button"
                onClick={handleSaveNote}
                disabled={!canSave}
                className="inline-flex items-center justify-center rounded-full border border-amber-100/80 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.28)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving note…" : "Save note"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}