// src/app/api/ai/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { dayBoundsForTZ, safeIanaTZ } from "@/lib/time";
import {
  whereReadableContact,
  whereReadableListing,
  whereReadableCRMActivity,
  whereReadablePin,
  type VisibilityCtx,
} from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.AVILLO_OPENAI_KEY! });

type ClientMsg = { role: "user" | "assistant"; text: string };

type PageContext = {
  contactId?: string;
  listingId?: string;
  taskId?: string;
  conversationId?: string;
  tab?: string;
  filters?: any;
};

type ChatBody = {
  messages?: ClientMsg[];
  page?: string;
  pageContext?: PageContext;
  tz?: string;
};

type AIAction =
  | { type: "open_contact"; label?: string; id: string }
  | { type: "open_listing"; label?: string; id: string }
  | { type: "open_task"; label?: string; id: string }
  | {
      type: "draft_sms";
      label?: string;
      payload: {
        contactId: string;
        conversationId?: string;
        message: string;
      };
    };

type AIResponse = { reply?: string; actions?: AIAction[] };

type Intent =
  | "tasks_overdue"
  | "daily_brief"
  | "followups"
  | "pipeline"
  | "listings"
  | "drafting"
  | "general";

type HydratedFocus = {
  task?: {
    id: string;
    title: string;
    notes: string | null;
    dueAt: Date | null;
    dueAtLabel: string | null;
    dueLabel: string | null;
    dueLabelLong: string | null;
    status: string;
    source: string;
    contact: {
      id: string;
      name: string | null;
      stage: string | null;
      clientRole: string | null;
      relationshipType?: string | null;
      phone?: string | null;
      smsOptedOutAt?: Date | null;
      smsConsentedAt?: Date | null;
    } | null;
    listing: {
      id: string;
      address: string;
      status: string;
      price: number | null;
    } | null;
  };
  contact?: {
    id: string;
    name: string | null;
    email?: string | null;
    phone?: string | null;
    relationshipType?: string | null;
    stage?: string | null;
    clientRole?: string | null;
    label?: string | null;
    notes?: string | null;
    smsConsentedAt?: Date | null;
    smsOptedOutAt?: Date | null;
    isSmsSuppressed?: boolean;
    pins?: Array<{
      id: string;
      pinId: string;
      pinName: string;
      createdAt: Date;
      createdByUserId: string | null;
    }>;
    recentNotes?: Array<{
      text: string;
      reminderAt: Date | null;
      reminderLabel: string | null;
      createdAt: Date;
    }>;
    updatedAt?: Date;
  };
  listing?: {
    id: string;
    address: string;
    status: string;
    price: number | null;
    description?: string | null;
    seller?: { id: string; name: string | null } | null;
    buyers?: Array<{ id: string; name: string | null; role: string | null }>;
    photos?: Array<{ url: string; isCover: boolean }>;
    pins?: Array<{
      id: string;
      pinId: string;
      pinName: string;
      createdAt: Date;
      createdByUserId: string | null;
    }>;
    recentNotes?: Array<{
      id: string;
      text: string;
      reminderAt: Date | null;
      reminderLabel: string | null;
      createdAt: Date;
    }>;
    updatedAt?: Date;
  };
  conversation?: {
    id: string;
    assignedToUserId: string;
    phoneNumberId: string;
    otherPartyE164: string;
    displayName: string | null;
    lastMessageAt: Date | null;
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
    zoraSummary: string | null;
    zoraState: any;
    updatedAt: Date;
    contact: {
      id: string;
      name: string | null;
      phone: string | null;
      relationshipType: string | null;
      stage: string | null;
      clientRole: string | null;
      smsConsentedAt?: Date | null;
      smsOptedOutAt?: Date | null;
      isSmsSuppressed?: boolean;
    } | null;
    listing: {
      id: string;
      address: string;
      status: string;
      price: number | null;
    } | null;
    recentMessages: Array<{
      id: string;
      direction: string;
      body: string;
      status: string | null;
      source: string;
      createdAt: Date;
    }>;
  };
};

function nowISO() {
  return new Date().toISOString();
}

function clampStr(v: unknown, max = 4000) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function sanitizeId(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > 128 ? s.slice(0, 128) : s;
}

function sanitizeDraftMessage(v: unknown, max = 1200) {
  if (typeof v !== "string") return "";
  return v.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function jsonError(status: number, error: string, extra?: Record<string, any>) {
  return NextResponse.json({ error, ...(extra || {}) }, { status });
}

function enforceBudget<T>(items: T[], max: number) {
  if (!Array.isArray(items)) return [];
  return items.length > max ? items.slice(0, max) : items;
}

function serializeConversation(messages: ClientMsg[]) {
  return messages
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");
}

function serializeRecentAssistant(messages: ClientMsg[]) {
  return messages
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .map((m) => m.text)
    .join("\n---\n");
}

function formatName(first?: string | null, last?: string | null) {
  const out = [first, last].filter(Boolean).join(" ").trim();
  return out || null;
}

function formatDateInZone(d: Date | null, zone: string): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return null;
  }
}

function formatDateTimeInZone(d: Date | null, zone: string): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return null;
  }
}

function formatDateLongInZone(d: Date | null, zone: string): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return null;
  }
}

