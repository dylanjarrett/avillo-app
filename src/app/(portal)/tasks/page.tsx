//app/(portal)/tasks/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { FilterPill } from "@/components/ui/filter-pill";
import { useTasksMobileWorkspaceScroll } from "@/hooks/useTasksMobileWorkspaceScroll";

/* ------------------------------------
 * Types
 * -----------------------------------*/

type TaskTab = "open" | "completed";

type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  status: "OPEN" | "DONE";
  source?: "PEOPLE_NOTE" | "AUTOPILOT" | "MANUAL" | string;

  contactId?: string | null;
  listingId?: string | null;
  assignedToUserId?: string | null;

  contact: { id: string; name: string } | null;
  listing: { id: string; address: string } | null;

  createdAt: string;
  completedAt: string | null;
  deletedAt?: string | null;
};

type TasksResponse = { tasks: TaskRow[] };

type DueFilter = "all" | "overdue" | "today" | "week" | "later";

type ContactOption = { id: string; name: string };
type ListingOption = { id: string; address: string | null };

type UserOption = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "AGENT";
};

type WorkspacesMeResp =
  | { ok: true; workspace: { id: string; role: "OWNER" | "ADMIN" | "AGENT" } }
  | { ok?: false; error?: string };

type AccountMeResp =
  | { ok: true; user: { id: string; name: string | null; email: string | null } }
  | { ok?: false; error?: string };

type MembersResp = {
  ok: true;
  members: Array<{
    userId: string;
    role: "OWNER" | "ADMIN" | "AGENT";
    user: { id: string; name: string | null; email: string | null; image: string | null };
  }>;
};

type ContactsResp = { contacts: Array<{ id: string; name: string }> };

type ListingsResp = {
  success: boolean;
  listings: Array<{ id: string; address: string | null }>;
};

/* ------------------------------------
 * Helpers
 * -----------------------------------*/

const isMobile = () =>
  typeof window !== "undefined" && window.innerWidth < 1024;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isOverdue(dueAtIso: string | null) {
  if (!dueAtIso) return false;
  const ts = new Date(dueAtIso).getTime();
  return !Number.isNaN(ts) && ts < Date.now();
}

function isDueToday(dueAtIso: string | null) {
  if (!dueAtIso) return false;
  const ts = new Date(dueAtIso).getTime();
  if (Number.isNaN(ts)) return false;

  const min = startOfDay(new Date()).getTime();
  const max = min + 1000 * 60 * 60 * 24 - 1;
  return ts >= min && ts <= max;
}

function dueBucket(t: TaskRow): DueFilter | "none" {
  if (!t.dueAt) return "none";
  if (isOverdue(t.dueAt)) return "overdue";
  if (isDueToday(t.dueAt)) return "today";

  const start = startOfDay(new Date()).getTime();
  const end7 = start + 1000 * 60 * 60 * 24 * 7;
  const ts = new Date(t.dueAt).getTime();

  if (ts < end7) return "week";
  return "later";
}

