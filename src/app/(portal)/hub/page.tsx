// app/(portal)/hub/page.tsx
"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import PageHeader from "@/components/layout/page-header";

import {
  AvatarStack,
  ChannelRow,
  CollapsibleHeader,
  Divider,
  DividerSoft,
  Dot,
  Drawer,
  EmptyHint,
  Field,
  GlassPanel,
  GlassShell,
  isoDay,
  DayDivider,
  MessageRow,
  MiniAction,
  Modal,
  Orb,
  PrimaryButton,
  SectionLabel,
  SkeletonCard,
  SoftButton,
  StatusPill,
  Tag,
  Toggle,
  Toolbar,
  TypeChip,
  cx,
  formatTime,
  DMMemberPicker,
  MemberMultiPicker,
  MentionComposer,
} from "@/components/hub/UI";

type ChatChannelType = "BOARD" | "ROOM" | "DM";
type ChatMessageType = "TEXT" | "SYSTEM";
type ChatMessageStatus = "SENT" | "FAILED";

type Channel = {
  id: string;
  workspaceId: string;
  type: ChatChannelType;
  name: string;
  isPrivate: boolean;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readState?: {
    lastReadAt: string | null;
    lastReadMessageId: string | null;
  } | null;
};


type Reaction = { id: string; userId: string; emoji: string; createdAt: string };
type Mention = { id: string; mentionedUserId: string; createdAt: string };

type Message = {
  id: string;
  workspaceId: string;
  channelId: string;
  authorUserId: string | null;
  type: ChatMessageType;
  status: ChatMessageStatus;
  clientNonce: string | null;
  parentId: string | null;
  body: string;
  editedAt: string | null;
  editedByUserId: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  payload: any | null;
  createdAt: string;
  reactions: Reaction[];
  mentions: Mention[];
};

type ListChannelsResponse =
  | { ok: true; workspaceId: string; userId: string; workspaceRole: string; channels: Channel[] }
  | { error?: string; ok?: false };

type EnsureBoardResponse =
  | {
      ok: true;
      workspaceId: string;
      userId: string;
      workspaceRole: string;
      channel: { id: string; workspaceId: string; type: ChatChannelType; key: string; name: string; isPrivate: boolean };
    }
  | { error?: string; ok?: false };

type ListMessagesResponse =
  | {
      ok: true;
      workspaceId: string;
      userId: string;
      workspaceRole: string;
      channel: any;
      messages: Message[];
      nextCursor: string | null; // oldest id in page
      prevCursor: string | null; // newest id in page
    }
  | { error?: string; ok?: false };

type MentionsResponse =
  | {
      ok: true;
      workspaceId: string;
      mentions: Array<{
        id: string;
        createdAt: string;
        messageId: string;
        message: {
          id: string;
          channelId: string;
          body: string;
          createdAt: string;
          authorUserId: string | null;
          channel: { id: string; key: string; name: string; isPrivate: boolean };
        };
      }>;
    }
  | { error?: string; ok?: false };

type ChannelMembersResponse =
  | {
      ok: true;
      workspaceId: string;
      channelId: string;
      channel?: any; // (safe if API includes it)
      members: Array<{
        id: string;
        userId: string;
        role: "OWNER" | "ADMIN" | "AGENT" | null; // ✅ from API overlay
        createdAt: string;
        removedAt: string | null;
        user: { id: string; name: string | null; email: string | null; image: string | null };
      }>;
    }
  | { error?: string; ok?: false };

type WorkspaceMembersResponse =
  | {
      ok: true;
      workspaceId: string;
      members: Array<{
        id: string;
        userId: string;
        role: "OWNER" | "ADMIN" | "AGENT"; // ✅ from /workspace-members
        createdAt: string;
        removedAt: string | null;
        user: { id: string; name: string | null; email: string | null; image: string | null };
      }>;
    }
  | { error?: string; ok?: false };

/* ------------------------------------------------------------ */
/* helpers                                                       */
/* ------------------------------------------------------------ */

function makeNonce() {
  try {
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeJson<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as any));
}

function isOkChannels(v: any): v is { ok: true; channels: Channel[]; workspaceId: string; userId: string; workspaceRole: string } {
  return !!v && v.ok === true && Array.isArray(v.channels);
}

function channelHasUnread(c: Channel) {
  if (!c.lastMessageAt) return false;

  const lastMsg = new Date(c.lastMessageAt).getTime();
  const lastRead = c.readState?.lastReadAt
    ? new Date(c.readState.lastReadAt).getTime()
    : 0;
  return lastMsg > lastRead;
}

function isOkMessages(v: any): v is { ok: true; messages: Message[]; nextCursor: string | null; prevCursor: string | null } {
  return !!v && v.ok === true && Array.isArray(v.messages);
}

function isOkMentions(v: any): v is { ok: true; mentions: any[] } {
  return !!v && v.ok === true && Array.isArray(v.mentions);
}

function isOkWorkspaceMembers(v: any): v is { ok: true; workspaceId: string; members: any[] } {
  return !!v && v.ok === true && typeof v.workspaceId === "string" && Array.isArray(v.members);
}

function isOkChannelMembers(v: any): v is { ok: true; members: any[]; channelId: string } {
  return !!v && v.ok === true && typeof v.channelId === "string" && Array.isArray(v.members);
}

function groupReactions(reactions: Reaction[], meId?: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean; ids: string[] }>();
  for (const r of reactions || []) {
    const key = r.emoji;
    const curr = map.get(key) || { emoji: key, count: 0, mine: false, ids: [] as string[] };
    curr.count += 1;
    curr.ids.push(r.id);
    if (meId && r.userId === meId) curr.mine = true;
    map.set(key, curr);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function initials(name?: string | null) {
  const n = String(name || "").trim();
  if (!n) return "U";
  const parts = n.split(/\s+/g).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

function hash32(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function stableDmKey(a?: string | null, b?: string | null) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x || !y) return "";
  const [lo, hi] = x < y ? [x, y] : [y, x];
  return `dm-${hash32(`dm:${lo}:${hi}`)}`;
}

function byCreatedAtAsc(a: { createdAt: string }, b: { createdAt: string }) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function mergeMessagesById(prev: Message[], incoming: Message[]) {
  if (!incoming?.length) return prev;

  const map = new Map<string, Message>();
  for (const m of prev) map.set(m.id, m);

  // merge incoming (server) messages
  for (const m of incoming) {
    map.set(m.id, m);
  }

  // keep any optimistic messages that haven't been replaced yet
  const optimistic = prev.filter((m) => String(m.id).startsWith("optimistic:"));
  for (const m of optimistic) map.set(m.id, m);

  const merged = Array.from(map.values());
  merged.sort(byCreatedAtAsc);
  return merged;
}

/* ------------------------------------------------------------ */
/* api                                                           */
/* ------------------------------------------------------------ */

async function apiEnsureBoard(): Promise<EnsureBoardResponse> {
  const res = await fetch("/api/chat/board", { method: "POST" });
  return safeJson(res);
}

async function apiListChannels(opts?: { includeArchived?: boolean; limit?: number }): Promise<ListChannelsResponse> {
  const sp = new URLSearchParams();
  if (opts?.includeArchived) sp.set("includeArchived", "1");
  if (typeof opts?.limit === "number") sp.set("limit", String(opts.limit));
  const res = await fetch(`/api/chat/channels?${sp.toString()}`, { method: "GET" });
  return safeJson(res);
}

async function apiWorkspaceMembers(): Promise<WorkspaceMembersResponse> {
  const res = await fetch(`/api/chat/workspace-members`, { method: "GET" });
  return safeJson(res);
}

async function apiCreateChannel(input: {
  key: string;
  name: string;
  type: ChatChannelType;
  isPrivate?: boolean;
  memberUserIds?: string[];
}) {
  const res = await fetch("/api/chat/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return safeJson<any>(res);
}

async function apiListMessages(params: {
  channelId: string;
  limit?: number;
  cursorId?: string | null;
  direction?: "backward" | "forward";
}): Promise<ListMessagesResponse> {
  const sp = new URLSearchParams();
  if (typeof params.limit === "number") sp.set("limit", String(params.limit));
  if (params.cursorId) sp.set("cursorId", params.cursorId);
  if (params.direction) sp.set("direction", params.direction);
  const res = await fetch(`/api/chat/channels/${params.channelId}/messages?${sp.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return safeJson(res);
}

async function apiCreateMessage(
  channelId: string,
  input: { body: string; clientNonce: string; type?: ChatMessageType; mentionedUserIds?: string[] }
) {
  const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return safeJson<any>(res);
}

async function apiMarkRead(channelId: string, lastReadMessageId: string | null) {
  const res = await fetch(`/api/chat/channels/${channelId}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastReadMessageId }),
  });
  return safeJson<any>(res);
}