function inferIntent(lastUserText: string): Intent {
  const t = lastUserText.toLowerCase();

  if (/(overdue|past due|late)\b/.test(t)) return "tasks_overdue";
  if (/(today|right now|what should i do|what should i focus on|plan my day)\b/.test(t)) return "daily_brief";
  if (/(follow[-\s]?up|check[-\s]?in|touch base|reach out|who should i follow up with)\b/.test(t)) return "followups";
  if (/(pipeline|stage|hot|warm|new|past)\b/.test(t)) return "pipeline";
  if (/(listing|mls|open house|price|photos?)\b/.test(t)) return "listings";
  if (/(email|sms|text|message|draft|write)\b/.test(t)) return "drafting";
  return "general";
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((x) => [x.id, x])).values());
}

function buildSystemPreamble() {
  return `
You are Zora — the Avillo workspace copilot for real estate operators.

SCOPE:
- Help ONLY with Avillo + real estate workflow using the provided workspace context.
- If the user asks for anything outside Avillo/workflow/real-estate operations, briefly refuse and redirect to an Avillo-relevant next step.

MISSION:
- Convert workspace context into priorities, next actions, summaries, and drafting help.
- Be concise, tactical, accurate, and useful.

TRUTH + GROUNDING:
- Use ONLY the provided context.
- If a fact is missing, say you do not have it.
- Never invent names, IDs, addresses, counts, statuses, dates, times, listings, tasks, conversations, or pipeline facts.
- Do not claim certainty where the context is partial.
- If multiple records could match and the context does not identify one clearly, say you need the user to specify which record.

PRIVACY:
- Tasks are private to the current user. Only discuss tasks included in context.tasks.* or context.focus.task.
- Do not infer or speculate about other users’ work.

TIMEZONE:
- dueAt/reminderAt are absolute instants.
- Always use the provided labels when present:
  - dueAtLabel
  - dueLabel
  - dueLabelLong
  - reminderLabel
- Do not convert raw ISO timestamps yourself.
- Never output UTC times.

ANTI-REDUNDANCY:
- Avoid repeating the same facts already stated in the last 2 assistant messages unless the user asks for a recap.
- Avoid listing the same contact/listing/task twice if it appears in multiple context sections.
- Prioritize net-new information and the single best next step.

DRAFTING:
- Draft email/SMS only when tied to Avillo context.
- Keep drafts natural, concise, and ready for review.
- Do not fabricate names, timelines, availability, outcomes, or prior commitments.
- If SMS is unavailable or disallowed by context, explain why and do not return a draft_sms action.

SMS COMPLIANCE:
- If context indicates sms opt-out or suppression, do not draft a text action.
- If the user wants a text anyway, explain the compliance block and suggest another channel if appropriate.

ACTION CONTRACT:
- Allowed action types: open_contact, open_listing, open_task, draft_sms.
- Only use IDs that are explicitly present in the provided context.
- Never invent IDs.
- Never invent action types.

STYLE:
- Lead with the best next step.
- Plain text only.
- No markdown code blocks.
- No headings syntax.
- No fluff.

OUTPUT:
Return ONLY valid JSON:
{
  "reply": "string",
  "actions"?: Array<{ "type": string, "label"?: string, "id"?: string, "payload"?: any }>
}
`.trim();
}

function buildAllowedActionIds(context: any) {
  const contactIds = new Set<string>();
  const listingIds = new Set<string>();
  const taskIds = new Set<string>();

  const add = (set: Set<string>, value: unknown) => {
    const id = sanitizeId(value);
    if (id) set.add(id);
  };

  if (context?.focus?.contact?.id) add(contactIds, context.focus.contact.id);
  if (context?.focus?.listing?.id) add(listingIds, context.focus.listing.id);
  if (context?.focus?.task?.id) add(taskIds, context.focus.task.id);
  if (context?.focus?.task?.contact?.id) add(contactIds, context.focus.task.contact.id);
  if (context?.focus?.task?.listing?.id) add(listingIds, context.focus.task.listing.id);
  if (context?.focus?.conversation?.contact?.id) add(contactIds, context.focus.conversation.contact.id);
  if (context?.focus?.conversation?.listing?.id) add(listingIds, context.focus.conversation.listing.id);

  for (const p of context?.people?.myRecent || []) add(contactIds, p.id);
  for (const c of context?.followups?.candidates || []) add(contactIds, c.id);
  for (const l of context?.listings?.myRecent || []) add(listingIds, l.id);
  for (const t of context?.tasks?.overdue || []) add(taskIds, t.id);
  for (const t of context?.tasks?.dueToday || []) add(taskIds, t.id);
  for (const t of context?.tasks?.dueThisWeek || []) add(taskIds, t.id);

  return { contactIds, listingIds, taskIds };
}