function formatDueLabel(dueAtIso: string | null) {
  if (!dueAtIso) return "No due date";

  const d = new Date(dueAtIso);
  if (isOverdue(dueAtIso)) {
    return `Overdue · ${d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  }

  if (isDueToday(dueAtIso)) {
    return `Today · ${d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function taskSourceLabel(source?: string) {
  return (source || "").toUpperCase() === "AUTOPILOT" ? "Autopilot" : null;
}

/** fun + intuitive colors by urgency */
function bucketTone(b: DueFilter | "none") {
  switch (b) {
    case "overdue":
      return {
        rail: "bg-rose-400/80",
        pill: "border-rose-200/70 bg-rose-500/10 text-rose-100",
        meta: "text-rose-200",
        glow: "shadow-[0_0_28px_rgba(244,63,94,0.18)]",
        label: "Overdue",
      };
    case "today":
      return {
        rail: "bg-emerald-300/80",
        pill: "border-emerald-200/70 bg-emerald-500/10 text-emerald-100",
        meta: "text-emerald-200",
        glow: "shadow-[0_0_28px_rgba(34,197,94,0.16)]",
        label: "Today",
      };
    case "week":
      return {
        rail: "bg-amber-300/80",
        pill: "border-amber-200/70 bg-amber-500/10 text-amber-100",
        meta: "text-amber-200",
        glow: "shadow-[0_0_28px_rgba(245,158,11,0.15)]",
        label: "This week",
      };
    case "later":
      return {
        rail: "bg-violet-300/80",
        pill: "border-violet-200/70 bg-violet-500/10 text-violet-100",
        meta: "text-violet-200",
        glow: "shadow-[0_0_28px_rgba(139,92,246,0.14)]",
        label: "Later",
      };
    case "none":
    default:
      return {
        rail: "bg-slate-500/70",
        pill: "border-slate-600/70 bg-slate-900/40 text-[var(--avillo-cream-soft)]",
        meta: "text-[var(--avillo-cream-muted)]",
        glow: "",
        label: "No due",
      };
  }
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------
 * Page
 * -----------------------------------*/

export default function TasksPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // tabs + filters
  const [tab, setTab] = useState<TaskTab>("open");
  const [query, setQuery] = useState("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");

  // data
  const [openTasks, setOpenTasks] = useState<TaskRow[]>([]);
  const [doneTasks, setDoneTasks] = useState<TaskRow[]>([]);

  // dropdown options for workspace
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // current user (for "Me" default + excluding self from member dropdown)
  const [meUserId, setMeUserId] = useState<string | null>(null);

  // prevents UI from "reverting" assignment if tasks refresh omits assignedToUserId
  const [stickyAssignedByTaskId, setStickyAssignedByTaskId] = useState<Record<string, string | null>>({});
  const stickyAssignedRef = useRef<Record<string, string | null>>({});

  useEffect(() => {
    stickyAssignedRef.current = stickyAssignedByTaskId;
  }, [stickyAssignedByTaskId]);

  // selection
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(() => {
    const pool = tab === "open" ? openTasks : doneTasks;
    return pool.find((t) => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, tab, openTasks, doneTasks]);

  function patchTaskInState(taskId: string, patch: Partial<TaskRow>) {
    setOpenTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    setDoneTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  function applyStickyAssignment(t: TaskRow): TaskRow {
    const sticky = stickyAssignedRef.current;
    if (Object.prototype.hasOwnProperty.call(sticky, t.id)) {
      return { ...t, assignedToUserId: sticky[t.id] ?? null };
    }
    return t;
  }

  function normalizeOpenTasks(open: TaskRow[]) {
    const withDue = open.filter((t) => t.dueAt && !t.deletedAt);
    const noDue = open.filter((t) => !t.dueAt && !t.deletedAt);

    withDue.sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());

    return [...withDue.map(applyStickyAssignment), ...noDue.map(applyStickyAssignment)];
  }

  // mobile workspace scroll (Listings-style)
  const {
    workspaceRef,
    captureListScrollY,
    scrollToWorkspaceTop,
    scrollBackToLastListPosition,
  } = useTasksMobileWorkspaceScroll();

  const [workspaceOpenMobile, setWorkspaceOpenMobile] = useState(false);

  function openWorkspace(taskId: string) {
    if (isMobile()) captureListScrollY();
    setSelectedTaskId(taskId);
    setWorkspaceOpenMobile(true);
    if (isMobile()) scrollToWorkspaceTop();
  }

  function backToList() {
    setWorkspaceOpenMobile(false);
    setSelectedTaskId(null);
    if (isMobile()) scrollBackToLastListPosition();
  }

  function closeWorkspaceMobileKeepSelection() {
    if (!isMobile()) return;
    setWorkspaceOpenMobile(false);
    // IMPORTANT: do NOT clear selectedTaskId (keeps list stable)
    scrollBackToLastListPosition();
  }

  function bounceToListIfMobile() {
    closeWorkspaceMobileKeepSelection();
  }

  /* ------------------------------------
   * Data loading
   * -----------------------------------*/

  async function fetchTasks(status: "OPEN" | "DONE") {
    const res = await fetch(`/api/tasks?status=${status}&scope=all`).catch(
      () => null
    );
    if (!res || !res.ok) return [];
    const data: TasksResponse = await res.json();
    return data.tasks ?? [];
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setOptionsLoading(true);
        setError(null);

        const [open, done, meRes, accountMeRes, contactsRes, listingsRes] = await Promise.all([
          fetchTasks("OPEN"),
          fetchTasks("DONE"),
          fetch("/api/workspaces/me").catch(() => null),
          fetch("/api/account/me").catch(() => null),
          fetch("/api/crm/contacts?includePartners=false").catch(() => null),
          fetch("/api/listings?status=all").catch(() => null),
        ]);

        if (cancelled) return;

        // -------- me (userId) ----------
        let myUserId: string | null = null;
        try {
          if (accountMeRes?.ok) {
            const me: AccountMeResp = await accountMeRes.json();
            myUserId = (me as any)?.user?.id ?? null;
          }
        } catch {
          myUserId = null;
        }
        setMeUserId(myUserId);

        // -------- tasks sorting ----------
        setOpenTasks(normalizeOpenTasks(open));
        setDoneTasks(done.filter((t) => !t.deletedAt).map(applyStickyAssignment));

        // -------- options: contacts ----------
        try {
          if (contactsRes?.ok) {
            const data: ContactsResp = await contactsRes.json();
            const opts = (data.contacts ?? [])
              .map((c) => ({ id: c.id, name: c.name }))
              .sort((a, b) => a.name.localeCompare(b.name));
            setContactOptions(opts);
          } else {
            setContactOptions([]);
          }
        } catch {
          setContactOptions([]);
        }

        // -------- options: listings ----------
        try {
          if (listingsRes?.ok) {
            const data: ListingsResp = await listingsRes.json();
            const opts = (data.listings ?? [])
              .map((l) => ({ id: l.id, address: l.address }))
              .sort((a, b) => String(a.address ?? "").localeCompare(String(b.address ?? "")));
            setListingOptions(opts);
          } else {
            setListingOptions([]);
          }
        } catch {
          setListingOptions([]);
        }

        // -------- options: members (needs workspaceId) ----------
        try {
          if (meRes?.ok) {
            const me: WorkspacesMeResp = await meRes.json();
            const wsId = (me as any)?.workspace?.id as string | undefined;

            if (wsId) {
              const membersRes = await fetch(`/api/workspaces/${wsId}/members`).catch(() => null);
              if (membersRes?.ok) {
                const mem: MembersResp = await membersRes.json();
                const opts = (mem.members ?? [])
                  .filter((m) => !myUserId || m.userId !== myUserId) // exclude me
                  .map((m) => ({
                    id: m.userId,
                    name: m.user?.name || m.user?.email || "Member",
                    role: m.role,
                  }))
                  .sort((a, b) => a.name.localeCompare(b.name));

                setUserOptions(opts);
              } else {
                setUserOptions([]);
              }
            } else {
              setUserOptions([]);
            }
          } else {
            setUserOptions([]);
          }
        } catch {
          setUserOptions([]);
        }
      } catch {
        setError("Couldn’t load tasks. Try refreshing.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setOptionsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------
   * Derived lists
   * -----------------------------------*/

  const visibleTasks = useMemo(() => {
    const base = tab === "open" ? openTasks : doneTasks;

    let list = base;

    if (tab === "open" && dueFilter !== "all") {
      list = list.filter((t) => dueBucket(t) === dueFilter);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) =>
        [
          t.title,
          t.notes,
          t.contact?.name,
          t.listing?.address,
          taskSourceLabel(t.source) ?? "",
          t.dueAt ? formatDueLabel(t.dueAt) : "",
        ]
      );
    }

    return list;
  }, [tab, openTasks, doneTasks, dueFilter, query]);

  /* ------------------------------------
   * Counts
   * -----------------------------------*/

  const counts = useMemo(() => {
    const open = openTasks.length;
    const done = doneTasks.length;

    let overdue = 0;
    let today = 0;
    let week = 0;
    let later = 0;

    for (const t of openTasks) {
      const b = dueBucket(t);
      if (b === "overdue") overdue += 1;
      else if (b === "today") today += 1;
      else if (b === "week") week += 1;
      else if (b === "later") later += 1;
    }

    return { open, done, overdue, today, week, later };
  }, [openTasks, doneTasks]);

  /* ------------------------------------
   * Mutations
   * -----------------------------------*/

  const [busyId, setBusyId] = useState<string | null>(null);

  const [savingDetailsId, setSavingDetailsId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  async function saveTaskDetails(
    taskId: string,
    payload: {
      title?: string;
      notes?: string | null;
      dueAt?: string | null;
      contactId?: string | null;
      listingId?: string | null;
    }
  ) {
    if (!taskId) return;

    bounceToListIfMobile();

    setSavingDetailsId(taskId);
    setError(null);

    // optimistic
    patchTaskInState(taskId, {
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
      ...(payload.dueAt !== undefined ? { dueAt: payload.dueAt } : {}),
      ...(payload.contactId !== undefined ? { contactId: payload.contactId } : {}),
      ...(payload.listingId !== undefined ? { listingId: payload.listingId } : {}),
    });

    try {
      const res = await fetch(`/api/tasks/${taskId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        await refreshAll();
        throw new Error(data?.error || "Failed to save task.");
      }

      // your details route returns { success, task }
      const saved = data?.task as Partial<TaskRow> | undefined;
      if (saved?.id) {
        patchTaskInState(taskId, {
          title: saved.title ?? undefined,
          notes: saved.notes ?? undefined,
          dueAt: saved.dueAt ?? undefined,
          contactId: (saved as any).contactId ?? undefined,
          listingId: (saved as any).listingId ?? undefined,
          assignedToUserId: (saved as any).assignedToUserId ?? undefined,
        });
      }

      // refresh to restore nested contact/listing names, and to re-sort lists
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || "Couldn’t save task changes.");
    } finally {
      setSavingDetailsId(null);
    }
  }

  async function assignTask(taskId: string, assignedToUserId: string) {
    if (!taskId || !assignedToUserId) return;

    bounceToListIfMobile();

    setAssigningId(taskId);
    setError(null);

    // optimistic + sticky (prevents refresh overwrite)
    patchTaskInState(taskId, { assignedToUserId });
    setStickyAssignedByTaskId((prev) => ({ ...prev, [taskId]: assignedToUserId }));

    try {
      const res = await fetch(`/api/tasks/${taskId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // rollback sticky + state
        setStickyAssignedByTaskId((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        await refreshAll();
        throw new Error(data?.error || "Failed to assign task.");
      }

      // lock in whatever server says (fallback to request value)
      const savedAssigned = (data?.task as any)?.assignedToUserId ?? assignedToUserId;

      patchTaskInState(taskId, { assignedToUserId: savedAssigned });
      setStickyAssignedByTaskId((prev) => ({ ...prev, [taskId]: savedAssigned }));

      // IMPORTANT: do NOT refresh here (refresh was wiping the value)
    } catch (err: any) {
      setError(err?.message || "Couldn’t assign task.");
    } finally {
      setAssigningId(null);
    }
  }

  const [creatingNew, setCreatingNew] = useState(false);

  // undo delete
  const [lastDeleted, setLastDeleted] = useState<TaskRow | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showUndo(task: TaskRow) {
    setLastDeleted(task);
    setUndoVisible(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoVisible(false);
      undoTimerRef.current = null;
    }, 6500);
  }

  function hideUndo() {
    setUndoVisible(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  async function refreshAll() {
    const [open, done] = await Promise.all([
    fetchTasks("OPEN"),
    fetchTasks("DONE"),
  ]);

  setOpenTasks(normalizeOpenTasks(open));
  setDoneTasks(done.filter((t) => !t.deletedAt).map(applyStickyAssignment));
  }

  async function markTaskDone(taskId: string) {
    if (!taskId) return;
    
    bounceToListIfMobile();
    
    setBusyId(taskId);

    const prevOpen = openTasks;
    const prevDone = doneTasks;

    const moved = prevOpen.find((t) => t.id === taskId) || null;
    setOpenTasks((p) => p.filter((t) => t.id !== taskId));
    if (moved)
      setDoneTasks((p) => [
        { ...moved, status: "DONE", completedAt: new Date().toISOString() },
        ...p,
      ]);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      if (!res.ok) {
        setOpenTasks(prevOpen);
        setDoneTasks(prevDone);
      }
    } catch {
      setOpenTasks(prevOpen);
      setDoneTasks(prevDone);
    } finally {
      setBusyId(null);
    }
  }

  async function reopenTask(taskId: string) {
    if (!taskId) return;

    bounceToListIfMobile();

    setBusyId(taskId);

    const prevOpen = openTasks;
    const prevDone = doneTasks;

    const moved = prevDone.find((t) => t.id === taskId) || null;
    setDoneTasks((p) => p.filter((t) => t.id !== taskId));
    if (moved)
      setOpenTasks((p) => [{ ...moved, status: "OPEN", completedAt: null }, ...p]);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "OPEN" }),
      });
      if (!res.ok) {
        setOpenTasks(prevOpen);
        setDoneTasks(prevDone);
      }
    } catch {
      setOpenTasks(prevOpen);
      setDoneTasks(prevDone);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTask(taskId: string) {
    if (!taskId) return;
    setBusyId(taskId);

    const prevOpen = openTasks;
    const prevDone = doneTasks;

    const t =
      prevOpen.find((x) => x.id === taskId) ||
      prevDone.find((x) => x.id === taskId) ||
      null;

    setOpenTasks((p) => p.filter((x) => x.id !== taskId));
    setDoneTasks((p) => p.filter((x) => x.id !== taskId));

    if (t) showUndo(t);

    if (selectedTaskId === taskId) {
      setSelectedTaskId(null);
      if (isMobile()) setWorkspaceOpenMobile(false);
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        setOpenTasks(prevOpen);
        setDoneTasks(prevDone);
        hideUndo();
        setLastDeleted(null);
      }
    } catch {
      setOpenTasks(prevOpen);
      setDoneTasks(prevDone);
      hideUndo();
      setLastDeleted(null);
    } finally {
      setBusyId(null);
    }
  }

  async function undoDelete() {
    if (!lastDeleted) return;
    hideUndo();

    try {
      const res = await fetch(`/api/tasks/${lastDeleted.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) await refreshAll();
      else await refreshAll();
    } catch {
      await refreshAll();
    } finally {
      setLastDeleted(null);
    }
  }

  async function createNewTask() {
    if (creatingNew) return;

    setCreatingNew(true);
    setError(null);

    // Optimistic placeholder so UI feels instant
    const tempId = `tmp_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2)}`;

    const optimistic: TaskRow = {
      id: tempId,
      title: "New task",
      notes: null,
      dueAt: null,
      status: "OPEN",
      source: "MANUAL",

      contactId: null,
      listingId: null,
      assignedToUserId: null,

      contact: null,
      listing: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
  };

  // Ensure we’re in the right view + show the new task immediately
  setTab("open");
  setDueFilter("all");
  setQuery("");

  setOpenTasks((prev) => [optimistic, ...prev]);
  openWorkspace(tempId);

  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New task",
        notes: null,
        dueAt: null,
        source: "MANUAL",
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to create task.");
    }

    const data = await res.json().catch(() => null);

    const raw = (data?.task ?? data) as Partial<TaskRow> | null;
    if (!raw?.id) throw new Error("Task create returned no id.");

    const saved: TaskRow = {
      id: raw.id,
      title: raw.title ?? "New task",
      notes: raw.notes ?? null,
      dueAt: raw.dueAt ?? null,
      status: raw.status ?? "OPEN",
      source: raw.source ?? "MANUAL",
      contactId: (raw as any).contactId ?? null,
      listingId: (raw as any).listingId ?? null,
      assignedToUserId: (raw as any).assignedToUserId ?? null,
      contact: (raw as any).contact ?? null,
      listing: (raw as any).listing ?? null,
      createdAt: raw.createdAt ?? new Date().toISOString(),
      completedAt: raw.completedAt ?? null,
      deletedAt: (raw as any).deletedAt ?? null,
    };

    // Replace the optimistic temp task with the real one
    setOpenTasks((prev) => prev.map((t) => (t.id === tempId ? saved : t)));

    // Point selection to the real ID so workspace stays valid
    setSelectedTaskId(saved.id);
    await refreshAll();
    setWorkspaceOpenMobile(true);
  } catch (err: any) {
    // Rollback optimistic
    setOpenTasks((prev) => prev.filter((t) => t.id !== tempId));
    setSelectedTaskId(null);
    if (isMobile()) setWorkspaceOpenMobile(false);

    setError(err?.message || "We couldn’t create that task. Try again.");
  } finally {
    setCreatingNew(false);
  }
}

  /* ------------------------------------
   * Render
   * -----------------------------------*/

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tasks"
        title="Stay ahead of follow-ups"
        subtitle="Keep your task workflow tight — prioritize urgent items, complete fast, and move on."
      />

      {error && (
        <div className="rounded-2xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
          {error}
        </div>
      )}

      <section className="space-y-5">
        {/* Top bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
              Task manager
            </p>
            <p className="mt-1 max-w-xl text-xs text-[var(--avillo-cream-soft)]">
              Scan by urgency, knock out quick wins, and keep momentum. Tasks with no due
              date stay visible (but don’t clutter urgency filters).
            </p>
          </div>

          {/* Search + New task (desktop search; mobile search lives above task cards) */}
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center md:gap-3">
            {/* Desktop search */}
            <div className="hidden w-full md:block md:w-72">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, notes, contact, listing..."
                className="avillo-input w-full"
              />
            </div>

            {/* New task (all breakpoints) */}
            <div className="w-full md:w-auto">
              <button
                type="button"
                onClick={() => void createNewTask()}
                disabled={creatingNew}
                className="inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_26px_rgba(248,250,252,0.2)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingNew ? "Creating..." : "+ New task"}
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Open tasks" value={counts.open} tone="slate" />
          <StatCard label="Overdue" value={counts.overdue} tone="rose" />
          <StatCard label="Due today" value={counts.today} tone="emerald" />
          <StatCard label="Completed" value={counts.done} tone="sky" />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex flex-wrap gap-2 text-xs">
            <FilterPill
              label="Open"
              count={counts.open}
              active={tab === "open"}
              onClick={() => {
                setTab("open");
                setSelectedTaskId(null);
                if (isMobile()) setWorkspaceOpenMobile(false);
              }}
            />
            <FilterPill
              label="Completed"
              count={counts.done}
              active={tab === "completed"}
              onClick={() => {
                setTab("completed");
                setSelectedTaskId(null);
                if (isMobile()) setWorkspaceOpenMobile(false);
              }}
            />
          </div>

          {tab === "open" && (
            <div className="inline-flex flex-wrap gap-2 text-xs">
              <FilterPill
                label="All"
                count={counts.open}
                active={dueFilter === "all"}
                onClick={() => setDueFilter("all")}
              />
              <FilterPill
                label="Overdue"
                count={counts.overdue}
                active={dueFilter === "overdue"}
                onClick={() => setDueFilter("overdue")}
              />
              <FilterPill
                label="Today"
                count={counts.today}
                active={dueFilter === "today"}
                onClick={() => setDueFilter("today")}
              />
              <FilterPill
                label="This week"
                count={counts.week}
                active={dueFilter === "week"}
                onClick={() => setDueFilter("week")}
              />
              <FilterPill
                label="Later"
                count={counts.later}
                active={dueFilter === "later"}
                onClick={() => setDueFilter("later")}
              />
            </div>
          )}
        </div>

        {/* Main grid */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)]">

          {/* Mobile search (directly above task cards, like Listings mobile) */}
            <div className="mb-0 md:hidden">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, notes, contact, listing..."
                className="avillo-input w-full"
              />
            </div>

          {/* LEFT: list */}
          <div
            className={
              "relative rounded-2xl border border-[#1d2940] bg-gradient-to-br from-[#050b16] to-[#0a1223] px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "hidden" : "block") +
              " md:block lg:flex lg:flex-col lg:max-h-[calc(100vh-170px)]"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Task list
              </p>
              <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                {loading
                  ? "Loading…"
                  : `${visibleTasks.length} ${visibleTasks.length === 1 ? "task" : "tasks"}`}
              </p>
            </div>

            <div className="flex-1 min-h-0 pt-2 pb-1 lg:overflow-y-auto lg:pr-1">
              {loading && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Loading your tasks…
                </p>
              )}

              {!loading && visibleTasks.length === 0 && (
                <EmptyPill
                  title={tab === "open" ? "Nothing open right now (nice)." : "No completed tasks yet."}
                  body={
                    tab === "open"
                      ? "Tasks created from People notes, Autopilot, and manual creation will show here."
                      : "Mark tasks Done and they’ll appear here so you can reference what you finished."
                  }
                />
              )}

              {!loading &&
                visibleTasks.slice(0, 200).map((t) => {
                  const selected = t.id === selectedTaskId;

                  const meta =
                    tab === "open"
                      ? formatDueLabel(t.dueAt)
                      : t.completedAt
                      ? `Completed · ${new Date(t.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : "Completed";

                  const bucket = tab === "open" ? dueBucket(t) : "none";
                  const tone = bucketTone(bucket);

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openWorkspace(t.id)}
                      className={cx(
                        "group relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left transition",
                        selected
                          ? cx(
                              "border-[rgba(242,235,221,0.55)] bg-[#050b16]/95",
                              "shadow-[0_0_28px_rgba(248,250,252,0.18)]"
                            )
                          : "border-[#1d2940] bg-[#050b16]/85 hover:border-[rgba(242,235,221,0.42)] hover:bg-[#050b16]/95"
                      )}
                    >
                      {/* left rail */}
                      <span
                        className={cx(
                          "pointer-events-none absolute left-0 top-0 h-full w-[3px] opacity-70",
                          tab === "open" ? tone.rail : "bg-slate-600/70"
                        )}
                      />

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[12px] font-semibold text-slate-50">
                              {t.title || "Task"}
                            </p>

                            {taskSourceLabel(t.source) && (
                            <span className="inline-flex items-center rounded-full border border-fuchsia-200/70 bg-fuchsia-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-fuchsia-100">
                              {taskSourceLabel(t.source)}
                            </span>
                          )}

                            {tab === "open" && (
                              <span
                                className={cx(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
                                  tone.pill
                                )}
                              >
                                {tone.label}
                              </span>
                            )}
                          </div>

                          {(t.contact?.name || t.listing?.address) && (
                            <p className="mt-1 truncate text-[10px] text-[var(--avillo-cream-muted)]">
                              {t.contact?.name ? (
                                <>
                                  {t.contact.name}
                                  {t.listing?.address ? " • " : ""}
                                </>
                              ) : null}
                              {t.listing?.address ? t.listing.address : null}
                            </p>
                          )}

                          {t.notes && (
                            <p className="mt-2 line-clamp-2 text-[11px] text-[var(--avillo-cream-soft)]">
                              {t.notes}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <p
                            className={cx(
                              "text-[10px]",
                              tab === "open" ? tone.meta : "text-[var(--avillo-cream-muted)]"
                            )}
                          >
                            {meta}
                          </p>
                          <p className="mt-2 text-[10px] text-[var(--avillo-cream-muted)]">
                            Tap to view →
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* RIGHT: workspace (People/Listings style) */}
          <div
            ref={workspaceRef}
            className={
              "relative rounded-2xl border border-[#1d2940] bg-gradient-to-br from-[#050b16] to-[#0a1223] px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] overflow-visible scroll-mt-24 " +
              (workspaceOpenMobile ? "block" : "hidden") +
              " md:block lg:flex lg:flex-col lg:max-h-[calc(100vh-170px)] lg:overflow-hidden"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                  Task workspace
                </p>
                <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                  Review details and act fast — mark done, reopen, or delete.
                </p>
              </div>

              <button
                type="button"
                onClick={backToList}
                className="inline-flex items-center gap-2 rounded-full border border-[#1d2940] bg-slate-950/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-[var(--avillo-cream-soft)] shadow-[0_0_18px_rgba(15,23,42,0.9)] hover:border-[rgba(242,235,221,0.45)] hover:bg-slate-950/55 md:hidden"
              >
                <span className="text-xs">←</span>
                <span>Back</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto lg:pr-1">
              {!selectedTask ? (
                <div className="flex h-[420px] items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  <div>
                    <p className="font-semibold text-[var(--avillo-cream-soft)]">
                      No task selected
                    </p>
                    <p className="mt-1 max-w-xs">
                      Choose a task from the list to see notes, due date, and quick actions.
                    </p>
                  </div>
                </div>
              ) : (
                <TaskWorkspace
                  tab={tab}
                  task={selectedTask}
                  busy={busyId === selectedTask.id}
                  saving={savingDetailsId === selectedTask.id}
                  assigning={assigningId === selectedTask.id}
                  optionsLoading={optionsLoading}
                  contactOptions={contactOptions}
                  listingOptions={listingOptions}
                  userOptions={userOptions}
                  meUserId={meUserId}
                  onSaveDetails={(payload) => void saveTaskDetails(selectedTask.id, payload)}
                  onAssign={(userId) => void assignTask(selectedTask.id, userId)}
                  onMarkDone={() => void markTaskDone(selectedTask.id)}
                  onReopen={() => void reopenTask(selectedTask.id)}
                  onDelete={() => void deleteTask(selectedTask.id)}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Undo toast */}
      {undoVisible && lastDeleted && (
        <div className="fixed bottom-5 left-5 z-[9999] max-w-[92vw]">
          <div className="flex items-center gap-3 rounded-2xl border border-[#1d2940] bg-[#050b16]/95 px-4 py-3 shadow-[0_0_40px_rgba(15,23,42,0.92)]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-50">Task deleted</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--avillo-cream-muted)]">
                {lastDeleted.title || "Task"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void undoDelete()}
              className="shrink-0 rounded-xl border border-[rgba(242,235,221,0.45)] bg-[rgba(242,235,221,0.08)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream)] transition hover:border-[rgba(242,235,221,0.7)] hover:bg-[rgba(242,235,221,0.12)]"
            >
              Undo
            </button>

            <button
              type="button"
              onClick={() => {
                hideUndo();
                setLastDeleted(null);
              }}
              className="shrink-0 rounded-xl border border-[#1d2940] bg-slate-950/40 px-3 py-2 text-[10px] font-semibold text-[var(--avillo-cream-soft)] hover:border-[rgba(242,235,221,0.45)]"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------
 * Small components
 * -----------------------------------*/

function EmptyPill({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#1d2940] bg-slate-950/30 px-4 py-3">
      <p className="text-[11px] font-semibold text-slate-50">{title}</p>
      <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">{body}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "rose" | "sky";
}) {
  const glow =
    tone === "emerald"
      ? "shadow-[0_0_25px_rgba(34,197,94,0.20)]"
      : tone === "rose"
      ? "shadow-[0_0_25px_rgba(244,63,94,0.18)]"
      : tone === "sky"
      ? "shadow-[0_0_25px_rgba(59,130,246,0.18)]"
      : "shadow-[0_0_18px_rgba(15,23,42,0.55)]";

  const ring =
    tone === "emerald"
      ? "border-emerald-300/30"
      : tone === "rose"
      ? "border-rose-300/30"
      : tone === "sky"
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
 * Workspace (right card)
 * -----------------------------------*/

function TaskWorkspace({
  tab,
  task,
  busy,
  saving,
  assigning,
  optionsLoading,
  contactOptions,
  listingOptions,
  userOptions,
  meUserId,
  onSaveDetails,
  onAssign,
  onMarkDone,
  onReopen,
  onDelete,
}: {
  tab: TaskTab;
  task: TaskRow;
  busy: boolean;
  saving: boolean;
  assigning: boolean;

  optionsLoading: boolean;
  contactOptions: ContactOption[];
  listingOptions: ListingOption[];
  userOptions: UserOption[];
  meUserId: string | null;

  onSaveDetails: (payload: {
    title?: string;
    notes?: string | null;
    dueAt?: string | null;
    contactId?: string | null;
    listingId?: string | null;
  }) => void;
  onAssign: (userId: string) => void;
  onMarkDone: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const bucket = tab === "open" ? dueBucket(task) : "none";
  const tone = bucketTone(bucket);

  const [title, setTitle] = useState(task.title ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueAtLocal, setDueAtLocal] = useState<string>(() => {
    if (!task.dueAt) return "";
    const d = new Date(task.dueAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  });
  const [contactId, setContactId] = useState<string>(task.contactId ?? task.contact?.id ?? "");
  const [listingId, setListingId] = useState<string>(task.listingId ?? task.listing?.id ?? "");
  const [assignedToUserId, setAssignedToUserId] = useState<string>(
    task.assignedToUserId ?? meUserId ?? ""
  );

  useEffect(() => {
    setTitle(task.title ?? "");
    setNotes(task.notes ?? "");
    setContactId(task.contactId ?? task.contact?.id ?? "");
    setListingId(task.listingId ?? task.listing?.id ?? "");

    // Only reset assignment when switching tasks (NOT on refresh)
    setAssignedToUserId(task.assignedToUserId ?? meUserId ?? "");

    if (!task.dueAt) setDueAtLocal("");
    else {
      const d = new Date(task.dueAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDueAtLocal(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  // When meUserId arrives (async), default assignment to Me if task has none
  useEffect(() => {
    if (!meUserId) return;

    // If task has an assignment, keep it
    if (task.assignedToUserId) return;

    // If dropdown is empty/invalid, set to Me
    setAssignedToUserId(meUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meUserId, task.id]);

  const statusPill =
    tab === "open"
      ? "border-emerald-200/50 bg-emerald-500/10 text-emerald-100"
      : "border-sky-200/50 bg-sky-500/10 text-sky-100";

  return (
    <div className="space-y-4 pb-2 text-xs text-[var(--avillo-cream-soft)]">
      {/* Header card */}
      <div className={cx("rounded-2xl border border-[#1d2940] bg-slate-950/25 px-4 py-4", tone.glow)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Task
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="mt-1 w-full rounded-xl border border-[#1d2940] bg-slate-950/30 px-3 py-2 text-[13px] font-semibold text-[#f7f2e9] outline-none placeholder:text-[var(--avillo-cream-muted)]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {taskSourceLabel(task.source) && (
              <span className="inline-flex items-center rounded-full border border-fuchsia-200/70 bg-fuchsia-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-fuchsia-100">
                {taskSourceLabel(task.source)}
              </span>
            )}

              <span
                className={cx(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
                  statusPill
                )}
              >
                {tab === "open" ? "Open" : "Completed"}
              </span>

              {tab === "open" && (
                <span
                  className={cx(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
                    tone.pill
                  )}
                >
                  {tone.label}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[10px] text-[var(--avillo-cream-muted)]">
              {tab === "open"
                ? formatDueLabel(task.dueAt)
                : task.completedAt
                ? `Completed · ${new Date(task.completedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}`
                : "Completed"}
            </p>
          </div>
        </div>

        {(task.contact?.name || task.listing?.address) && (
          <div className="mt-3 rounded-2xl border border-[#1d2940] bg-slate-950/30 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Attached to
            </p>
            <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
              {task.contact?.name ? (
                <>
                  {task.contact.name}
                  {task.listing?.address ? " • " : ""}
                </>
              ) : null}
              {task.listing?.address ? task.listing.address : null}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {task.contact?.id && (
                <a
                  href={task.contact?.id ? `/people?contactId=${task.contact.id}` : "/people"}
                  className="inline-flex items-center rounded-full border border-[#1d2940] bg-slate-950/25 px-2.5 py-1 text-[10px] font-semibold text-[var(--avillo-cream)] hover:border-[rgba(242,235,221,0.55)]"
                >
                  Open contact →
                </a>
              )}
              {task.listing?.id && (
                <a
                  href={task.listing?.id ? `/listings?listingId=${task.listing.id}` : "/listings"}
                  className="inline-flex items-center rounded-full border border-[#1d2940] bg-slate-950/25 px-2.5 py-1 text-[10px] font-semibold text-[var(--avillo-cream)] hover:border-[rgba(242,235,221,0.55)]"
                >
                  Open listing →
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Notes card */}
      <div className="rounded-2xl border border-[#1d2940] bg-slate-950/25 px-4 py-4">
        <p className="text-[11px] font-semibold text-slate-50">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes…"
          rows={5}
          className="mt-2 w-full resize-none rounded-xl border border-[#1d2940] bg-slate-950/30 px-3 py-2 text-[11px] text-[var(--avillo-cream-soft)] outline-none placeholder:text-[var(--avillo-cream-muted)]"
        />
      </div>

      {/* Details card (manual save) */}
      <div className="rounded-2xl border border-[#1d2940] bg-slate-950/25 px-4 py-4">
        <p className="text-[11px] font-semibold text-slate-50">Details</p>

        <div className="mt-3 grid gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Due date
            </p>
            <input
              type="datetime-local"
              value={dueAtLocal}
              onChange={(e) => setDueAtLocal(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#1d2940] bg-slate-950/30 px-3 py-2 text-[11px] text-[var(--avillo-cream-soft)] outline-none"
            />
            <button
              type="button"
              onClick={() => setDueAtLocal("")}
              className="mt-2 text-[10px] text-[var(--avillo-cream-muted)] hover:text-[var(--avillo-cream-soft)]"
            >
              Clear due date
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Contact
              </p>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={optionsLoading}
                className="mt-1 w-full rounded-xl border border-[#1d2940] bg-slate-950/30 px-3 py-2 text-[11px] text-[var(--avillo-cream-soft)] outline-none disabled:opacity-60"
              >
                <option value="">None</option>
                {contactOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                {optionsLoading ? "Loading contacts…" : "Choose a contact (optional)."}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Listing
              </p>
              <select
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
                disabled={optionsLoading}
                className="mt-1 w-full rounded-xl border border-[#1d2940] bg-slate-950/30 px-3 py-2 text-[11px] text-[var(--avillo-cream-soft)] outline-none disabled:opacity-60"
              >
                <option value="">None</option>
                {listingOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.address || "Listing"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                {optionsLoading ? "Loading listings…" : "Attach to a listing (optional)."}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
              Assigned to
            </p>

            <div className="mt-1 flex gap-2">
              <select
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
                disabled={optionsLoading}
                className="w-full rounded-xl border border-[#1d2940] bg-slate-950/30 px-3 py-2 text-[11px] text-[var(--avillo-cream-soft)] outline-none disabled:opacity-60"
              >
                {meUserId && <option value={meUserId}>Me</option>}

                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} • {u.role}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!assignedToUserId.trim() || assigning || busy}
                onClick={() => onAssign(assignedToUserId.trim())}
                className="shrink-0 rounded-xl border border-[#1d2940] bg-slate-950/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-soft)] hover:border-[rgba(242,235,221,0.45)] disabled:opacity-50"
              >
                {assigning ? "Assigning…" : "Assign"}
              </button>
            </div>

            <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
              {optionsLoading ? "Loading members…" : "Select a teammate, then click Assign."}
            </p>
          </div>

          <button
            type="button"
            disabled={saving || busy}
            onClick={() => {
              const dueAtIso = dueAtLocal ? new Date(dueAtLocal).toISOString() : null;

              onSaveDetails({
                title: title.trim() || "New task",
                notes: notes.trim() ? notes : null,
                dueAt: dueAtIso,
                contactId: contactId.trim() ? contactId.trim() : null,
                listingId: listingId.trim() ? listingId.trim() : null,
              });
            }}
            className="inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-50/20 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Actions card */}
      <div className="rounded-2xl border border-[#1d2940] bg-slate-950/25 px-4 py-4">
        <p className="text-[11px] font-semibold text-slate-50">Actions</p>
        <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
          Keep momentum — complete and move on.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {tab === "open" && (
            <button
              type="button"
              onClick={onMarkDone}
              disabled={busy}
              className="inline-flex w-full items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-40"
            >
              Mark done
            </button>
          )}

          {tab === "completed" && (
            <button
              type="button"
              onClick={onReopen}
              disabled={busy}
              className="inline-flex w-full items-center justify-center rounded-full border border-sky-200/60 bg-sky-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100 hover:bg-sky-500/15 disabled:opacity-40"
            >
              Reopen task
            </button>
          )}

            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="inline-flex w-full items-center justify-center rounded-full border border-rose-300/60 bg-rose-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100 hover:bg-rose-500/15 disabled:opacity-40"
            >
              Delete
            </button>
        </div>

        <div className="mt-4 rounded-2xl border border-[#1d2940] bg-slate-950/30 px-3 py-2 text-[10px] text-[var(--avillo-cream-muted)]">
          {tab === "open" ? (
            <>
              Tip: clear <span className="text-[var(--avillo-cream-strong)]">overdue</span> first, then knock out
              today’s items. “This week” is your momentum bucket.
            </>
          ) : (
            <>Completed tasks stay here for quick reference. Reopen anytime.</>
          )}
        </div>
      </div>
    </div>
  );
}