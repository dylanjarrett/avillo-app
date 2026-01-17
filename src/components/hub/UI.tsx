// components/hub/UI.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------ */
/* Utilities                                                     */
/* ------------------------------------------------------------ */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(n?: number | null) {
  const v = typeof n === "number" ? n : 0;
  if (!v) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  const s = i === 0 ? String(Math.round(x)) : x.toFixed(x >= 10 ? 1 : 2);
  return `${s} ${units[i]}`;
}

export function isImageMime(mime?: string | null) {
  return !!mime && mime.toLowerCase().startsWith("image/");
}

export function isProbablyImageName(name?: string | null) {
  const n = (name || "").toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(n);
}

export function clampText(s: string, max = 180) {
  const t = String(s || "");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

export function isoDay(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nameInitials(name?: string | null) {
  const n = String(name || "").trim();
  if (!n) return "U";
  const parts = n.split(/\s+/g).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

/* ------------------------------------------------------------ */
/* Glass shells                                                  */
/* ------------------------------------------------------------ */

export function GlassShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-3xl",
        "bg-[rgba(10,16,28,0.58)] backdrop-blur-xl",
        "ring-1 ring-amber-200/10",
        "shadow-[0_0_0_1px_rgba(244,210,106,0.04),0_24px_120px_rgba(0,0,0,0.55)]"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.9]"
        style={{
          background:
            "radial-gradient(1100px 600px at 30% 0%, rgba(244,210,106,0.07), transparent 60%), radial-gradient(900px 500px at 80% 10%, rgba(255,255,255,0.05), transparent 55%), linear-gradient(to bottom, rgba(255,255,255,0.04), transparent 30%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(244,210,106,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(244,210,106,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(closest-side at 40% 20%, black, transparent 72%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function GlassPanel({
  children,
  className,
  inner,
}: {
  children: React.ReactNode;
  className?: string;
  inner?: boolean;
}) {
  return (
    <div
      className={cx(
        "relative rounded-3xl border border-amber-200/10",
        inner ? "bg-black/18 shadow-[inset_0_0_70px_rgba(0,0,0,0.55)]" : "bg-white/5",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_40px_rgba(244,210,106,0.05)]"
      />
      <div className="relative h-full min-h-0">{children}</div>
    </div>
  );
}

export function Divider() {
  return <div className="relative h-px w-full bg-gradient-to-r from-amber-200/0 via-amber-200/14 to-amber-200/0" />;
}
export function DividerSoft() {
  return <div className="h-px w-full bg-gradient-to-r from-amber-200/0 via-amber-200/10 to-amber-200/0" />;
}
export function Dot() {
  return <span aria-hidden className="h-1 w-1 rounded-full bg-amber-200/25" />;
}

export function Orb() {
  return (
    <div
      aria-hidden
      className={cx(
        "h-9 w-9 rounded-full ring-1 ring-amber-200/10",
        "bg-[radial-gradient(circle_at_30%_25%,rgba(244,210,106,0.22),transparent_55%),radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.08),transparent_60%)]",
        "shadow-[inset_0_0_26px_rgba(244,210,106,0.10),0_0_26px_rgba(244,210,106,0.08)]"
      )}
    />
  );
}

/* ------------------------------------------------------------ */
/* Pills / buttons / badges                                      */
/* ------------------------------------------------------------ */

export function StatusPill({
  status,
  label,
}: {
  status: "ok" | "loading" | "error";
  label?: string;
}) {
  const cls =
    status === "ok"
      ? "bg-emerald-400/12 text-emerald-100/75 border-emerald-300/20"
      : status === "loading"
      ? "bg-amber-400/10 text-amber-100/70 border-amber-300/20"
      : "bg-red-400/10 text-red-100/70 border-red-300/20";
  const text = label || (status === "ok" ? "Live" : status === "loading" ? "Loading" : "Error");
  return <span className={cx("rounded-full border px-2 py-1 text-[11px]", cls)}>{text}</span>;
}

export function CountBadge({ n, title }: { n: number; title?: string }) {
  if (!n || n <= 0) return null;
  const s = n > 99 ? "99+" : String(n);
  return (
    <span
      title={title}
      className={cx(
        "ml-2 inline-flex items-center justify-center",
        "min-w-[22px] rounded-full border border-amber-200/12 bg-white/6 px-2 py-0.5",
        "text-[11px] font-semibold text-amber-50/75"
      )}
    >
      {s}
    </span>
  );
}

export function SoftButton({
  children,
  onClick,
  title,
  rightHint,
  badge,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  rightHint?: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cx(
        "group relative rounded-2xl border px-3 py-2 text-xs font-medium transition",
        "border-amber-200/10 bg-white/5 text-amber-50/75 hover:bg-white/8"
      )}
    >
      <span className="relative flex items-center gap-2">
        <span className="flex items-center">
          <span>{children}</span>
          {typeof badge === "number" ? <CountBadge n={badge} /> : null}
        </span>
        {rightHint ? (
          <span className="rounded-lg border border-amber-200/10 bg-black/15 px-1.5 py-0.5 text-[10px] text-amber-50/45 group-hover:text-amber-50/60 transition">
            {rightHint}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition shadow-[inset_0_0_24px_rgba(244,210,106,0.06)]"
      />
    </button>
  );
}

export function MiniAction({
  children,
  onClick,
  title,
  subtle,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  subtle?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cx(
        "rounded-xl border px-2 py-1 text-[11px] transition",
        disabled
          ? "cursor-not-allowed border-amber-200/10 bg-transparent text-amber-50/25"
          : subtle
          ? "border-amber-200/10 bg-transparent text-amber-50/55 hover:bg-white/5"
          : "border-amber-200/10 bg-white/5 text-amber-50/60 hover:bg-white/8"
      )}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "relative overflow-hidden rounded-2xl px-4 py-3 text-sm font-semibold transition",
        disabled
          ? "cursor-not-allowed border border-amber-200/10 bg-white/5 text-amber-50/35"
          : "border border-amber-200/15 bg-white/10 text-amber-50 hover:bg-white/15 shadow-[0_0_28px_rgba(244,210,106,0.10)]"
      )}
    >
      {!disabled ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-12 -top-10 h-24 rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-70"
        />
      ) : null}
      <span className="relative">{children}</span>
    </button>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-amber-200/10 bg-white/5 px-2 py-0.5 text-[11px] text-amber-50/60">
      {children}
    </span>
  );
}