function narrowContextByIntent(base: any, intent: Intent) {
  const common = {
    meta: base.meta,
    comms: base.comms,
    focus: base.focus,
  };

  switch (intent) {
    case "tasks_overdue":
      return {
        ...common,
        tasks: {
          policy: base.tasks.policy,
          counts: base.tasks.counts,
          overdue: base.tasks.overdue,
          dueToday: base.tasks.dueToday,
        },
      };

    case "daily_brief":
      return {
        ...common,
        tasks: base.tasks,
        followups: {
          candidates: (base.followups?.candidates || []).slice(0, 8),
          notes: base.followups?.notes,
        },
        listings: {
          myRecent: base.listings?.myRecent || [],
          statusCounts: base.listings?.statusCounts || [],
        },
        activity: {
          recentCRM: (base.activity?.recentCRM || []).slice(0, 8),
        },
      };

    case "followups":
      return {
        ...common,
        followups: base.followups,
        activity: {
          recentCRM: (base.activity?.recentCRM || []).slice(0, 8),
        },
      };

    case "pipeline":
      return {
        ...common,
        pipeline: base.pipeline,
        listings: {
          statusCounts: base.listings?.statusCounts || [],
          myRecent: base.listings?.myRecent || [],
        },
        people: {
          myRecent: base.people?.myRecent || [],
        },
        activity: {
          recentCRM: (base.activity?.recentCRM || []).slice(0, 8),
        },
      };

    case "listings":
      return {
        ...common,
        listings: base.listings,
        pipeline: {
          statusCounts: base.listings?.statusCounts || [],
        },
      };

    case "drafting":
      return {
        ...common,
        followups: {
          candidates: (base.followups?.candidates || []).slice(0, 6),
          notes: base.followups?.notes,
        },
      };

    case "general":
    default:
      return {
        ...common,
        tasks: {
          counts: base.tasks?.counts,
          overdue: (base.tasks?.overdue || []).slice(0, 5),
          dueToday: (base.tasks?.dueToday || []).slice(0, 5),
        },
        followups: {
          candidates: (base.followups?.candidates || []).slice(0, 6),
          notes: base.followups?.notes,
        },
        listings: {
          statusCounts: base.listings?.statusCounts || [],
          myRecent: (base.listings?.myRecent || []).slice(0, 5),
        },
        people: {
          myRecent: (base.people?.myRecent || []).slice(0, 5),
        },
      };
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok || !ctx.userId || !ctx.workspaceId) {
      return jsonError(ctx.status || 401, ctx.error?.error || "Unauthorized");
    }

    const body = (await req.json().catch(() => null)) as ChatBody | null;
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body.");
    }

    const rawMessages = body.messages;
    const page = typeof body.page === "string" ? body.page : undefined;
    const pageContextRaw =
      body.pageContext && typeof body.pageContext === "object" ? body.pageContext : undefined;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return jsonError(400, "Missing messages.");
    }

    const messages: ClientMsg[] = rawMessages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
      .map((m) => ({ role: m.role, text: clampStr(m.text, 3000) }))
      .filter((m) => m.text.length > 0);

    if (!messages.length) {
      return jsonError(400, "Missing messages.");
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text || "";
    const intent = inferIntent(lastUser);

    const wsId = ctx.workspaceId;
    const userId = ctx.userId;

    const vctx: VisibilityCtx = {
      workspaceId: wsId,
      userId,
      isWorkspaceAdmin: false,
    };

    const browserTZ = safeIanaTZ(body.tz);
    const { zone, todayStart, tomorrowStart, in7Start } = dayBoundsForTZ(browserTZ);

    const pageContext: PageContext = {
      contactId: sanitizeId(pageContextRaw?.contactId) ?? undefined,
      listingId: sanitizeId(pageContextRaw?.listingId) ?? undefined,
      taskId: sanitizeId(pageContextRaw?.taskId) ?? undefined,
      conversationId: sanitizeId(pageContextRaw?.conversationId) ?? undefined,
      tab: typeof pageContextRaw?.tab === "string" ? clampStr(pageContextRaw.tab, 64) : undefined,
      filters: pageContextRaw?.filters ?? undefined,
    };

    const taskWhereMe = {
      workspaceId: wsId,
      deletedAt: null as Date | null,
      assignedToUserId: userId,
    };

    const myActivePhoneNumber = await prisma.userPhoneNumber.findFirst({
      where: {
        workspaceId: wsId,
        assignedToUserId: userId,
        status: "ACTIVE",
        capabilities: { has: "SMS" },
      },
      select: {
        id: true,
        e164: true,
        status: true,
        label: true,
      },
    });

    const [
      taskCountsByStatus,
      overdueTasks,
      dueTodayTasks,
      dueWeekTasks,
      contactStageCounts,
      listingCounts,
      recentCrmForMe,
      myRecentContacts,
      myRecentListings,
      workspacePins,
    ] = await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: taskWhereMe,
        _count: { _all: true },
      }),

      prisma.task.findMany({
        where: { ...taskWhereMe, status: "OPEN", dueAt: { lt: todayStart } },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          dueAt: true,
          source: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              relationshipType: true,
              stage: true,
              clientRole: true,
              phone: true,
              smsConsentedAt: true,
              smsOptedOutAt: true,
            },
          },
          listing: { select: { id: true, address: true, status: true } },
        },
      }),

      prisma.task.findMany({
        where: { ...taskWhereMe, status: "OPEN", dueAt: { gte: todayStart, lt: tomorrowStart } },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          dueAt: true,
          source: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              relationshipType: true,
              stage: true,
              clientRole: true,
              phone: true,
              smsConsentedAt: true,
              smsOptedOutAt: true,
            },
          },
          listing: { select: { id: true, address: true, status: true } },
        },
      }),

      prisma.task.findMany({
        where: { ...taskWhereMe, status: "OPEN", dueAt: { gte: tomorrowStart, lt: in7Start } },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          dueAt: true,
          source: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              relationshipType: true,
              stage: true,
              clientRole: true,
              phone: true,
              smsConsentedAt: true,
              smsOptedOutAt: true,
            },
          },
          listing: { select: { id: true, address: true, status: true } },
        },
      }),

      prisma.contact.groupBy({
        by: ["relationshipType", "stage"],
        where: whereReadableContact(vctx),
        _count: { _all: true },
      }),

      prisma.listing.groupBy({
        by: ["status"],
        where: whereReadableListing(vctx),
        _count: { _all: true },
      }),

      prisma.cRMActivity.findMany({
        where: {
          ...whereReadableCRMActivity(vctx),
          actorUserId: userId,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          type: true,
          summary: true,
          createdAt: true,
          contactId: true,
          contact: { select: { firstName: true, lastName: true } },
        },
      }),

      prisma.contact.findMany({
        where: {
          ...whereReadableContact(vctx),
          ownerUserId: userId,
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          relationshipType: true,
          stage: true,
          clientRole: true,
          phone: true,
          smsConsentedAt: true,
          smsOptedOutAt: true,
          updatedAt: true,
        },
      }),

      prisma.listing.findMany({
        where: {
          ...whereReadableListing(vctx),
          ownerUserId: userId,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          address: true,
          status: true,
          price: true,
          updatedAt: true,
        },
      }),

      prisma.pin.findMany({
        where: whereReadablePin(vctx),
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          nameKey: true,
          updatedAt: true,
          _count: { select: { contactPins: true, listingPins: true } },
        },
      }),
    ]);

    const openCount = taskCountsByStatus.find((x) => x.status === "OPEN")?._count?._all ?? 0;
    const doneCount = taskCountsByStatus.find((x) => x.status === "DONE")?._count?._all ?? 0;

    const neverTouched = await prisma.contact.findMany({
      where: {
        ...whereReadableContact(vctx),
        ownerUserId: userId,
        crmActivity: { none: { actorUserId: userId } },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        relationshipType: true,
        stage: true,
        clientRole: true,
        phone: true,
        smsConsentedAt: true,
        smsOptedOutAt: true,
        updatedAt: true,
      },
    });

    const candidateContacts = dedupeById([
      ...neverTouched.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        relationshipType: c.relationshipType,
        stage: c.stage,
        clientRole: c.clientRole,
        phone: c.phone,
        smsConsentedAt: c.smsConsentedAt,
        smsOptedOutAt: c.smsOptedOutAt,
        updatedAt: c.updatedAt,
        reason: "never_touched" as const,
      })),
      ...myRecentContacts.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        relationshipType: c.relationshipType,
        stage: c.stage,
        clientRole: c.clientRole,
        phone: c.phone,
        smsConsentedAt: c.smsConsentedAt,
        smsOptedOutAt: c.smsOptedOutAt,
        updatedAt: c.updatedAt,
        reason: "recent_contact" as const,
      })),
    ]);

    const candidateContactIds = candidateContacts.map((c) => c.id);

    const [lastCrmTouch, lastSmsTouch, lastCallTouch, suppressedPhones] = await Promise.all([
      candidateContactIds.length
        ? prisma.cRMActivity.groupBy({
            by: ["contactId"],
            where: {
              ...whereReadableCRMActivity(vctx),
              actorUserId: userId,
              contactId: { in: candidateContactIds },
            },
            _max: { createdAt: true },
          })
        : Promise.resolve([]),

      candidateContactIds.length
        ? prisma.smsMessage.groupBy({
            by: ["contactId"],
            where: {
              workspaceId: wsId,
              assignedToUserId: userId,
              contactId: { in: candidateContactIds },
            },
            _max: { createdAt: true },
          })
        : Promise.resolve([]),

      candidateContactIds.length
        ? prisma.call.groupBy({
            by: ["contactId"],
            where: {
              workspaceId: wsId,
              assignedToUserId: userId,
              contactId: { in: candidateContactIds },
            },
            _max: { createdAt: true },
          })
        : Promise.resolve([]),

      candidateContacts
        .map((c) => c.phone)
        .filter((v): v is string => !!v)
        .length
        ? prisma.smsSuppression.findMany({
            where: {
              workspaceId: wsId,
              phone: { in: candidateContacts.map((c) => c.phone).filter((v): v is string => !!v) },
            },
            select: { phone: true },
          })
        : Promise.resolve([]),
    ]);

    const suppressedPhoneSet = new Set(suppressedPhones.map((x) => x.phone));

    const touchMap = new Map<string, Date | null>();
    const touchSourceMap = new Map<string, string[]>();

    for (const row of lastCrmTouch) {
      if (!row.contactId) continue;
      const dt = row._max.createdAt ?? null;
      if (!dt) continue;
      const prev = touchMap.get(row.contactId);
      if (!prev || dt > prev) touchMap.set(row.contactId, dt);
      touchSourceMap.set(row.contactId, [...(touchSourceMap.get(row.contactId) || []), "crm"]);
    }

    for (const row of lastSmsTouch) {
      if (!row.contactId) continue;
      const dt = row._max.createdAt ?? null;
      if (!dt) continue;
      const prev = touchMap.get(row.contactId);
      if (!prev || dt > prev) touchMap.set(row.contactId, dt);
      touchSourceMap.set(row.contactId, [...(touchSourceMap.get(row.contactId) || []), "sms"]);
    }

    for (const row of lastCallTouch) {
      if (!row.contactId) continue;
      const dt = row._max.createdAt ?? null;
      if (!dt) continue;
      const prev = touchMap.get(row.contactId);
      if (!prev || dt > prev) touchMap.set(row.contactId, dt);
      touchSourceMap.set(row.contactId, [...(touchSourceMap.get(row.contactId) || []), "call"]);
    }

    const followups = candidateContacts
      .map((c) => {
        const lastTouchAt = touchMap.get(c.id) ?? null;
        const daysSinceTouch = lastTouchAt
          ? Math.floor((Date.now() - new Date(lastTouchAt).getTime()) / 86400000)
          : null;

        const isSmsSuppressed = !!(c.phone && suppressedPhoneSet.has(c.phone));
        const reason =
          c.reason === "never_touched"
            ? "never_touched"
            : !lastTouchAt
              ? "no_recorded_touch"
              : daysSinceTouch !== null && daysSinceTouch >= 14
                ? "stale_touch"
                : "recently_updated";

        const score =
          (reason === "never_touched" ? 100 : 0) +
          (reason === "no_recorded_touch" ? 80 : 0) +
          (reason === "stale_touch" ? 60 : 0) +
          ((c.stage === "HOT" ? 25 : c.stage === "WARM" ? 10 : 0) || 0) +
          ((c.clientRole === "BUYER" || c.clientRole === "SELLER" || c.clientRole === "BOTH" ? 8 : 0) || 0);

        return {
          id: c.id,
          name: formatName(c.firstName, c.lastName),
          relationshipType: c.relationshipType,
          stage: c.stage,
          clientRole: c.clientRole,
          phone: c.phone ?? null,
          smsConsentedAt: c.smsConsentedAt ?? null,
          smsOptedOutAt: c.smsOptedOutAt ?? null,
          isSmsSuppressed,
          lastTouchAt,
          updatedAt: c.updatedAt,
          daysSinceTouch,
          touchSources: Array.from(new Set(touchSourceMap.get(c.id) || [])),
          reason,
          score,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const aT = a.lastTouchAt ? new Date(a.lastTouchAt).getTime() : 0;
        const bT = b.lastTouchAt ? new Date(b.lastTouchAt).getTime() : 0;
        if (aT !== bT) return aT - bT;

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 12);

    const focus: HydratedFocus = {};

    if (pageContext.taskId) {
      const task = await prisma.task.findFirst({
        where: {
          id: pageContext.taskId,
          workspaceId: wsId,
          assignedToUserId: userId,
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          notes: true,
          dueAt: true,
          status: true,
          source: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              relationshipType: true,
              stage: true,
              clientRole: true,
              phone: true,
              smsConsentedAt: true,
              smsOptedOutAt: true,
            },
          },
          listing: {
            select: {
              id: true,
              address: true,
              status: true,
              price: true,
            },
          },
        },
      });

      if (task) {
        let isSmsSuppressed = false;
        if (task.contact?.phone) {
          const suppression = await prisma.smsSuppression.findFirst({
            where: { workspaceId: wsId, phone: task.contact.phone },
            select: { id: true },
          });
          isSmsSuppressed = !!suppression;
        }

        focus.task = {
          id: task.id,
          title: task.title,
          notes: task.notes ?? null,
          dueAt: task.dueAt ?? null,
          dueAtLabel: formatDateTimeInZone(task.dueAt ?? null, zone),
          dueLabel: formatDateInZone(task.dueAt ?? null, zone),
          dueLabelLong: formatDateLongInZone(task.dueAt ?? null, zone),
          status: task.status,
          source: task.source,
          contact: task.contact
            ? {
                id: task.contact.id,
                name: formatName(task.contact.firstName, task.contact.lastName),
                relationshipType: task.contact.relationshipType,
                stage: task.contact.stage,
                clientRole: task.contact.clientRole,
                phone: task.contact.phone ?? null,
                smsConsentedAt: task.contact.smsConsentedAt ?? null,
                smsOptedOutAt: task.contact.smsOptedOutAt ?? null,
              }
            : null,
          listing: task.listing
            ? {
                id: task.listing.id,
                address: task.listing.address,
                status: task.listing.status,
                price: task.listing.price ?? null,
              }
            : null,
        };

        if (focus.task.contact) {
          focus.task.contact.smsOptedOutAt = task.contact?.smsOptedOutAt ?? null;
          focus.task.contact.smsConsentedAt = task.contact?.smsConsentedAt ?? null;
        }

        if (!focus.contact && task.contact) {
          focus.contact = {
            id: task.contact.id,
            name: formatName(task.contact.firstName, task.contact.lastName),
            phone: task.contact.phone ?? null,
            relationshipType: task.contact.relationshipType,
            stage: task.contact.stage,
            clientRole: task.contact.clientRole,
            smsConsentedAt: task.contact.smsConsentedAt ?? null,
            smsOptedOutAt: task.contact.smsOptedOutAt ?? null,
            isSmsSuppressed,
          };
        }

        if (!focus.listing && task.listing) {
          focus.listing = {
            id: task.listing.id,
            address: task.listing.address,
            status: task.listing.status,
            price: task.listing.price ?? null,
          };
        }
      }
    }

    if (pageContext.contactId) {
      const c = await prisma.contact.findFirst({
        where: { id: pageContext.contactId, ...whereReadableContact(vctx) },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          relationshipType: true,
          stage: true,
          clientRole: true,
          label: true,
          notes: true,
          updatedAt: true,
          smsConsentedAt: true,
          smsOptedOutAt: true,
          contactNotes: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { text: true, reminderAt: true, createdAt: true },
          },
          pins: {
            orderBy: { createdAt: "desc" },
            take: 12,
            select: {
              id: true,
              createdAt: true,
              createdByUserId: true,
              pin: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (c) {
        const suppression = c.phone
          ? await prisma.smsSuppression.findFirst({
              where: { workspaceId: wsId, phone: c.phone },
              select: { id: true },
            })
          : null;

        focus.contact = {
          id: c.id,
          name: formatName(c.firstName, c.lastName),
          email: c.email ?? null,
          phone: c.phone ?? null,
          relationshipType: c.relationshipType,
          stage: c.stage,
          clientRole: c.clientRole,
          label: c.label ?? null,
          notes: c.notes ?? null,
          smsConsentedAt: c.smsConsentedAt ?? null,
          smsOptedOutAt: c.smsOptedOutAt ?? null,
          isSmsSuppressed: !!suppression,
          pins: c.pins.map((cp) => ({
            id: cp.id,
            pinId: cp.pin.id,
            pinName: cp.pin.name,
            createdAt: cp.createdAt,
            createdByUserId: cp.createdByUserId ?? null,
          })),
          recentNotes: c.contactNotes.map((n) => ({
            text: n.text,
            reminderAt: n.reminderAt ?? null,
            reminderLabel: formatDateLongInZone(n.reminderAt ?? null, zone),
            createdAt: n.createdAt,
          })),
          updatedAt: c.updatedAt,
        };
      }
    }

    if (pageContext.listingId) {
      const l = await prisma.listing.findFirst({
        where: { id: pageContext.listingId, ...whereReadableListing(vctx) },
        select: {
          id: true,
          address: true,
          status: true,
          price: true,
          description: true,
          updatedAt: true,
          seller: { select: { id: true, firstName: true, lastName: true } },
          buyers: {
            take: 10,
            select: { contact: { select: { id: true, firstName: true, lastName: true } }, role: true },
          },
          photos: { take: 6, orderBy: { sortOrder: "asc" }, select: { url: true, isCover: true } },
          pins: {
            orderBy: { createdAt: "desc" },
            take: 12,
            select: {
              id: true,
              createdAt: true,
              createdByUserId: true,
              pin: { select: { id: true, name: true } },
            },
          },
          listingNotes: {
            orderBy: { createdAt: "desc" },
            take: 8,
            select: { id: true, text: true, reminderAt: true, createdAt: true },
          },
        },
      });

      if (l) {
        focus.listing = {
          id: l.id,
          address: l.address,
          status: l.status,
          price: l.price ?? null,
          description: l.description ?? null,
          seller: l.seller
            ? { id: l.seller.id, name: formatName(l.seller.firstName, l.seller.lastName) }
            : null,
          buyers: l.buyers.map((b) => ({
            id: b.contact.id,
            name: formatName(b.contact.firstName, b.contact.lastName),
            role: b.role ?? null,
          })),
          photos: l.photos.map((p) => ({ url: p.url, isCover: p.isCover })),
          pins: l.pins.map((lp) => ({
            id: lp.id,
            pinId: lp.pin.id,
            pinName: lp.pin.name,
            createdAt: lp.createdAt,
            createdByUserId: lp.createdByUserId ?? null,
          })),
          recentNotes: l.listingNotes.map((n) => ({
            id: n.id,
            text: n.text,
            reminderAt: n.reminderAt ?? null,
            reminderLabel: formatDateLongInZone(n.reminderAt ?? null, zone),
            createdAt: n.createdAt,
          })),
          updatedAt: l.updatedAt,
        };
      }
    }

    if (pageContext.conversationId) {
      const convo = await prisma.conversation.findFirst({
        where: {
          id: pageContext.conversationId,
          workspaceId: wsId,
          assignedToUserId: userId,
        },
        select: {
          id: true,
          assignedToUserId: true,
          phoneNumberId: true,
          otherPartyE164: true,
          displayName: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          zoraSummary: true,
          zoraState: true,
          updatedAt: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              relationshipType: true,
              stage: true,
              clientRole: true,
              smsConsentedAt: true,
              smsOptedOutAt: true,
            },
          },
          listing: {
            select: {
              id: true,
              address: true,
              status: true,
              price: true,
            },
          },
          smsMessages: {
            where: {
              workspaceId: wsId,
              assignedToUserId: userId,
            },
            orderBy: { createdAt: "desc" },
            take: 12,
            select: {
              id: true,
              direction: true,
              body: true,
              status: true,
              source: true,
              createdAt: true,
            },
          },
        },
      });

      if (convo) {
        const suppression =
          convo.contact?.phone
            ? await prisma.smsSuppression.findFirst({
                where: { workspaceId: wsId, phone: convo.contact.phone },
                select: { id: true },
              })
            : null;

        focus.conversation = {
          id: convo.id,
          assignedToUserId: convo.assignedToUserId,
          phoneNumberId: convo.phoneNumberId,
          otherPartyE164: convo.otherPartyE164,
          displayName: convo.displayName ?? null,
          lastMessageAt: convo.lastMessageAt ?? null,
          lastInboundAt: convo.lastInboundAt ?? null,
          lastOutboundAt: convo.lastOutboundAt ?? null,
          zoraSummary: convo.zoraSummary ?? null,
          zoraState: convo.zoraState ?? null,
          updatedAt: convo.updatedAt,
          contact: convo.contact
            ? {
                id: convo.contact.id,
                name: formatName(convo.contact.firstName, convo.contact.lastName),
                phone: convo.contact.phone ?? null,
                relationshipType: convo.contact.relationshipType,
                stage: convo.contact.stage,
                clientRole: convo.contact.clientRole,
                smsConsentedAt: convo.contact.smsConsentedAt ?? null,
                smsOptedOutAt: convo.contact.smsOptedOutAt ?? null,
                isSmsSuppressed: !!suppression,
              }
            : null,
          listing: convo.listing
            ? {
                id: convo.listing.id,
                address: convo.listing.address,
                status: convo.listing.status,
                price: convo.listing.price ?? null,
              }
            : null,
          recentMessages: convo.smsMessages
            .slice()
            .reverse()
            .map((m) => ({
              id: m.id,
              direction: m.direction,
              body: m.body,
              status: m.status ?? null,
              source: m.source,
              createdAt: m.createdAt,
            })),
        };

        if (!focus.contact && convo.contact) {
          focus.contact = {
            id: convo.contact.id,
            name: formatName(convo.contact.firstName, convo.contact.lastName),
            phone: convo.contact.phone ?? null,
            relationshipType: convo.contact.relationshipType,
            stage: convo.contact.stage,
            clientRole: convo.contact.clientRole,
            smsConsentedAt: convo.contact.smsConsentedAt ?? null,
            smsOptedOutAt: convo.contact.smsOptedOutAt ?? null,
            isSmsSuppressed: !!suppression,
          };
        }

        if (!focus.listing && convo.listing) {
          focus.listing = {
            id: convo.listing.id,
            address: convo.listing.address,
            status: convo.listing.status,
            price: convo.listing.price ?? null,
          };
        }
      }
    }

    const contextBase = {
      meta: {
        now: nowISO(),
        page: page || null,
        pageContext,
        intent,
        userId,
        workspaceId: wsId,
        workspaceRole: ctx.workspaceRole,
        workspace: ctx.workspace,
        time: {
          zone,
          todayStart: todayStart.toISOString(),
          tomorrowStart: tomorrowStart.toISOString(),
          in7Start: in7Start.toISOString(),
          browserTz: browserTZ,
        },
      },

      comms: {
        canText: !!myActivePhoneNumber,
        myPhoneNumber: myActivePhoneNumber
          ? {
              id: myActivePhoneNumber.id,
              e164: myActivePhoneNumber.e164,
              status: myActivePhoneNumber.status,
              label: myActivePhoneNumber.label ?? null,
            }
          : null,
      },

      focus: Object.keys(focus).length ? focus : null,

      pins: {
        workspaceRecent: enforceBudget(
          workspacePins.map((p) => ({
            id: p.id,
            name: p.name,
            usage: {
              contacts: p._count.contactPins,
              listings: p._count.listingPins,
            },
            updatedAt: p.updatedAt,
          })),
          20
        ),
      },

      tasks: {
        policy: "PRIVATE_TO_CURRENT_USER",
        counts: { open: openCount, done: doneCount },
        overdue: enforceBudget(
          overdueTasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueAt: t.dueAt ?? null,
            dueAtLabel: formatDateTimeInZone(t.dueAt ?? null, zone),
            dueLabel: formatDateInZone(t.dueAt ?? null, zone),
            dueLabelLong: formatDateLongInZone(t.dueAt ?? null, zone),
            source: t.source,
            contact: t.contact
              ? {
                  id: t.contact.id,
                  name: formatName(t.contact.firstName, t.contact.lastName),
                  relationshipType: t.contact.relationshipType,
                  stage: t.contact.stage,
                  clientRole: t.contact.clientRole,
                  phone: t.contact.phone ?? null,
                  smsConsentedAt: t.contact.smsConsentedAt ?? null,
                  smsOptedOutAt: t.contact.smsOptedOutAt ?? null,
                }
              : null,
            listing: t.listing
              ? {
                  id: t.listing.id,
                  address: t.listing.address,
                  status: t.listing.status,
                }
              : null,
          })),
          8
        ),
        dueToday: enforceBudget(
          dueTodayTasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueAt: t.dueAt ?? null,
            dueAtLabel: formatDateTimeInZone(t.dueAt ?? null, zone),
            dueLabel: formatDateInZone(t.dueAt ?? null, zone),
            dueLabelLong: formatDateLongInZone(t.dueAt ?? null, zone),
            source: t.source,
            contact: t.contact
              ? {
                  id: t.contact.id,
                  name: formatName(t.contact.firstName, t.contact.lastName),
                  relationshipType: t.contact.relationshipType,
                  stage: t.contact.stage,
                  clientRole: t.contact.clientRole,
                  phone: t.contact.phone ?? null,
                  smsConsentedAt: t.contact.smsConsentedAt ?? null,
                  smsOptedOutAt: t.contact.smsOptedOutAt ?? null,
                }
              : null,
            listing: t.listing
              ? {
                  id: t.listing.id,
                  address: t.listing.address,
                  status: t.listing.status,
                }
              : null,
          })),
          8
        ),
        dueThisWeek: enforceBudget(
          dueWeekTasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueAt: t.dueAt ?? null,
            dueAtLabel: formatDateTimeInZone(t.dueAt ?? null, zone),
            dueLabel: formatDateInZone(t.dueAt ?? null, zone),
            dueLabelLong: formatDateLongInZone(t.dueAt ?? null, zone),
            source: t.source,
            contact: t.contact
              ? {
                  id: t.contact.id,
                  name: formatName(t.contact.firstName, t.contact.lastName),
                  relationshipType: t.contact.relationshipType,
                  stage: t.contact.stage,
                  clientRole: t.contact.clientRole,
                  phone: t.contact.phone ?? null,
                  smsConsentedAt: t.contact.smsConsentedAt ?? null,
                  smsOptedOutAt: t.contact.smsOptedOutAt ?? null,
                }
              : null,
            listing: t.listing
              ? {
                  id: t.listing.id,
                  address: t.listing.address,
                  status: t.listing.status,
                }
              : null,
          })),
          8
        ),
      },

      followups: {
        candidates: followups.map((c) => ({
          id: c.id,
          name: c.name,
          relationshipType: c.relationshipType,
          stage: c.stage,
          clientRole: c.clientRole,
          phone: c.phone,
          smsConsentedAt: c.smsConsentedAt,
          smsOptedOutAt: c.smsOptedOutAt,
          isSmsSuppressed: c.isSmsSuppressed,
          lastTouchAt: c.lastTouchAt ? new Date(c.lastTouchAt).toISOString() : null,
          updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
          daysSinceTouch: c.daysSinceTouch,
          touchSources: c.touchSources,
          reason: c.reason,
          score: c.score,
        })),
        notes:
          "These are my owned contacts prioritized for follow-up using my recent contacts plus never-touched contacts, ranked by last touch, stage, and recency.",
      },

      pipeline: {
        contactStageCounts: contactStageCounts.map((r) => ({
          relationshipType: r.relationshipType,
          stage: r.stage,
          count: r._count._all,
        })),
      },

      listings: {
        statusCounts: listingCounts.map((r) => ({ status: r.status, count: r._count._all })),
        myRecent: enforceBudget(
          myRecentListings.map((l) => ({
            id: l.id,
            address: l.address,
            status: l.status,
            price: l.price,
            updatedAt: l.updatedAt,
          })),
          8
        ),
      },

      people: {
        myRecent: enforceBudget(
          myRecentContacts.map((c) => ({
            id: c.id,
            name: formatName(c.firstName, c.lastName),
            relationshipType: c.relationshipType,
            stage: c.stage,
            clientRole: c.clientRole,
            phone: c.phone ?? null,
            smsConsentedAt: c.smsConsentedAt ?? null,
            smsOptedOutAt: c.smsOptedOutAt ?? null,
            updatedAt: c.updatedAt,
          })),
          8
        ),
      },

      activity: {
        recentCRM: enforceBudget(
          recentCrmForMe.map((a) => ({
            type: a.type,
            summary: a.summary,
            createdAt: a.createdAt,
            contactId: a.contactId ?? null,
            contactName: a.contact ? formatName(a.contact.firstName, a.contact.lastName) : null,
          })),
          12
        ),
      },
    };

    const context = narrowContextByIntent(contextBase, intent);
    const allowedIds = buildAllowedActionIds(contextBase);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPreamble() },
        {
          role: "user",
          content: [
            "WORKSPACE CONTEXT (authoritative):",
            JSON.stringify(context, null, 2),
            "",
            "RECENT ASSISTANT OUTPUTS (avoid repeating unless needed):",
            serializeRecentAssistant(messages) || "(none)",
            "",
            "CONVERSATION (last messages):",
            serializeConversation(messages),
            "",
            "Return JSON only: { reply, optional actions }.",
          ].join("\n"),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";

    let parsed: AIResponse;
    try {
      parsed = JSON.parse(raw) as AIResponse;
    } catch {
      return jsonError(502, "AI returned invalid JSON.", { rawSnippet: raw.slice(0, 500) });
    }

    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : null;

    if (!reply) {
      return jsonError(502, "AI returned empty reply.", { rawSnippet: raw.slice(0, 500) });
    }

    const allowedActionTypes = new Set(["open_contact", "open_listing", "open_task", "draft_sms"]);

    const canDraftSms =
      !!myActivePhoneNumber &&
      !contextBase?.focus?.contact?.smsOptedOutAt &&
      !contextBase?.focus?.contact?.isSmsSuppressed &&
      !contextBase?.focus?.conversation?.contact?.smsOptedOutAt &&
      !contextBase?.focus?.conversation?.contact?.isSmsSuppressed;

    const actions =
      Array.isArray(parsed.actions) && parsed.actions.length
        ? parsed.actions
            .filter((a) => a && typeof a.type === "string" && allowedActionTypes.has(a.type))
            .map((a) => {
              if (a.type === "open_contact") {
                const id = sanitizeId(a.id);
                if (!id || !allowedIds.contactIds.has(id)) return null;
                return {
                  type: "open_contact" as const,
                  id,
                  ...(typeof a.label === "string" ? { label: clampStr(a.label, 80) } : {}),
                };
              }

              if (a.type === "open_listing") {
                const id = sanitizeId(a.id);
                if (!id || !allowedIds.listingIds.has(id)) return null;
                return {
                  type: "open_listing" as const,
                  id,
                  ...(typeof a.label === "string" ? { label: clampStr(a.label, 80) } : {}),
                };
              }

              if (a.type === "open_task") {
                const id = sanitizeId(a.id);
                if (!id || !allowedIds.taskIds.has(id)) return null;
                return {
                  type: "open_task" as const,
                  id,
                  ...(typeof a.label === "string" ? { label: clampStr(a.label, 80) } : {}),
                };
              }

              if (a.type === "draft_sms") {
                const payload = a.payload && typeof a.payload === "object" ? a.payload : null;
                const contactId = sanitizeId(payload?.contactId);
                const conversationId = sanitizeId(payload?.conversationId);
                const message = sanitizeDraftMessage(payload?.message);

                if (!contactId || !message || !canDraftSms) return null;
                if (!allowedIds.contactIds.has(contactId)) return null;

                const focusedConversationId =
                  contextBase?.focus?.conversation?.id &&
                  typeof contextBase.focus.conversation.id === "string"
                    ? contextBase.focus.conversation.id
                    : null;

                const focusedConversationContactId =
                  contextBase?.focus?.conversation?.contact?.id &&
                  typeof contextBase.focus.conversation.contact.id === "string"
                    ? contextBase.focus.conversation.contact.id
                    : null;

                if (focusedConversationId) {
                  if (!conversationId || conversationId !== focusedConversationId) return null;
                }

                if (focusedConversationContactId && contactId !== focusedConversationContactId) {
                  return null;
                }

                return {
                  type: "draft_sms" as const,
                  label: typeof a.label === "string" ? clampStr(a.label, 80) : "Draft text",
                  payload: {
                    contactId,
                    ...(conversationId ? { conversationId } : {}),
                    message,
                  },
                };
              }

              return null;
            })
            .filter(Boolean)
            .slice(0, 6)
        : undefined;

    return NextResponse.json(actions ? { reply, actions } : { reply });
  } catch (err: any) {
    console.error("Error in /api/ai/chat:", err);
    return jsonError(500, err?.message || "Unexpected server error.");
  }
}