async function apiEditMessage(messageId: string, body: string) {
  const res = await fetch(`/api/chat/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return safeJson<any>(res);
}

async function apiDeleteMessage(messageId: string) {
  const res = await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
  return safeJson<any>(res);
}

async function apiMentions(limit = 50): Promise<MentionsResponse> {
  const sp = new URLSearchParams();
  sp.set("limit", String(limit));
  const res = await fetch(`/api/chat/mentions?${sp.toString()}`, { method: "GET" });
  return safeJson(res);
}

async function apiToggleReaction(messageId: string, emoji: string) {
  const res = await fetch(`/api/chat/messages/${messageId}/reactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoji }),
  });
  return safeJson<any>(res);
}

async function apiChannelMembers(channelId: string): Promise<ChannelMembersResponse> {
  const res = await fetch(`/api/chat/channels/${channelId}/members`, { method: "GET" });
  return safeJson(res);
}

/* ------------------------------------------------------------ */

export default function HubPage() {
  const { data: session } = useSession();

  const me = useMemo(() => {
    const u: any = session?.user;
    return {
      id: (u?.id as string | undefined) ?? undefined,
      name: (u?.name as string | undefined) ?? undefined,
      email: (u?.email as string | undefined) ?? undefined,
      image: (u?.image as string | undefined) ?? undefined,
    };
  }, [session]);

  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);

  // left rail
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const selectedChannelIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId]
  );

  // messages
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);

  // composer
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // mentions drawer
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [mentions, setMentions] = useState<
    MentionsResponse extends { ok: true } ? MentionsResponse["mentions"] : any[]
  >([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);

  // mentions notifications (polling)
  const [mentionsUnreadCount, setMentionsUnreadCount] = useState(0);
  const lastSeenMentionAtRef = useRef<string | null>(null);
  const mentionsPollRef = useRef<number | null>(null);


 // members drawer (channel-specific)
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [channelMembers, setChannelMembers] = useState<
    ChannelMembersResponse extends { ok: true } ? ChannelMembersResponse["members"] : any[]
  >([]);
  const [membersError, setMembersError] = useState<string | null>(null);

  // workspace directory (for author name resolution everywhere)
  const [workspaceMembers, setWorkspaceMembers] = useState<
    WorkspaceMembersResponse extends { ok: true } ? WorkspaceMembersResponse["members"] : any[]
  >([]);

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<ChatChannelType>("ROOM");
  const [createName, setCreateName] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // "New" menu (replaces New Room + New DM buttons)
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  // DM picker (workspace members)
  const [dmMembers, setDmMembers] = useState<Array<{ userId: string; name: string; email?: string; image?: string }>>([]);
  const [dmMembersLoading, setDmMembersLoading] = useState(false);
  const [dmMembersError, setDmMembersError] = useState<string | null>(null);
  const [dmSelectedUserId, setDmSelectedUserId] = useState<string>("");
  const [dmSearch, setDmSearch] = useState("");

    // ROOM restricted access picker (workspace members)
  const [roomMembers, setRoomMembers] = useState<Array<{ userId: string; name: string; email?: string; image?: string }>>([]);
  const [roomMembersLoading, setRoomMembersLoading] = useState(false);
  const [roomMembersError, setRoomMembersError] = useState<string | null>(null);
  const [roomSelectedUserIds, setRoomSelectedUserIds] = useState<string[]>([]);
  const [roomSearch, setRoomSearch] = useState("");

  // scroll
  const scrollerInnerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageId = messages.length ? messages[messages.length - 1].id : null;
  const msgCount = messages.length;
  const forceScrollNextRef = useRef(false);

    // realtime-ish polling
  const pollTimerRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
  const lastChannelsRefreshAtRef = useRef(0);

  const [lastReadByChannel, setLastReadByChannel] = useState<Record<string, string>>({});
  const lastReadByChannelRef = useRef<Record<string, string>>({});

  useEffect(() => {
    lastReadByChannelRef.current = lastReadByChannel;
  }, [lastReadByChannel]);

  const lastReadId = selectedChannelId ? lastReadByChannel[selectedChannelId] : undefined;

  const authorLabelById = useMemo(() => {
  const map = new Map<string, string>();
    for (const m of workspaceMembers || []) {
      const label = m.user?.name || m.user?.email || "";
      if (m.userId && label) map.set(m.userId, label);
    }
    return map;
  }, [workspaceMembers]);

  const mentionMembers = useMemo(() => {
    return (workspaceMembers || [])
      .filter((m: any) => !m.removedAt)
      .map((m: any) => ({
        userId: m.userId,
        name: m.user?.name || m.user?.email || m.userId,
        email: m.user?.email || undefined,
        image: m.user?.image || undefined,
      }));
  }, [workspaceMembers]);

  const workspaceRoleByUserId = useMemo(() => {
  const map = new Map<string, "OWNER" | "ADMIN" | "AGENT">();
  for (const m of workspaceMembers || []) {
    if (m.userId && m.role) map.set(m.userId, m.role);
  }
  return map;
}, [workspaceMembers]);

  // highlight / jump
  const [highlightId, setHighlightId] = useState<string | null>(null);

const board = useMemo(() => channels.find((c) => c.type === "BOARD") || null, [channels]);

  // Initial boot
  const didBoot = useRef(false);
  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;

    (async () => {
      setLoading(true);
      setError(null);

      const b = await apiEnsureBoard();
      if (!b || (b as any).ok !== true) {
        setError((b as any)?.error || "Failed to initialize Hub");
        void loadWorkspaceDirectory();
        setLoading(false);
        return;
      }

      setWorkspaceRole((b as any).workspaceRole ?? null);

      const ch = await apiListChannels({ includeArchived: false, limit: 200 });
      if (!isOkChannels(ch)) {
        setError((ch as any)?.error || "Failed to load channels");
        setLoading(false);
        return;
      }

     setChannels(ch.channels);

    const pick = ch.channels.find((c) => c.type === "BOARD") || ch.channels[0] || null;

    setSelectedChannelId((b as any)?.channel?.id ?? pick?.id ?? null);
    void loadWorkspaceDirectory();
    setLoading(false);
    })();
  }, []);

  async function refreshChannels(keepSelected = true) {
  const ch = await apiListChannels({ includeArchived: false, limit: 200 });
    if (!isOkChannels(ch)) return;

    const nowIso = new Date().toISOString();
    const local = lastReadByChannelRef.current;

    setChannels(
      ch.channels.map((c) => {
        const localLastReadId = local[c.id];
        if (!localLastReadId) return c;
        return {
          ...c,
          readState: {
            ...(c.readState ?? {}),
            lastReadAt: nowIso,
            lastReadMessageId: localLastReadId,
          },
        };
      })
    );

    if (!keepSelected && ch.channels.length) setSelectedChannelId(ch.channels[0].id);
  }

  async function loadMessages(channelId: string, opts: { mode: "initial" | "older"; cursorId?: string | null }) {
    setLoadingMessages(true);
    try {
      const res = await apiListMessages({
        channelId,
        limit: 60,
        cursorId: opts.cursorId ?? null,
        direction: "backward",
      });

      if (!isOkMessages(res)) {
        setError((res as any)?.error || "Failed to load messages");
        return;
      }
      if (opts.mode === "older") {
        setMessages((prev) => [...res.messages, ...prev]);
      } else {
        forceScrollNextRef.current = true; // ✅ snap to bottom on fresh load
        setMessages(res.messages);
      }

      setOlderCursor(res.nextCursor);
      
        const newestId = res.messages?.length ? res.messages[res.messages.length - 1].id : null;
      if (opts.mode !== "older" && newestId) {
        const nowIso = new Date().toISOString();

        setLastReadByChannel((prev) => ({ ...prev, [channelId]: newestId }));

        setChannels((prev) =>
          prev.map((c) =>
            c.id === channelId
              ? {
                  ...c,
                  readState: {
                    ...(c.readState ?? {}),
                    lastReadAt: nowIso,
                    lastReadMessageId: newestId,
                  },
                }
              : c
          )
        );

        void apiMarkRead(channelId, newestId);
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  async function pollNewMessages(channelId: string) {
  if (pollingRef.current) return;
  if (!channelId) return;

  pollingRef.current = true;
  try {
    const res = await apiListMessages({
      channelId,
      limit: 40,
      direction: "backward",
    });

    if (!isOkMessages(res)) return;

    // ✅ If user switched channels while the request was in-flight, ignore results
    if (selectedChannelIdRef.current !== channelId) return;

    const incoming = res.messages || [];
    if (!incoming.length) return;

    setMessages((prev) => mergeMessagesById(prev, incoming));

    // keep olderCursor fresh so "Load older" remains correct
    setOlderCursor(res.nextCursor);

    const now = Date.now();
    if (now - lastChannelsRefreshAtRef.current > 15000) {
      lastChannelsRefreshAtRef.current = now;
      void refreshChannels(true);
    }
  } finally {
    pollingRef.current = false;
  }
}

async function pollMentions() {
  const res = await apiMentions(50);
  if (!isOkMentions(res)) return;

  const list = res.mentions || [];

  // baseline (don’t pop a notification on first load)
  if (!lastSeenMentionAtRef.current) {
    lastSeenMentionAtRef.current = list[0]?.createdAt ?? null;
    setMentionsUnreadCount(0);
    return;
  }

  const lastSeen = new Date(lastSeenMentionAtRef.current).getTime();
  const unread = list.filter((m: any) => new Date(m.createdAt).getTime() > lastSeen).length;

  setMentionsUnreadCount(unread);

  // if drawer is open, treat as "seen"
  if (mentionsOpen) {
    lastSeenMentionAtRef.current = list[0]?.createdAt ?? lastSeenMentionAtRef.current;
    setMentionsUnreadCount(0);
  }
}


  // Load messages on channel change
    useEffect(() => {
      if (!selectedChannelId) return;

      // don't wipe workspace directory; it's used for author names everywhere
      setMembersError(null);
      setError(null);
      setMessages([]);
      setOlderCursor(null);
      setHighlightId(null);

      // channel messages load as usual
      void loadMessages(selectedChannelId, { mode: "initial" });

      // (optional) keep the directory fresh whenever channel changes
      void loadWorkspaceDirectory();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChannelId]);

  // poll for new messages while a channel is open
  useEffect(() => {
    // cleanup any existing timer
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollingRef.current = false;

    if (!selectedChannelId) return;

    // kick once shortly after initial load so it feels "instant"
    const kickoff = window.setTimeout(() => {
      void pollNewMessages(selectedChannelId);
    }, 300);

    pollTimerRef.current = window.setInterval(() => {
      if (!document.hidden) void pollNewMessages(selectedChannelId);
    }, 1500);

    return () => {
      window.clearTimeout(kickoff);
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId]);

  // poll for mentions (notification badge)
  useEffect(() => {
    // cleanup any existing timer
    if (mentionsPollRef.current) {
      window.clearInterval(mentionsPollRef.current);
      mentionsPollRef.current = null;
    }

    // kickoff shortly after mount
    const kickoff = window.setTimeout(() => {
      void pollMentions();
    }, 1200);

    mentionsPollRef.current = window.setInterval(() => {
      if (!document.hidden) void pollMentions();
    }, 10000);

    return () => {
      window.clearTimeout(kickoff);
      if (mentionsPollRef.current) {
        window.clearInterval(mentionsPollRef.current);
        mentionsPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionsOpen]);

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollerInnerRef.current;
    if (!el) return;

    // Scroll ONLY the inner messages container (never the window)
    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }

    useLayoutEffect(() => {
      const el = scrollerInnerRef.current;
      if (!el) return;

      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;

      if (forceScrollNextRef.current) {
        forceScrollNextRef.current = false;
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom("auto")));
        return;
      }

      if (nearBottom) {
        requestAnimationFrame(() => scrollToBottom("auto"));
      }
    }, [selectedChannelId, lastMessageId, msgCount]);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTextField = tag === "input" || tag === "textarea" || (target as any)?.isContentEditable;

      if (e.key === "Escape") {
        setMentionsOpen(false);
        setMembersOpen(false);
        setCreateOpen(false);
        setNewMenuOpen(false); // ✅ add
        return;
      }

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (document.getElementById("hub-channel-search") as HTMLInputElement | null)?.focus();
        return;
      }

      if (meta && e.key === "Enter") {
        if (document.activeElement === composerRef.current) {
          e.preventDefault();
          void onSend();
        }
        return;
      }

      if (isTextField && document.activeElement !== composerRef.current) return;
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId, sending]);

  async function loadOlder() {
    if (!selectedChannelId || !olderCursor || loadingMessages) return;
    await loadMessages(selectedChannelId, { mode: "older", cursorId: olderCursor });
  }


  async function onSend() {
    if (!selectedChannelId) return;

    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    const nonce = makeNonce();
    const optimisticId = `optimistic:${nonce}`;
    const nowIso = new Date().toISOString();

    const optimistic: Message = {
      id: optimisticId,
      workspaceId: selectedChannel?.workspaceId ?? "",
      channelId: selectedChannelId,
      authorUserId: me.id ?? null,
      type: "TEXT",
      status: "SENT",
      clientNonce: nonce,
      parentId: null,
      body: body || "",
      editedAt: null,
      editedByUserId: null,
      deletedAt: null,
      deletedByUserId: null,
      payload: null,
      createdAt: nowIso,
      reactions: [],
      mentions: [],
    };

    const mentionIds = mentionedUserIds; 

    setDraft("");
    setMentionedUserIds([]);

    forceScrollNextRef.current = true;
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await apiCreateMessage(selectedChannelId, {
        body,
        clientNonce: nonce,
        type: "TEXT",
        mentionedUserIds: mentionIds.length ? mentionIds : undefined,
      });

      if (!res || (res as any).ok !== true) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setError((res as any)?.error?.error || (res as any)?.error || "Failed to send message");
        return;
      }

      if (res.message?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? {
                  ...m,
                  id: res.message.id,
                  createdAt: res.message.createdAt ?? m.createdAt,
                }
              : m
          )
        );

        setLastReadByChannel((prev) => ({ ...prev, [selectedChannelId]: res.message.id }));
        void apiMarkRead(selectedChannelId, res.message.id);

        const nowIso = new Date().toISOString();
          setChannels((prev) =>
            prev.map((c) =>
              c.id === selectedChannelId
                ? {
                    ...c,
                    readState: {
                      ...(c.readState ?? {}),
                      lastReadAt: nowIso,
                      lastReadMessageId: res.message.id,
                    },
                  }
                : c
            )
          );
      } else {
        void loadMessages(selectedChannelId, { mode: "initial" });
      }

      void refreshChannels(true);
    } finally {
      setSending(false);
      setMentionedUserIds([]);
      try {
        composerRef.current?.focus({ preventScroll: true } as any);
      } catch {
        composerRef.current?.focus();
      }
    }
  }

  async function openMentions() {
  setMentionsOpen(true);
  setMentionsUnreadCount(0);

  if (mentionsLoading) return;

  setMentionsLoading(true);
  try {
    const res = await apiMentions(50);
    if (isOkMentions(res)) {
      setMentions(res.mentions);
      lastSeenMentionAtRef.current = res.mentions?.[0]?.createdAt ?? lastSeenMentionAtRef.current;
    }
  } finally {
    setMentionsLoading(false);
  }
}

  async function openMembers() {
    if (!selectedChannelId) return;

    setMembersOpen(true);
    if (membersLoading) return;

    setMembersLoading(true);
    setMembersError(null);

    try {
      const res = await apiChannelMembers(selectedChannelId);
        if (!isOkChannelMembers(res)) {
          setChannelMembers([]);
          setMembersError((res as any)?.error || "Unable to load members.");
          return;
        }
        setChannelMembers(res.members);
    } finally {
      setMembersLoading(false);
    }
  }

  async function loadWorkspaceDirectory() {
    try {
      const res = await apiWorkspaceMembers();
      if (isOkWorkspaceMembers(res)) setWorkspaceMembers(res.members);
    } catch {
      // ignore
    }
  }

  async function ensureDmMembersLoaded() {
    if (dmMembersLoading) return;
    setDmMembersError(null);

    setDmMembersLoading(true);
    try {
      const res = await apiWorkspaceMembers();
      if (!isOkWorkspaceMembers(res)) {
        setDmMembers([]);
        setDmMembersError((res as any)?.error || "Unable to load workspace members.");
        return;
      }

      const list =
        (res.members || [])
          .filter((m: any) => !m.removedAt)
          .map((m: any) => ({
            userId: m.userId,
            name: m.user?.name || m.user?.email || m.userId,
            email: m.user?.email || undefined,
            image: m.user?.image || undefined,
          })) || [];

      // remove me from picker
      setDmMembers(me.id ? list.filter((x) => x.userId !== me.id) : list);
    } finally {
      setDmMembersLoading(false);
    }
  }

  async function ensureRoomMembersLoaded() {
    if (roomMembersLoading) return;
    setRoomMembersError(null);

    setRoomMembersLoading(true);
    try {
      const res = await apiWorkspaceMembers();
      if (!isOkWorkspaceMembers(res)) {
        setRoomMembers([]);
        setRoomMembersError((res as any)?.error || "Unable to load workspace members.");
        return;
      }

      const list =
        (res.members || [])
          .filter((m: any) => !m.removedAt)
          .map((m: any) => ({
            userId: m.userId,
            name: m.user?.name || m.user?.email || m.userId,
            email: m.user?.email || undefined,
            image: m.user?.image || undefined,
          })) || [];

      // remove me from picker (creator always included automatically)
      setRoomMembers(me.id ? list.filter((x) => x.userId !== me.id) : list);
    } finally {
      setRoomMembersLoading(false);
    }
  }

  function scrollToMessage(messageId: string) {
    const el = scrollerInnerRef.current;
    if (!el) return;

    const node = el.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`) as HTMLElement | null;
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(messageId);
    window.setTimeout(() => setHighlightId((cur) => (cur === messageId ? null : cur)), 1400);
  }

  async function waitForMessageInDom(messageId: string, timeoutMs = 3500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = scrollerInnerRef.current;
      if (el) {
        const node = el.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
        if (node) return true;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  async function jumpToMention(channelId: string, messageId: string) {
    setMentionsOpen(false);
    setSelectedChannelId(channelId);

    (async () => {
      // give React a tick to swap channels and start loading
      await new Promise((r) => setTimeout(r, 0));

      // wait until the message row exists in DOM (or timeout)
      const ok = await waitForMessageInDom(messageId);
      if (ok) {
        scrollToMessage(messageId);
        void apiMarkRead(channelId, messageId);
      } else {
        // fallback: at least load latest and try once
        if (channelId) await loadMessages(channelId, { mode: "initial" });
        scrollToMessage(messageId);
        void apiMarkRead(channelId, messageId);
      }
    })();
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const mine = me.id ? m.reactions.some((r) => r.userId === me.id && r.emoji === emoji) : false;
        if (mine) return { ...m, reactions: m.reactions.filter((r) => !(r.userId === me.id && r.emoji === emoji)) };
        return {
          ...m,
          reactions: [
            ...m.reactions,
            { id: `optimistic:${messageId}:${emoji}`, userId: me.id || "me", emoji, createdAt: new Date().toISOString() },
          ],
        };
      })
    );

    const res = await apiToggleReaction(messageId, emoji);
    if (!res || (res as any).ok !== true) {
      if (selectedChannelId) void loadMessages(selectedChannelId, { mode: "initial" });
    }
  }

  async function onEditMessage(messageId: string, nextBody: string) {
    const next = nextBody.trim();
    if (!next) return;

    const snapshot = messages;

    setMessages((curr) =>
      curr.map((m) =>
        m.id === messageId
          ? {
              ...m,
              body: next,
              editedAt: new Date().toISOString(),
              editedByUserId: me.id ?? null,
            }
          : m
      )
    );

    const res = await apiEditMessage(messageId, next);
    if (!res || (res as any).ok !== true) {
      setMessages(snapshot);
      setError((res as any)?.error?.error || (res as any)?.error || "Failed to edit message");
      return;
    }

    if ((res as any)?.message?.id) {
      const server = (res as any).message;
      setMessages((curr) =>
        curr.map((m) =>
          m.id === messageId
            ? {
                ...m,
                body: server.body ?? m.body,
                editedAt: server.editedAt ?? m.editedAt,
                editedByUserId: server.editedByUserId ?? m.editedByUserId,
              }
            : m
        )
      );
    }

    void refreshChannels(true);
  }

  async function onDeleteMessage(messageId: string) {
    const snapshot = messages;

    setMessages((curr) =>
      curr.map((m) =>
        m.id === messageId
          ? {
              ...m,
              deletedAt: new Date().toISOString(),
              deletedByUserId: me.id ?? null,
            }
          : m
      )
    );

    const res = await apiDeleteMessage(messageId);
    if (!res || (res as any).ok !== true) {
      setMessages(snapshot);
      setError((res as any)?.error?.error || (res as any)?.error || "Failed to delete message");
      return;
    }

    void refreshChannels(true);
  }

  const rooms = useMemo(
    () =>
      channels
        .filter((c) => c.type === "ROOM" && !c.archivedAt)
        .sort((a, b) => (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)),
    [channels]
  );

  const dms = useMemo(
    () =>
      channels
        .filter((c) => c.type === "DM" && !c.archivedAt)
        .sort((a, b) => (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)),
    [channels]
  );

  const [search, setSearch] = useState("");
  const [roomsOpen, setRoomsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);
  const [channelsDrawerOpen, setChannelsDrawerOpen] = useState(false);

  // persist collapsible state
  useEffect(() => {
    try {
      const r = localStorage.getItem("hub:roomsOpen");
      const d = localStorage.getItem("hub:dmsOpen");
      if (r !== null) setRoomsOpen(r === "1");
      if (d !== null) setDmsOpen(d === "1");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("hub:roomsOpen", roomsOpen ? "1" : "0");
    } catch {}
  }, [roomsOpen]);

  useEffect(() => {
    try {
      localStorage.setItem("hub:dmsOpen", dmsOpen ? "1" : "0");
    } catch {}
  }, [dmsOpen]);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((c) => c.name.toLowerCase().includes(q));
  }, [rooms, search]);

  const filteredDMs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dms;
    return dms.filter((c) => c.name.toLowerCase().includes(q));
  }, [dms, search]);

    // create modal resets
    useEffect(() => {
      if (!createOpen) return;
      setError(null);
      setCreateError(null);

      if (createType === "DM") {
        setCreatePrivate(false);
        setCreateName("");
        setDmSelectedUserId("");
        setDmSearch("");
        void ensureDmMembersLoaded();
        return;
      }

      if (createType === "ROOM") {
        setCreateName("");
        setCreatePrivate(false);

        setRoomSelectedUserIds([]);
        setRoomSearch("");
        setRoomMembers([]);
        setRoomMembersError(null);
        return;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createOpen, createType]);

  // DM: set name/key from selected user
  useEffect(() => {
    if (!createOpen) return;
    if (createType !== "DM") return;

    const sel = dmMembers.find((m) => m.userId === dmSelectedUserId);
    if (!sel) {
      setCreateName("");
      return;
    }

    const dmName = sel.name;
    setCreateName(dmName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmSelectedUserId, createType, createOpen, dmMembers, me.id]);

  async function onCreateChannel() {
    setError(null);
    setCreateError(null);

    if (createType === "DM") {
      const otherId = dmSelectedUserId;
      if (!me.id || !otherId) return;

      const key = stableDmKey(me.id, otherId);
      const name = createName.trim() || "Direct Message";

      setCreateBusy(true);
      try {
        const res = await apiCreateChannel({
          name,
          key,
          type: "DM",
          isPrivate: true,
          memberUserIds: [me.id, otherId],
        });

        if (!res || (res as any).ok !== true) {
          const raw = String((res as any)?.error?.error || (res as any)?.error || "").toLowerCase();

          setCreateError("Couldn’t create DM. Please try again.");
          return;
        }


        setCreateOpen(false);
        setCreateName("");
        setDmSelectedUserId("");
        setDmSearch("");

        await refreshChannels(true);
        if (res.channel?.id) setSelectedChannelId(res.channel.id);
      } finally {
        setCreateBusy(false);
      }

      return;
    }

    // ROOM
    const name = createName.trim();
    if (!name) return;
    setCreateBusy(true);
      try {
        const key = name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48);

        const memberUserIds =
          createPrivate
            ? Array.from(new Set([...(me.id ? [me.id] : []), ...(roomSelectedUserIds || [])]))
            : undefined;

        const res = await apiCreateChannel({
          name,
          key,
          type: "ROOM",
          isPrivate: createPrivate,
          memberUserIds,
        });

          if (!res || (res as any).ok !== true) {
              const raw = String((res as any)?.error?.error || (res as any)?.error || "").toLowerCase();

              setCreateError("Failed to create room. A room with a similar name might already exist.");
              return;
            }

      setCreateOpen(false);
      setCreateName("");
      setCreatePrivate(false);

      await refreshChannels(true);
      if (res.channel?.id) setSelectedChannelId(res.channel.id);
    } finally {
      setCreateBusy(false);
    }
  }

  const channelSubtitle = useMemo(() => {
    if (!selectedChannel) return "Pick a channel to start.";
    if (selectedChannel.type === "BOARD") return "Workspace-wide stream for updates and collaboration.";
    if (selectedChannel.type === "DM") return "Direct conversation — quick and focused.";
    if (selectedChannel.isPrivate) return "Restricted access — only selected members can view.";
    return "Room — visible to your workspace.";
  }, [selectedChannel]);

  // render messages with day dividers + last read marker
const renderedStream = useMemo(() => {
  const out: React.ReactNode[] = [];
  let lastDay: string | null = null;

  // Assumes messages are ordered oldest -> newest
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];

    // Day divider
    const d = isoDay(m.createdAt);
    if (d !== lastDay) {
      out.push(<DayDivider key={`day:${d}`} isoDay={d} />);
      lastDay = d;
    }

    const marker =
      !!lastReadId &&
      i > 0 &&
      messages[i - 1]?.id === lastReadId &&
      !(me.id && m.authorUserId === me.id); // ✅ never show "new since last read" above my own message

    out.push(
      <MessageRow
        key={m.id}
        m={m as any}
        mine={!!me.id && m.authorUserId === me.id}
        meName={me.name}
        meInitials={initials(me.name)}
        onReact={(emoji) => void toggleReaction(m.id, emoji)}
        onEdit={(nextBody) => onEditMessage(m.id, nextBody)}
        onDelete={() => void onDeleteMessage(m.id)}
        tidyAuthor={(authorUserId, mine, meName) => {
          if (mine) return meName || "You";
          if (!authorUserId) return "System";
          return authorLabelById.get(authorUserId) || `${authorUserId.slice(0, 6)}…${authorUserId.slice(-4)}`;
        }}
        groupReactions={(rx) => groupReactions(rx as any, me.id)}
        highlight={highlightId === m.id}
        lastReadMarker={marker}
      />
    );
  }

  return out;
}, [messages, lastReadId, me.id, me.name, highlightId, authorLabelById]);

const channelMemberUsers = useMemo(() => {
  return (channelMembers || []).map((m: any) => ({ name: m.user?.name, image: m.user?.image }));
}, [channelMembers]);

const LeftRail = (
  <div className="flex h-full min-h-0 flex-col">
    {/* Header + search (NOT scrollable) */}
    <div className="px-4 pt-4 md:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-amber-50/90">Channels</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-50/45">
            <span>Board</span>
            <Dot />
            <span>Rooms</span>
            <Dot />
            <span>DMs</span>

            {workspaceRole ? (
              <span className="ml-1 rounded-full border border-amber-200/10 bg-white/5 px-2 py-0.5 text-[10px] text-amber-50/55">
                {workspaceRole}
              </span>
            ) : null}
          </div>
        </div>

        <StatusPill status={loading ? "loading" : error ? "error" : "ok"} />
      </div>

      <div className="mt-3">
        <div className="relative">
          <input
            id="hub-channel-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels…"
            className={cx(
              "w-full rounded-2xl border border-amber-200/10 bg-black/20 px-3 py-2",
              "text-sm text-amber-50/90 placeholder:text-amber-50/35",
              "outline-none focus:border-amber-200/20"
            )}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_28px_rgba(244,210,106,0.05)]"
          />
        </div>
      </div>

      <div className="mt-4">
        <DividerSoft />
      </div>
    </div>

    {/* Scroll area */}
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      {error ? (
        <div className="mx-3 mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100/90">
          {error}
        </div>
      ) : null}

      {loading ? <SkeletonCard className="mx-3 mt-3">Booting Hub…</SkeletonCard> : null}

      {/* BOARD */}
      {board ? (
        <div className="mt-3">
          <SectionLabel label="Board" />
          <ChannelRow
            channel={board as any}
            selected={selectedChannelId === board.id}
            onClick={() => {
              setSelectedChannelId(board.id);
              setChannelsDrawerOpen(false);
            }}
            hasUnread={channelHasUnread(board)}
            lastReadAt={board.readState?.lastReadAt ?? null}
          />
        </div>
      ) : null}

      {/* ROOMS */}
      <div className="mt-4">
        <CollapsibleHeader
          label="Rooms"
          open={roomsOpen}
          onToggle={() => setRoomsOpen((v) => !v)}
          noTop
          right={
            <MiniAction
              onClick={() => {
                setCreateType("ROOM");
                setCreateOpen(true);
                setChannelsDrawerOpen(false);
              }}
              title="New room"
            >
              + Room
            </MiniAction>
          }
        />

        {roomsOpen ? (
          filteredRooms.length ? (
            filteredRooms.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c as any}
                selected={selectedChannelId === c.id}
                onClick={() => {
                  setSelectedChannelId(c.id);
                  setChannelsDrawerOpen(false);
                }}
                hasUnread={channelHasUnread(c)}
                lastReadAt={c.readState?.lastReadAt ?? null}
              />
            ))
          ) : (
            <EmptyHint text="No rooms yet." />
          )
        ) : null}
      </div>

      {/* DMS */}
      <div className="mt-4">
        <CollapsibleHeader
          label="DMs"
          open={dmsOpen}
          onToggle={() => setDmsOpen((v) => !v)}
          noTop
          right={
            <MiniAction
              onClick={() => {
                setCreateType("DM");
                setCreateOpen(true);
                setChannelsDrawerOpen(false);
              }}
              title="New DM"
            >
              + DM
            </MiniAction>
          }
        />

        {dmsOpen ? (
          filteredDMs.length ? (
            filteredDMs.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c as any}
                selected={selectedChannelId === c.id}
                onClick={() => {
                  setSelectedChannelId(c.id);
                  setChannelsDrawerOpen(false);
                }}
                hasUnread={channelHasUnread(c)}
                lastReadAt={c.readState?.lastReadAt ?? null}
              />
            ))
          ) : (
            <EmptyHint text="No DMs yet." />
          )
        ) : null}
      </div>

      <div className="mx-4 mt-5">
        <DividerSoft />
      </div>
    </div>
  </div>
);

return (
  <>
  <div className="space-y-10">
    <PageHeader eyebrow="Hub" title="Stay connected" subtitle="Centralized conversations and workspace updates." />

    <div className="px-4 pb-8 md:px-6">
      <GlassShell>
        <div className="hidden md:block">
        <Toolbar
          left={
            <div className="flex items-center gap-3">
              <Orb />
              <div className="min-w-0">
                <div className="text-[11px] font-medium tracking-[0.22em] text-amber-100/45">HUB</div>
              </div>
            </div>
          }
          right={
  <div className="flex items-center gap-2">
      <SoftButton onClick={() => setNewMenuOpen(true)} title="Create a room or start a DM" rightHint="+">
        New
      </SoftButton>

      <div className="relative">
        <SoftButton onClick={() => void openMentions()} title="Mentions" rightHint="@">
          Mentions
        </SoftButton>

        {mentionsUnreadCount > 0 ? (
          <span
            className={cx(
              "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1",
              "rounded-full border border-amber-200/20 bg-amber-300/20",
              "text-[10px] font-semibold text-amber-50/90",
              "flex items-center justify-center",
              "shadow-[0_0_16px_rgba(244,210,106,0.22)]"
            )}
          >
            {mentionsUnreadCount > 99 ? "99+" : mentionsUnreadCount}
          </span>
        ) : null}
      </div>

      <SoftButton onClick={() => void openMembers()} title="Members" rightHint="👥">
        Members
      </SoftButton>
    </div>
}
        />
          <Divider />
         </div>

          <div className="relative grid min-h-0 md:h-[75vh] grid-cols-1 md:grid-cols-[320px_1fr]">
            {/* LEFT RAIL */}
            <aside className="hidden md:block h-full min-h-0 overflow-hidden border-b border-amber-200/10 md:border-b-0 md:border-r md:border-amber-200/10">
              {LeftRail}
            </aside>

          {/* Mobile top actions */}
          <div className="md:hidden px-4 pt-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <SoftButton onClick={() => setNewMenuOpen(true)} title="Create" rightHint="+">
                New
              </SoftButton>

              <div className="relative">
                <SoftButton onClick={() => void openMentions()} title="Mentions" rightHint="@">
                  Mentions
                </SoftButton>

                {mentionsUnreadCount > 0 ? (
                  <span
                    className={cx(
                      "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1",
                      "rounded-full border border-amber-200/20 bg-amber-300/20",
                      "text-[10px] font-semibold text-amber-50/90",
                      "flex items-center justify-center",
                      "shadow-[0_0_16px_rgba(244,210,106,0.22)]"
                    )}
                  >
                    {mentionsUnreadCount > 99 ? "99+" : mentionsUnreadCount}
                  </span>
                ) : null}
              </div>

              <SoftButton onClick={() => void openMembers()} title="Members" rightHint="👥">
                Members
              </SoftButton>
            </div>
          </div>

            {/* MAIN */}
          <main className="min-h-[72vh]">
            {/* Channel header */}
            <div className="px-4 pt-4 md:px-5">
              <div className="space-y-2">
                {/* Row 2 (mobile) / Desktop header row: actions */}
                <div className="flex items-start justify-between gap-3">
                  {/* Desktop: title + subtitle live on the left */}
                  <div className="hidden md:block min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-lg font-semibold text-amber-50/95">
                        {selectedChannel ? selectedChannel.name : "Select a channel"}
                      </div>

                      {selectedChannel ? (
                        <Tag>
                          {selectedChannel.type === "BOARD"
                            ? "Board"
                            : selectedChannel.type === "DM"
                            ? "DM"
                            : selectedChannel.isPrivate
                            ? "Restricted"
                            : "Room"}
                        </Tag>
                      ) : null}

                      {(membersOpen || channelMembers.length) && channelMemberUsers.length ? (
                        <div className="ml-1">
                          <AvatarStack users={channelMemberUsers} />
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-1 text-sm text-amber-50/55">{channelSubtitle}</div>
                  </div>

                  {/* Actions (mobile row 2, desktop right controls) */}
                  <div className="flex items-center gap-2">
                    {/* Mobile: open channels drawer */}
                    <div className="md:hidden">
                      <SoftButton onClick={() => setChannelsDrawerOpen(true)} title="Channels" rightHint="☰">
                        Channels
                      </SoftButton>
                    </div>

                    <SoftButton
                      onClick={() => {
                        void refreshChannels(true);
                        if (selectedChannelId) void loadMessages(selectedChannelId, { mode: "initial" });
                      }}
                      title="Refresh"
                      rightHint="↻"
                    >
                      Refresh
                    </SoftButton>
                  </div>
                </div>

                {/* ✅ Mobile Row 3: title (bumped down) */}
                <div className="md:hidden min-w-0 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-lg font-semibold text-amber-50/95">
                      {selectedChannel ? selectedChannel.name : "Select a channel"}
                    </div>

                    {selectedChannel ? (
                      <Tag>
                        {selectedChannel.type === "BOARD"
                          ? "Board"
                          : selectedChannel.type === "DM"
                          ? "DM"
                          : selectedChannel.isPrivate
                          ? "Restricted"
                          : "Room"}
                      </Tag>
                    ) : null}

                    {(membersOpen || channelMembers.length) && channelMemberUsers.length ? (
                      <div className="ml-1">
                        <AvatarStack users={channelMemberUsers} />
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ✅ Mobile Row 4: subtitle */}
                <div className="md:hidden text-sm text-amber-50/55">{channelSubtitle}</div>
              </div>

              <div className="mt-4">
                <Divider />
              </div>
            </div>

              {/* Messages + Composer (messages scroll; composer below) */}
                <div className="px-2 pb-4 pt-3 md:px-4">
                  <div className="space-y-3">
                    {/* MESSAGES BOX */}
                    <GlassPanel inner className="h-[52vh] min-h-0 overflow-hidden">
                        <div className="flex h-full min-h-0 flex-col overflow-hidden">
                          <div
                            ref={scrollerInnerRef}
                            className={cx(
                              "flex-1 min-h-0 overflow-y-auto",
                              "px-3 py-3 md:px-4",
                              "mt-3",
                              "mr-2 mb-3 pr-2"
                            )}
                            style={{
                              scrollbarGutter: "stable",
                            }}
                          >
                          {!loadingMessages && selectedChannelId && olderCursor ? (
                            <button
                              onClick={() => void loadOlder()}
                              className={cx(
                                "mb-3 w-full rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-2 text-xs",
                                "text-amber-50/70 hover:bg-white/8 transition"
                              )}
                            >
                              Load older
                            </button>
                          ) : null}

                          {loadingMessages ? (
                            <div className="min-h-full">
                              <SkeletonCard>Loading messages…</SkeletonCard>
                            </div>
                          ) : !selectedChannelId ? (
                            <div className="min-h-full flex items-center justify-center">
                              <div className="rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3 text-sm text-amber-50/60">
                                Select a channel to start.
                              </div>
                            </div>
                          ) : !messages.length ? (
                            <div className="min-h-full flex items-center justify-center">
                              <div className="rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3 text-sm text-amber-50/60">
                                No messages yet. Start the thread 👇
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {renderedStream}
                            </div>
                          )}
                        </div>
                      </div>
                    </GlassPanel>

                    {/* COMPOSER (now below the message box) */}
                    <GlassPanel inner className="p-2 relative">
                     <div className="flex items-end gap-2">
                      <div className="flex-1 min-w-0">
                        <MentionComposer
                          value={draft}
                          onChange={setDraft}
                          onSend={() => void onSend()}
                          disabled={!selectedChannelId || sending}
                          placeholder={!selectedChannelId ? "Select a channel…" : "Message…"}
                          members={mentionMembers}
                          meUserId={me.id ?? null}
                          textareaRef={composerRef}
                          onMentionedUserIdsChange={setMentionedUserIds}
                        />
                      </div>

                      <div className="shrink-0">
                        <PrimaryButton
                          onClick={() => void onSend()}
                          disabled={!selectedChannelId || sending || !draft.trim()}
                        >
                          {sending ? "Sending…" : "Send"}
                        </PrimaryButton>
                      </div>
                    </div>

                      <div className="mt-2 flex items-center justify-between px-2">
                    </div>
                    </GlassPanel>
                  </div>
                </div>
              </main>
          </div>

          {/* Mobile Channels Drawer */}
          <Drawer open={channelsDrawerOpen} onClose={() => setChannelsDrawerOpen(false)} title="Channels">
            <div className="h-full">{LeftRail}</div>
          </Drawer>

          {/* Mentions Drawer */}
          <Drawer open={mentionsOpen} onClose={() => setMentionsOpen(false)} title="Mentions">
            <div className="h-full px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-50/90">Your mentions</div>
                  <div className="mt-1 text-xs text-amber-50/45">
                    Mentions across Board, Rooms, and DMs.
                  </div>
                </div>

                <div className="shrink-0">
                  <Tag>{mentionsLoading ? "…" : `${(mentions || []).length}`}</Tag>
                </div>
              </div>

              <div className="mt-4">
                <DividerSoft />
              </div>

              <div className="mt-4">
                <GlassPanel inner className="p-3">
                  {mentionsLoading ? (
                    <div className="py-10">
                      <SkeletonCard>Loading mentions…</SkeletonCard>
                    </div>
                  ) : !mentions?.length ? (
                    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                      <Orb />
                      <div className="text-sm font-semibold text-amber-50/85">No mentions yet</div>
                      <div className="max-w-[320px] text-xs text-amber-50/45">
                        When someone tags you with @, you’ll see it here.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(mentions || []).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => jumpToMention(m.message.channelId, m.messageId)}
                          className={cx(
                            "group w-full rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3 text-left transition",
                            "hover:bg-white/8"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-amber-50/90">
                                {m.message.channel.name}
                              </div>
                              <div className="mt-1 truncate text-xs text-amber-50/45">
                                {formatTime(m.createdAt)}
                              </div>
                            </div>

                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full bg-amber-200/35 group-hover:bg-amber-200/60 transition"
                            />
                          </div>

                          <div className="mt-2 line-clamp-3 text-sm text-amber-50/70">
                            {m.message.body}
                          </div>

                          <div
                            aria-hidden
                            className="pointer-events-none mt-3 h-px w-full bg-gradient-to-r from-amber-200/0 via-amber-200/10 to-amber-200/0 opacity-60"
                          />
                          <div className="mt-2 text-[11px] text-amber-50/35">Click to jump</div>
                        </button>
                      ))}
                    </div>
                  )}
                </GlassPanel>
              </div>
            </div>
          </Drawer>

          {/* Members Drawer */}
          <Drawer open={membersOpen} onClose={() => setMembersOpen(false)} title="Members">
            <div className="h-full px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-50/90">Channel members</div>
                  <div className="mt-1 text-xs text-amber-50/45">
                    {selectedChannel
                      ? selectedChannel.isPrivate
                        ? "Restricted access — only selected members."
                        : "Workspace-visible channel."
                      : "Members in this channel."}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Tag>{membersLoading ? "…" : `${(channelMembers || []).length}`}</Tag>
                  <MiniAction subtle onClick={() => void openMembers()} title="Refresh members" disabled={membersLoading}>
                    ↻
                  </MiniAction>
                </div>
              </div>

              <div className="mt-4">
                <DividerSoft />
              </div>

              <div className="mt-4">
                <GlassPanel inner className="p-3">
                  {membersLoading ? (
                    <div className="py-10">
                      <SkeletonCard>Loading members…</SkeletonCard>
                    </div>
                  ) : membersError ? (
                    <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm text-red-100/90">
                      {membersError}
                    </div>
                  ) : !channelMembers?.length ? (
                    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                      <Orb />
                      <div className="text-sm font-semibold text-amber-50/85">No members loaded</div>
                      <div className="max-w-[320px] text-xs text-amber-50/45">
                        Try refreshing, or switch channels and open Members again.
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* quick avatar preview */}
                      <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-amber-50/80">Preview</div>
                          <div className="mt-1 text-[11px] text-amber-50/40">
                          {(channelMembers || []).length} member{(channelMembers || []).length === 1 ? "" : "s"}
                          </div>
                        </div>
                        <AvatarStack users={(channelMembers || []).map((m: any) => ({ name: m.user?.name, image: m.user?.image }))} max={5} />
                      </div>

                      <div className="space-y-2">
                        {(channelMembers || []).map((m: any) => {
                          const name = m.user?.name || m.user?.email || m.userId;
                          const sub = m.user?.email || m.userId;
                          const role =
                            (m.role as any) || workspaceRoleByUserId.get(m.userId) || null;

                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-amber-50/85">{name}</div>
                                <div className="mt-1 truncate text-xs text-amber-50/45">{sub}</div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {role ? (
                                  <span className="rounded-full border border-amber-200/12 bg-white/6 px-2 py-0.5 text-[10px] text-amber-50/60">
                                    {role}
                                  </span>
                                ) : null}

                                <span
                                  aria-hidden
                                  className={cx(
                                    "h-2 w-2 rounded-full",
                                    m.removedAt ? "bg-red-300/60" : "bg-amber-200/60 shadow-[0_0_14px_rgba(244,210,106,0.25)]"
                                  )}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </GlassPanel>
              </div>
            </div>
          </Drawer>

          {/* New chooser modal */}
          {newMenuOpen ? (
            <Modal title="New" onClose={() => setNewMenuOpen(false)}>
              <div className="space-y-3">
                <div className="text-sm text-amber-50/75">
                  Choose what you’d like to create.
                </div>

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewMenuOpen(false);
                      setCreateType("ROOM");
                      setCreateOpen(true);
                    }}
                    className={cx(
                      "w-full rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3 text-left",
                      "hover:bg-white/8 transition"
                    )}
                  >
                    <div className="text-sm font-semibold text-amber-50/90">New Room</div>
                    <div className="mt-1 text-xs text-amber-50/45">Create a shared channel for your workspace.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewMenuOpen(false);
                      setCreateType("DM");
                      setCreateOpen(true);
                    }}
                    className={cx(
                      "w-full rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3 text-left",
                      "hover:bg-white/8 transition"
                    )}
                  >
                    <div className="text-sm font-semibold text-amber-50/90">New DM</div>
                    <div className="mt-1 text-xs text-amber-50/45">Message a workspace member directly.</div>
                  </button>
                </div>
              </div>
            </Modal>
          ) : null}

          {/* Create Channel Modal */}
          {createOpen ? (
            <Modal title={createType === "DM" ? "Start a DM" : "Create room"} onClose={() => setCreateOpen(false)}>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <TypeChip active={createType === "ROOM"} onClick={() => setCreateType("ROOM")} label="Room" />
                  <TypeChip active={createType === "DM"} onClick={() => setCreateType("DM")} label="DM" />
                 </div>

                {createType === "DM" ? (
                  <>
                    {dmMembersError ? (
                      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100/90">
                        {dmMembersError}
                      </div>
                    ) : null}

                    {createError ? (
                      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100/90">
                        {createError}
                      </div>
                    ) : null}

                    <DMMemberPicker
                      members={dmMembers}
                      selectedUserId={dmSelectedUserId}
                      onSelect={(id) => setDmSelectedUserId(id)}
                      search={dmSearch}
                      onSearch={setDmSearch}
                      loading={dmMembersLoading}
                      emptyText="No members found."
                    />

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void onCreateChannel()}
                        disabled={createBusy || !me.id || !dmSelectedUserId}
                        className={cx(
                          "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                          createBusy || !me.id || !dmSelectedUserId
                            ? "cursor-not-allowed border border-amber-200/10 bg-white/5 text-amber-50/35"
                            : "border border-amber-200/15 bg-white/10 text-amber-50 hover:bg-white/15 shadow-[0_0_28px_rgba(244,210,106,0.10)]"
                        )}
                      >
                        {createBusy ? "Creating…" : "Start DM"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Name">
                      <input
                        value={createName}
                        onChange={(e) => {
                          setCreateName(e.target.value);
                          setCreateError(null);
                        }}
                        className="mt-2 w-full rounded-2xl border border-amber-200/10 bg-black/20 px-3 py-2 text-sm text-amber-50/90 placeholder:text-amber-50/35 outline-none"
                      />
                    </Field>
                    {createError ? (
                      <div className="mt-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100/90">
                        {createError}
                      </div>
                    ) : null}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border border-amber-200/10 bg-white/5 px-3 py-3">
                        <div>
                          <div className="text-sm font-semibold text-amber-50/85">Restricted access</div>
                          <div className="mt-1 text-xs text-amber-50/45">Only selected members can view this room.</div>
                        </div>
                        <Toggle
                          on={createPrivate}
                          onClick={() => {
                            setCreatePrivate((v) => {
                              const next = !v;
                              if (next) {
                                void ensureRoomMembersLoaded();
                              } else {
                                setRoomSelectedUserIds([]);
                                setRoomSearch("");
                              }
                              return next;
                            });
                          }}
                          title="Toggle restricted access"
                        />
                      </div>

                      {createPrivate ? (
                        <>
                          {roomMembersError ? (
                            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100/90">
                              {roomMembersError}
                            </div>
                          ) : null}

                          <MemberMultiPicker
                            members={roomMembers}
                            selectedUserIds={roomSelectedUserIds}
                            onToggleUserId={(id) =>
                              setRoomSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                            }
                            search={roomSearch}
                            onSearch={setRoomSearch}
                            loading={roomMembersLoading}
                            emptyText="No members found."
                            hint="Pick who can access this room."
                          />
                        </>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void onCreateChannel()}
                        className={cx(
                          "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                          createBusy || !createName.trim()
                            ? "cursor-not-allowed border border-amber-200/10 bg-white/5 text-amber-50/35"
                            : "border border-amber-200/15 bg-white/10 text-amber-50 hover:bg-white/15 shadow-[0_0_28px_rgba(244,210,106,0.10)]"
                        )}
                      >
                        {createBusy ? "Creating…" : "Create"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Modal>
          ) : null}
        </GlassShell>
      </div>
    </div>
    </>
  );
}