export function SkeletonCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3 text-sm text-amber-50/70",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ label, noTop }: { label: string; noTop?: boolean }) {
  return (
    <div className={cx("text-[11px] font-medium tracking-[0.18em] text-amber-100/40", noTop ? "" : "mt-2")}>
      {label.toUpperCase()}
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="mx-3 mt-2 rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-2 text-xs text-amber-50/45">
      {text}
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Collapsible section header (Rooms / DMs)                      */
/* ------------------------------------------------------------ */

export function CollapsibleHeader({
  label,
  open,
  onToggle,
  right,
  noTop,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  noTop?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3">
      <div className="flex items-center gap-2">
        <SectionLabel label={label} noTop={noTop} />
        <MiniAction onClick={onToggle} title={open ? "Collapse" : "Expand"} subtle>
          {open ? "–" : "+"}
        </MiniAction>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Toolbar                                                       */
/* ------------------------------------------------------------ */

export function Toolbar({
  left,
  right,
  className,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-3 px-4 py-3 md:px-5", className)}>
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

export function KbdHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden md:flex items-center gap-2 rounded-2xl border border-amber-200/10 bg-black/20 px-3 py-2">
      <kbd className="text-[11px] text-amber-50/45">{children}</kbd>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Channel row (with unread)                                     */
/* ------------------------------------------------------------ */

export type ChannelRowChannel = {
  id: string;
  name: string;
  type: "BOARD" | "ROOM" | "DM";
  isPrivate?: boolean;
  lastMessageAt?: string | null;
  updatedAt?: string;
};

export function ChannelRow({
  channel,
  selected,
  onClick,
  unreadCount,
  hasUnread,
  lastReadAt,
  trailing,
}: {
  channel: ChannelRowChannel;
  selected: boolean;
  onClick: () => void;
  unreadCount?: number;
  hasUnread?: boolean;
  lastReadAt?: string | null;
  trailing?: React.ReactNode;
}) {
  const isBoard = channel.type === "BOARD";
  const prefix = isBoard ? "" : channel.type === "DM" ? "@" : "#";
  const meta = channel.lastMessageAt ? formatTime(channel.lastMessageAt) : "";
  const unread = typeof unreadCount === "number" ? unreadCount : hasUnread ? 1 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group relative mx-2 mt-1 w-[calc(100%-16px)] rounded-3xl px-3 py-3 text-left transition",
       selected
        ? "bg-white/8 ring-1 ring-sky-400/25 shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_0_24px_rgba(56,189,248,0.18)]"
        : "hover:bg-white/6"
      )}
    >
      
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cx("truncate text-sm font-semibold", selected ? "text-amber-50" : "text-amber-50/85")}>
              {prefix}
              {channel.name}
            </div>

            {channel.isPrivate ? (
              <span className="rounded-full border border-amber-200/10 bg-white/5 px-2 py-0.5 text-[10px] text-amber-50/60">
                Restricted
              </span>
            ) : null}

            {unread ? (
              <span
                className={cx(
                  "ml-1 inline-flex items-center justify-center",
                  "min-w-[22px] rounded-full border border-amber-200/12 bg-[rgba(244,210,106,0.10)] px-2 py-0.5",
                  "text-[11px] font-semibold text-amber-50/80 shadow-[0_0_18px_rgba(244,210,106,0.12)]"
                )}
                title="Unread"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-xs text-amber-50/45">
              {meta || (isBoard ? "Workspace-wide" : channel.type === "DM" ? "Direct" : "Room")}
              </div>
            {trailing ? <div className="shrink-0">{trailing}</div> : null}
          </div>
        </div>

        <div
          aria-hidden
          className={cx(
            "h-2 w-2 shrink-0 rounded-full",
            unread
              ? "bg-amber-200/80 shadow-[0_0_14px_rgba(244,210,106,0.40)]"
              : selected
              ? "bg-amber-200/45"
              : "bg-amber-200/20"
          )}
        />
      </div>
    </button>
  );
}

/* ------------------------------------------------------------ */
/* Thread dividers + last-read                                   */
/* ------------------------------------------------------------ */

export function LastReadDivider({ label }: { label?: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-amber-200/0 via-amber-200/16 to-amber-200/0" />
      <div className="rounded-full border border-amber-200/12 bg-white/5 px-3 py-1 text-[11px] text-amber-50/55">
        {label || "New since last read"}
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-amber-200/0 via-amber-200/16 to-amber-200/0" />
    </div>
  );
}

export function DayDivider({ isoDay, label }: { isoDay: string; label?: string }) {
  const text = label || isoDay;
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-amber-200/0 via-amber-200/10 to-amber-200/0" />
      <div className="text-[11px] tracking-[0.14em] text-amber-100/35">{text.toUpperCase()}</div>
      <div className="h-px flex-1 bg-gradient-to-r from-amber-200/0 via-amber-200/10 to-amber-200/0" />
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Reactions                                                     */
/* ------------------------------------------------------------ */

export function ReactionChip({
  emoji,
  count,
  mine,
  onClick,
}: {
  emoji: string;
  count: number;
  mine?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full border px-3 py-1 text-xs transition",
        mine
          ? "border-amber-200/18 bg-[rgba(244,210,106,0.12)] text-amber-50 shadow-[0_0_18px_rgba(244,210,106,0.12)]"
          : "border-amber-200/10 bg-white/5 text-amber-50/70 hover:bg-white/10"
      )}
      title="Toggle reaction"
    >
      {emoji} <span className="ml-1 text-amber-50/45">{count}</span>
    </button>
  );
}

export function QuickReactions({
  onReact,
  className,
  compact,
}: {
  onReact: (emoji: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const quick = compact ? ["👍", "🔥", "❤️", "😂"] : ["👍", "🔥", "❤️", "😂", "🎉"];
  return (
    <div className={cx("flex items-center gap-1", className)}>
      {quick.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onReact(e)}
          className="rounded-xl border border-amber-200/10 bg-white/5 px-2 py-1 text-xs text-amber-50/70 hover:bg-white/10 transition"
          title={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Message actions (3-dot)                                       */
/* ------------------------------------------------------------ */

type ActionItem = {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function ActionMenu({
  items,
  align = "right",
  label = "Actions",
}: {
  items: ActionItem[];
  align?: "left" | "right";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const W = 200;
  const GAP = 8;
  const M = 10;

  const place = () => {
    const btn = btnRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const left =
      align === "right"
        ? Math.max(M, Math.min(vw - W - M, r.right - W))
        : Math.max(M, Math.min(vw - W - M, r.left));

    // Simple: open below by default; flip if not enough space
    const approxH = 44 * Math.max(1, items.length) + 12;
    const spaceBelow = vh - r.bottom - M;
    const spaceAbove = r.top - M;
    const openUp = spaceBelow < approxH && spaceAbove > spaceBelow;

    const top = openUp ? Math.max(M, r.top - GAP - approxH) : r.bottom + GAP;

    setPos({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    place();

    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;

    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (btnRef.current && t && btnRef.current.contains(t)) return;
      if (menuRef.current && t && menuRef.current.contains(t)) return;
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-amber-200/10 bg-white/5 px-2 py-1 text-xs text-amber-50/70 hover:bg-white/10 transition"
        title={label}
      >
        ⋯
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              className={cx(
                "fixed z-[9999]",
                "w-[200px]",
                // ✅ HARD OVERRIDES (prevents “giant panel”)
                "!h-auto !max-h-none !min-h-0",
                "inline-flex flex-col overflow-hidden",
                "rounded-xl border border-amber-200/10 bg-[rgba(10,16,28,0.96)] backdrop-blur-md",
                "shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
              )}
              style={{
                top: pos.top,
                left: pos.left,
                height: "auto",
                maxHeight: "none",
              }}
            >
              {items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  disabled={it.disabled}
                  onClick={() => {
                    if (it.disabled) return;
                    setOpen(false);
                    it.onClick();
                  }}
                  className={cx(
                    "w-full px-3 py-2 text-left text-xs transition",
                    "first:rounded-t-xl last:rounded-b-xl",
                    it.disabled
                      ? "cursor-not-allowed text-amber-50/25"
                      : it.danger
                      ? "text-red-100/85 hover:bg-red-500/10"
                      : "text-amber-50/70 hover:bg-amber-200/5"
                  )}
                >
                  <span className="font-medium">{it.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/* ------------------------------------------------------------ */
/* Message row (NO moderation logic)                              */
/* ------------------------------------------------------------ */

export type MessageRowMessage = {
  id: string;
  authorUserId: string | null;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  reactions?: Array<{ id: string; userId: string; emoji: string }>;
};

export function MessageRow({
  m,
  mine,
  meName,
  meInitials,
  onReact,
  onCopy,
  onEdit,
  onDelete,
  tidyAuthor,
  groupReactions,
  highlight,
  showHoverActions = true,
  lastReadMarker,
}: {
  m: MessageRowMessage;
  mine: boolean;
  meName?: string;
  meInitials?: string;
  onReact: (emoji: string) => void;
  onCopy?: () => void;
  onEdit?: (nextBody: string) => Promise<void> | void;
  onDelete?: () => void;
  tidyAuthor: (authorUserId: string | null, mine: boolean, meName?: string) => string;
  groupReactions: (reactions: any[]) => Array<{ emoji: string; count: number; mine?: boolean; ids: string[] }>;
  highlight?: boolean;
  showHoverActions?: boolean;
  lastReadMarker?: boolean;
}) {
  if (m.deletedAt) return null;

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(m.body || "");

  // ✅ Mobile-only state (tap-to-show). Desktop ignores it.
  const [mobileActive, setMobileActive] = useState(false);

  useEffect(() => {
    if (!editing) setEditDraft(m.body || "");
  }, [m.body, editing]);

  useEffect(() => {
    if (editing) setMobileActive(false);
  }, [editing]);

  async function commitEdit() {
    const next = editDraft.trim();
    if (!next) return;
    if (next === (m.body || "").trim()) {
      setEditing(false);
      return;
    }
    await onEdit?.(next);
    setEditing(false);
  }

  const author = tidyAuthor(m.authorUserId, mine, meName);
  const time = formatTime(m.createdAt);
  const reactionGroups = groupReactions(m.reactions || []);

  // ✅ Mobile: show reactions row only when active OR meaningful OR mine
  const showReactionsMobile = mobileActive || reactionGroups.length >= 2 || reactionGroups.some((g) => !!g.mine);

  const actions: ActionItem[] = [
    {
      key: "copy",
      label: "Copy text",
      onClick: async () => {
        const txt = m.body || "";
        try {
          await navigator.clipboard.writeText(txt);
        } catch {}
        onCopy?.();
      },
    },
  ];

  if (mine && onEdit) {
    actions.push({
      key: "edit",
      label: "Edit message",
      onClick: () => {
        setEditDraft(m.body || "");
        setEditing(true);
      },
    });
  }

  // IMPORTANT: delete should be allowed for the sender regardless of role.
  if (mine && onDelete) {
    actions.push({
      key: "delete",
      label: "Delete message",
      danger: true,
      onClick: onDelete,
    });
  }

  return (
    <div
      className={cx(
        "group relative",
        highlight ? "ring-1 ring-amber-200/25 rounded-3xl shadow-[0_0_40px_rgba(244,210,106,0.10)]" : ""
      )}
      data-message-id={m.id}
      onClick={() => {
        // ✅ Mobile only: tap message surface toggles active state
        if (typeof window !== "undefined" && window.innerWidth < 768) {
          setMobileActive((v) => !v);
        }
      }}
    >
      {/* ✅ Mobile tap-away closer (behind message; message sits above it) */}
      {mobileActive ? (
        <button
          type="button"
          aria-label="Close message actions"
          className="fixed inset-0 z-[40] md:hidden"
          onClick={(e) => {
            e.stopPropagation();
            setMobileActive(false);
          }}
        />
      ) : null}

      {lastReadMarker ? <LastReadDivider /> : null}

      {/* message body above tap-away overlay */}
      <div className="relative z-[45] flex gap-3 rounded-3xl px-3 py-3">
        {/* avatar */}
        <div
          className={cx(
            "mt-0.5 h-9 w-9 shrink-0 rounded-2xl border border-amber-200/10 bg-black/20",
            "grid place-items-center text-xs font-semibold text-amber-50/75"
          )}
          title={author}
          onClick={(e) => e.stopPropagation()}
        >
          {mine ? meInitials || "Y" : author.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          {/* ✅ Desktop AND Mobile use the SAME layout:
              - meta line
              - pinned ⋯ action on the right
              - reactions/quick reacts live UNDER the message text
              - desktop shows ⋯ on hover; mobile shows ⋯ when active
              - desktop quick reacts show on hover; mobile quick reacts show when active
          */}
          <div className="relative">
            <div className="min-w-0 pr-12 text-xs text-amber-50/65">
              <span className="font-semibold text-amber-50/85">{author}</span>
              <span className="mx-2 text-amber-50/25">•</span>
              <span className="text-amber-50/45">{time}</span>
              {m.editedAt ? <span className="ml-2 text-amber-50/30">(edited)</span> : null}
            </div>

            {showHoverActions ? (
              <>
                {/* Desktop pinned ⋯ on hover */}
                <div
                  className="absolute right-0 top-0 hidden md:block opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ActionMenu items={actions} label="Message actions" />
                </div>

                {/* Mobile pinned ⋯ when active */}
                <div
                  className={cx(
                    "absolute right-0 top-0 md:hidden transition",
                    mobileActive ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ActionMenu items={actions} label="Message actions" />
                </div>
              </>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={3}
                className={cx(
                  "w-full resize-none rounded-2xl border border-amber-200/10 bg-black/20 px-3 py-2",
                  "text-sm text-amber-50/90 outline-none placeholder:text-amber-50/35"
                )}
                placeholder="Edit your message…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void commitEdit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditing(false);
                    setEditDraft(m.body || "");
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2">
                <MiniAction
                  subtle
                  onClick={() => {
                    setEditing(false);
                    setEditDraft(m.body || "");
                  }}
                  title="Cancel"
                >
                  Cancel
                </MiniAction>
                <MiniAction onClick={() => void commitEdit()} title="Save (⌘Enter)">
                  Save
                </MiniAction>
              </div>
              <div className="text-[11px] text-amber-50/35">Tip: ⌘/Ctrl+Enter to save • Esc to cancel</div>
            </div>
          ) : (
            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-amber-50/90">{m.body}</div>
          )}

          {/* ✅ Reaction chips (under text):
              - Desktop: ALWAYS show if reactions exist
              - Mobile: conditional (active/meaningful/mine)
          */}
          {reactionGroups.length ? (
            <div
              className={cx(
                "mt-3 flex flex-wrap items-center gap-2",
                "md:flex",
                showReactionsMobile ? "flex" : "hidden md:flex"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {reactionGroups.map((g) => (
                <ReactionChip
                  key={g.emoji}
                  emoji={g.emoji}
                  count={g.count}
                  mine={!!g.mine}
                  onClick={() => onReact(g.emoji)}
                />
              ))}
            </div>
          ) : null}

          {/* ✅ Quick reacts row (under text):
              - Mobile: only when active
              - Desktop: only on hover (but still under text)
          */}
          <div
            className={cx(
              "mt-3 flex flex-wrap gap-1",
              "md:flex md:opacity-0 md:group-hover:opacity-100 md:transition",
              mobileActive ? "flex md:opacity-100" : "hidden md:flex"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <QuickReactions onReact={onReact} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* DM Member Picker (UI-only; page provides members + handlers)  */
/* ------------------------------------------------------------ */

export type DMMember = {
  userId: string;
  name: string;
  email?: string;
  image?: string;
};

export function DMMemberPicker({
  members,
  selectedUserId,
  onSelect,
  search,
  onSearch,
  loading,
  emptyText,
  className,
}: {
  members: DMMember[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
  search: string;
  onSearch: (v: string) => void;
  loading?: boolean;
  emptyText?: string;
  className?: string;
}) {
  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return members || [];
    return (members || []).filter((m) => {
      const n = (m.name || "").toLowerCase();
      const e = (m.email || "").toLowerCase();
      return n.includes(q) || e.includes(q);
    });
  }, [members, search]);

  return (
    <div className={cx("space-y-3", className)}>
      <Field label="Member" hint="Pick someone in your workspace.">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search members…"
          className="mt-2 w-full rounded-2xl border border-amber-200/10 bg-black/20 px-3 py-2 text-sm text-amber-50/90 placeholder:text-amber-50/35 outline-none"
        />
      </Field>

      <div className="max-h-[220px] overflow-y-auto rounded-2xl border border-amber-200/10 bg-white/5 p-2">
        {loading ? (
          <SkeletonCard>Loading members…</SkeletonCard>
        ) : filtered.length ? (
          filtered.map((m) => (
            <button
              key={m.userId}
              onClick={() => onSelect(m.userId)}
              className={cx(
                "w-full rounded-2xl border px-3 py-2 text-left transition",
                selectedUserId === m.userId
                  ? "border-amber-200/18 bg-white/10 text-amber-50"
                  : "border-amber-200/10 bg-white/5 text-amber-50/75 hover:bg-white/8"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{m.name}</div>
                  {m.email ? <div className="mt-1 truncate text-xs text-amber-50/45">{m.email}</div> : null}
                </div>
                <span
                  aria-hidden
                  className={cx(
                    "h-2 w-2 shrink-0 rounded-full",
                    selectedUserId === m.userId
                      ? "bg-amber-200/70 shadow-[0_0_14px_rgba(244,210,106,0.35)]"
                      : "bg-amber-200/20"
                  )}
                />
              </div>
            </button>
          ))
        ) : (
          <div className="px-3 py-3 text-sm text-amber-50/60">{emptyText || "No members found."}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Multi Member Picker (for Restricted Rooms)                    */
/* ------------------------------------------------------------ */

export function MemberMultiPicker({
  members,
  selectedUserIds,
  onToggleUserId,
  search,
  onSearch,
  loading,
  emptyText,
  className,
  hint,
}: {
  members: DMMember[];
  selectedUserIds: string[];
  onToggleUserId: (userId: string) => void;
  search: string;
  onSearch: (v: string) => void;
  loading?: boolean;
  emptyText?: string;
  className?: string;
  hint?: string;
}) {
  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return members || [];
    return (members || []).filter((m) => {
      const n = (m.name || "").toLowerCase();
      const e = (m.email || "").toLowerCase();
      return n.includes(q) || e.includes(q);
    });
  }, [members, search]);

  return (
    <div className={cx("space-y-3", className)}>
      <Field label="Allowed members" hint={hint || "Only these members can view this room."}>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search members…"
          className="mt-2 w-full rounded-2xl border border-amber-200/10 bg-black/20 px-3 py-2 text-sm text-amber-50/90 placeholder:text-amber-50/35 outline-none"
        />
      </Field>

      <div className="max-h-[240px] overflow-y-auto rounded-2xl border border-amber-200/10 bg-white/5 p-2">
        {loading ? (
          <SkeletonCard>Loading members…</SkeletonCard>
        ) : filtered.length ? (
          filtered.map((m) => {
            const on = selectedUserIds.includes(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => onToggleUserId(m.userId)}
                className={cx(
                  "w-full rounded-2xl border px-3 py-2 text-left transition",
                  on
                    ? "border-amber-200/18 bg-white/10 text-amber-50"
                    : "border-amber-200/10 bg-white/5 text-amber-50/75 hover:bg-white/8"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{m.name}</div>
                    {m.email ? <div className="mt-1 truncate text-xs text-amber-50/45">{m.email}</div> : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cx(
                        "h-2 w-2 shrink-0 rounded-full",
                        on
                          ? "bg-amber-200/70 shadow-[0_0_14px_rgba(244,210,106,0.35)]"
                          : "bg-amber-200/20"
                      )}
                    />
                    <span className={cx("text-[11px]", on ? "text-amber-50/70" : "text-amber-50/35")}>
                      {on ? "Allowed" : "—"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="px-3 py-3 text-sm text-amber-50/60">{emptyText || "No members found."}</div>
        )}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------ */
/* Drawer + Modal (scoped to Hub card)                           */
/* ------------------------------------------------------------ */

function lockScroll(el: HTMLElement | null, active: boolean) {
  if (!el) return () => {};
  if (!active) return () => {};

  const prevOverflow = el.style.overflow;
  const prevPaddingRight = el.style.paddingRight;

  // Prevent layout shift if the scroll container shows a scrollbar
  const scrollbarW = el.offsetWidth - el.clientWidth;
  if (scrollbarW > 0) el.style.paddingRight = `${scrollbarW}px`;

  el.style.overflow = "hidden";

  return () => {
    el.style.overflow = prevOverflow;
    el.style.paddingRight = prevPaddingRight;
  };
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  /** pass the Hub card's scroll container ref (NOT document/body) */
  scrollLockRef,
  /** optional: render backdrop within card (default true) */
  backdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollLockRef?: React.RefObject<HTMLElement | null>;
  backdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const unlock = lockScroll(scrollLockRef?.current ?? null, true);
    return () => unlock();
  }, [open, scrollLockRef]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    // NOTE: absolute + inset-0 keeps it inside the Hub card (parent must be relative)
    <div className="absolute inset-0 z-[70]">
      {/* Backdrop (scoped to card) */}
      {backdrop ? (
        <button
          type="button"
          aria-label="Close drawer"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-black/60"
        />
      ) : null}

      {/* Right panel (scoped to card height) */}
      <div className="absolute right-0 top-0 h-full w-full max-w-[560px]">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={cx(
            "relative h-full overflow-hidden",
            "border-l border-amber-200/10",
            "bg-[rgba(10,16,28,0.90)] backdrop-blur-xl",
            "shadow-[-30px_0_90px_rgba(0,0,0,0.70)]",
            "flex flex-col overscroll-contain",
            "outline-none focus:outline-none focus-visible:outline-none",
            "ring-0 focus:ring-0 focus-visible:ring-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* glass glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            style={{
              background:
                "radial-gradient(920px 520px at 25% 0%, rgba(244,210,106,0.10), transparent 60%), radial-gradient(700px 520px at 90% 25%, rgba(255,255,255,0.06), transparent 58%), linear-gradient(to bottom, rgba(255,255,255,0.05), transparent 30%)",
            }}
          />

          {/* Header */}
          <div className="relative px-4 pt-4">
            <div
              className={cx(
                "flex items-center justify-between gap-3",
                "rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3"
              )}
            >
              <div className="min-w-0">
                <div className="text-[11px] font-medium tracking-[0.22em] text-amber-100/45">
                  HUB
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-amber-50/90">
                  {title}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={cx(
                    "rounded-xl border border-amber-200/10 bg-black/20 px-3 py-2",
                    "text-xs text-amber-50/70 hover:bg-white/8 transition"
                  )}
                  title="Close"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4">
              <Divider />
            </div>
          </div>

          {/* Body (flex-1 instead of calc) */}
          <div className="relative flex-1 overflow-y-auto px-4 pb-4 pt-4">
            {children}
          </div>

          {/* Footer (in flow; no absolute positioning) */}
          {footer ? (
            <div className="relative">
              <Divider />
              <div className="relative px-4 py-3">{footer}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  /** scoped scroll lock to the Hub card scroll container */
  scrollLockRef,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  scrollLockRef?: React.RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const unlock = lockScroll(scrollLockRef?.current ?? null, true);
    return () => unlock();
  }, [scrollLockRef]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // NOTE: absolute keeps it inside the Hub card (parent must be relative)
    <div className="absolute inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 cursor-default bg-black/70"
        onClick={onClose}
      />
      <div
        className={cx(
          "relative w-full max-w-[520px] overflow-hidden rounded-3xl border border-amber-200/10",
          "bg-[rgba(10,16,28,0.92)] backdrop-blur-xl",
          "shadow-[0_0_0_1px_rgba(244,210,106,0.05),0_30px_120px_rgba(0,0,0,0.7)]",
          "flex flex-col"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 520px at 40% 0%, rgba(244,210,106,0.08), transparent 60%)",
          }}
        />
        <div className="relative flex items-center justify-between px-5 py-4">
          <div className="text-sm font-semibold text-amber-50">{title}</div>
          <button
            onClick={onClose}
            className="rounded-xl border border-amber-200/10 bg-white/5 px-3 py-2 text-xs text-amber-50/70 hover:bg-white/8 transition"
          >
            Close
          </button>
        </div>
        <Divider />
        <div className="relative max-h-[70vh] overflow-y-auto px-5 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Form bits                                                     */
/* ------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-xs font-medium tracking-[0.16em] text-amber-100/40">{label.toUpperCase()}</div>
        {hint ? <div className="text-[11px] text-amber-50/35">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function TypeChip({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
        disabled
          ? "cursor-not-allowed border-amber-200/10 bg-white/5 text-amber-50/25"
          : active
          ? "border-amber-200/18 bg-[rgba(244,210,106,0.10)] text-amber-50 shadow-[0_0_24px_rgba(244,210,106,0.10)]"
          : "border-amber-200/10 bg-white/5 text-amber-50/70 hover:bg-white/8"
      )}
    >
      {label}
    </button>
  );
}

export function Toggle({
  on,
  onClick,
  title,
  className,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cx(
        "inline-flex items-center justify-center",
        "h-8 min-w-[56px] px-3 rounded-full border",
        "text-[11px] font-semibold tracking-wide",
        "transition-colors duration-150",
        on
          ? "border-amber-200/20 bg-[rgba(244,210,106,0.12)] text-amber-50"
          : "border-amber-200/10 bg-black/20 text-amber-50/55",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/20",
        className
      )}
    >
      {on ? "ON" : "OFF"}
    </button>
  );
}

/* ------------------------------------------------------------ */
/* Slack-like @ mention composer                                  */
/* ------------------------------------------------------------ */

export type MentionUser = {
  userId: string;
  name: string;
  email?: string;
  image?: string;
};

function normalizeMentionLabel(u: MentionUser) {
  return (u.name && u.name.trim()) || (u.email && u.email.trim()) || u.userId;
}

function getMentionContext(text: string, caret: number) {
  const left = text.slice(0, caret);
  const at = left.lastIndexOf("@");
  if (at === -1) return null;

  // require token start: beginning OR whitespace/bracket/quote before "@"
  const prev = at === 0 ? " " : left[at - 1];
  if (!/\s|\(|\[|{|"/.test(prev)) return null;

  const token = left.slice(at + 1); // from @ to caret
  if (/\s/.test(token)) return null;
  if (token.length > 32) return null;

  return { start: at, end: caret, q: token };
}

export function MentionComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  members,
  meUserId,
  className,
  textareaRef,
  onMentionedUserIdsChange,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  members: MentionUser[];
  meUserId?: string | null;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onMentionedUserIdsChange?: (ids: string[]) => void;
}) {
  const ref = textareaRef ?? useRef<HTMLTextAreaElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [chosen, setChosen] = useState<Array<{ userId: string; label: string }>>([]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = (members || [])
      .filter((m) => !!m.userId)
      .filter((m) => !meUserId || m.userId !== meUserId) // optional: don't suggest self
      .map((m) => {
        const label = normalizeMentionLabel(m);
        const hay = `${label} ${m.email || ""}`.toLowerCase();
        return { userId: m.userId, label, email: m.email || "", image: m.image || "", hay };
      })
      .filter((x) => (q ? x.hay.includes(q) : true));

    // prioritize label starts-with
    list.sort((a, b) => {
      const aS = q && a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bS = q && b.label.toLowerCase().startsWith(q) ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return a.label.localeCompare(b.label);
    });

    return list.slice(0, 6);
  }, [members, query, meUserId]);

  // notify parent of mentioned ids that still appear in text
  useEffect(() => {
    const ids = Array.from(
      new Set(chosen.filter((m) => value.includes(`@${m.label}`)).map((m) => m.userId))
    );
    onMentionedUserIdsChange?.(ids);
  }, [chosen, value, onMentionedUserIdsChange]);

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setRange(null);
    setActiveIndex(0);
  }

  function applyChoice(choice: { userId: string; label: string }) {
    if (!range) return;

    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    const inserted = `@${choice.label} `;
    const next = `${before}${inserted}${after}`;

    onChange(next);

    setChosen((prev) => (prev.some((p) => p.userId === choice.userId) ? prev : [...prev, choice]));
    closeMenu();

    // move caret
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      try {
        ref.current?.setSelectionRange(pos, pos);
      } catch {}
      ref.current?.focus();
    });
  }

  return (
    <div className={cx("relative", className)}>
      {/* dropdown */}
      {open && candidates.length ? (
        <div className="absolute left-0 right-0 -top-2 z-50 -translate-y-full">
          <div className="rounded-2xl border border-amber-200/10 bg-[rgba(10,16,28,0.92)] backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden">
            {candidates.map((u, idx) => (
              <button
                key={u.userId}
                type="button"
                onMouseDown={(ev) => ev.preventDefault()} // keep focus on textarea
                onClick={() => applyChoice({ userId: u.userId, label: u.label })}
                className={cx(
                  "w-full px-3 py-2 text-left text-sm transition",
                  idx === activeIndex ? "bg-white/10 text-amber-50" : "text-amber-50/80 hover:bg-white/8"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{u.label}</div>
                    {u.email ? <div className="mt-0.5 truncate text-[11px] text-amber-50/45">{u.email}</div> : null}
                  </div>
                  <span
                    aria-hidden
                    className={cx(
                      "h-2 w-2 shrink-0 rounded-full",
                      idx === activeIndex ? "bg-amber-200/70 shadow-[0_0_14px_rgba(244,210,106,0.35)]" : "bg-amber-200/25"
                    )}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val);

          const caret = e.target.selectionStart ?? val.length;
          const ctx = getMentionContext(val, caret);

          if (!ctx) {
            closeMenu();
            return;
          }

          setOpen(true);
          setQuery(ctx.q);
          setRange({ start: ctx.start, end: ctx.end });
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          // mention navigation
          if (open && candidates.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, candidates.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              closeMenu();
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const c = candidates[activeIndex];
              if (c) applyChoice({ userId: c.userId, label: c.label });
              return;
            }
          }

          // send behavior
          if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        className={cx(
          "min-h-[48px] w-full resize-none rounded-2xl bg-transparent px-3 py-3",
          "text-sm text-amber-50/90 placeholder:text-amber-50/35 outline-none"
        )}
      />
    </div>
  );
}

export function AvatarStack({
  users,
  max = 3,
}: {
  users: Array<{ name?: string | null; image?: string | null }>;
  max?: number;
}) {
  const shown = users.slice(0, max);
  const more = Math.max(0, users.length - shown.length);

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u, idx) => (
        <div
          key={idx}
          className="grid h-7 w-7 place-items-center overflow-hidden rounded-2xl border border-amber-200/10 bg-black/25 text-[10px] font-semibold text-amber-50/70"
          title={u.name || "Member"}
        >
          {u.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.image} alt={u.name || "member"} className="h-full w-full object-cover" />
          ) : (
            nameInitials(u.name)
          )}
        </div>
      ))}
      {more ? (
        <div className="grid h-7 w-7 place-items-center rounded-2xl border border-amber-200/10 bg-white/5 text-[10px] font-semibold text-amber-50/60">
          +{more}
        </div>
      ) : null}
    </div>
  );
}
