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
  tz?: string; // browser IANA tz, e.g. "America/Los_Angeles"
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

/* ------------------------------------
 * Utilities
 * -----------------------------------*/

function nowISO() {
  // This is an absolute instant (UTC). Day boundaries are derived via dayBoundsForTZ().
  return new Date().toISOString();
}

function clampStr(v: unknown, max = 4000) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function serializeConversation(messages: ClientMsg[]) {
  return messages
    .slice(-12)
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");
}

function formatName(first?: string | null, last?: string | null) {
  const out = [first, last].filter(Boolean).join(" ").trim();
  return out || null;
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

/**
 * Intent inference (bias only)
 */
function inferIntent(lastUserText: string) {
  const t = lastUserText.toLowerCase();

  if (/(overdue|past due|late)\b/.test(t)) return "tasks_overdue";
  if (/(today|right now|what should i do|plan)\b/.test(t)) return "daily_brief";
  if (/(follow[-\s]?up|check[-\s]?in|touch base|reach out)\b/.test(t)) return "followups";
  if (/(pipeline|stage|hot|warm|new|past)\b/.test(t)) return "pipeline";
  if (/(listing|mls|open house|price|photos?)\b/.test(t)) return "listings";
  if (/(email|sms|text|message|draft|write)\b/.test(t)) return "drafting";
  return "general";
}

/**
 * Conservative fuzzy helpers (v1)
 */
function extractQuotedOrAfterKeywords(text: string) {
  const out: { contact?: string; listing?: string; task?: string } = {};
  const lower = text.toLowerCase();

  const quoteMatch = text.match(/"([^"]{2,80})"/);
  const quoted = quoteMatch?.[1]?.trim();

  const pickAfter = (k: string) => {
    const idx = lower.indexOf(k);
    if (idx === -1) return null;
    const slice = text.slice(idx + k.length).trim();
    if (!slice) return null;
    const line = slice.split("\n")[0]?.trim() || "";
    return line.replace(/^[:\-–—]\s*/, "").slice(0, 80).trim() || null;
  };

  const contactHint = pickAfter("contact") || pickAfter("person");
  const listingHint = pickAfter("listing") || pickAfter("address");
  const taskHint = pickAfter("task");

  if (contactHint) out.contact = contactHint;
  if (listingHint) out.listing = listingHint;
  if (taskHint) out.task = taskHint;

  if (!out.contact && !out.listing && !out.task && quoted) out.contact = quoted;
  return out;
}

/**
 * Context budget
 */
function enforceBudget<T>(items: T[], max: number) {
  if (!Array.isArray(items)) return [];
  return items.length > max ? items.slice(0, max) : items;
}

/**
 * ✅ Deterministic date labels in a specific IANA zone (prevents UTC-vs-local drift)
 * We intentionally format on the server so the model never "infers" calendar dates from UTC instants.
 */
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

/**
 * ✅ Deterministic datetime label (matches Tasks UI more closely)
 * Example: "Jan 30, 2026, 2:00 PM"
 */
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

function buildSystemPreamble() {
  return `
You are Avillo AI — the Avillo workspace copilot for real estate operators.

SCOPE (AVILLO-ONLY):
- Help ONLY with Avillo + real estate workflow using the provided workspace context (tasks, contacts/people, listings, follow-ups, pipeline, activity, and drafting business messages).
- If the user asks anything unrelated (general knowledge, schoolwork, coding unrelated to Avillo, personal advice, entertainment), refuse and redirect to an Avillo-relevant next step.
- If partially related, answer only the Avillo/workflow portion and ask a clarifying question to connect it to Avillo context.

MISSION:
- Convert workspace context into clear next actions, prioritization, and execution help.
- Be concise, tactical, and operator-oriented.

TRUTH + PRIVACY (NON-NEGOTIABLE):
- Use ONLY the context included in this request. If it’s not in context, say you don’t have it.
- Never invent counts, names, addresses, statuses, dates/times, or task items.
- TASK PRIVACY: Tasks are private to the current user. Only discuss tasks provided under context.tasks.* (already filtered to assigned to the current user).
- If asked about other users’ tasks/team workload, explain you can only see the user’s own tasks.
- If required information is missing or unclear, say you don’t have enough context and ask 2–4 specific questions.

WORKSPACE VISIBILITY:
- Contacts and listings are workspace-visible within the current workspace.
- Still: do not invent data; only use what’s in context.

TIMEZONE (CRITICAL):
- dueAt/reminderAt are absolute instants (UTC).
- When speaking about dates/times, ALWAYS use the provided labels:
  - task.dueAtLabel (preferred; includes local time)
  - task.dueLabel / task.dueLabelLong (date-only fallbacks)
  - note.reminderLabel
- Do NOT infer local dates/times from ISO timestamps.
- Never output UTC times (e.g., "22:00 UTC").

COMPLIANCE (FAIR HOUSING / NAR):
- Do NOT reference, target, prefer, exclude, or imply ANY protected class or demographic group.
- Do NOT say who a home/neighborhood is "perfect for" based on demographic groups.
- Avoid crime/safety claims; redirect to official resources if needed.
- Avoid school quality rankings/superlatives; keep school mentions neutral and suggest verification.

DRAFTING (EMAIL/SMS):
- You may draft emails/texts ONLY when tied to Avillo context (a contact, conversation, listing, task, follow-up, or workflow described by the user).
- For SMS, prefer focus.conversation and focus.contact when available.
- Use recent conversation context when provided so the message feels like a natural continuation of the thread.
- Keep SMS concise, natural, and ready to send.
- Do not fabricate names, details, timelines, or outcomes.
- If key details are missing, ask concise follow-up questions instead of inventing them.

SMS ACTION CONTRACT:
- If the user asks you to write, draft, or suggest a text message, you may return an action:
  {
    "type": "draft_sms",
    "label": "Draft text",
    "payload": {
      "contactId": "contact id",
      "conversationId": "conversation id if available",
      "message": "draft text body"
    }
  }
- Only return draft_sms if a valid contactId is available in the provided context.
- If you can suggest SMS wording but no valid contactId is available, reply with the suggested draft in plain text only and do not return an action.
- Never return draft_sms with an empty or placeholder message.
- Do NOT send messages yourself. Only draft them for the user to review and edit before sending.
- Never ask the user whether you should send a message.
- Never say or imply that you can send, deliver, or text on the user's behalf in this chat flow.
- When drafting SMS, present it as a draft for the user to review, edit, or place into the composer.
- Prefer phrases like "Here’s a draft", "I drafted this for you", or "You can edit this before sending."
- Do not use phrases like "Should I send it?", "Want me to send this?", or "I can send this now."
- If context.comms.canText is false, explain that texting is unavailable and do not return draft_sms.

ACTIONS:
- Only include actions when they map to Avillo UI behavior and are supported by provided IDs/context.
- Allowed action types are: open_contact, open_listing, open_task, draft_sms.
- Never invent action types or IDs.

STYLE:
- Lead with the best next step.
- Use short sections and bullets when helpful.
- Plain text only (NO markdown). Do not use **bold**, _italics_, backticks, headings, or code blocks.
- Do not prefix with labels like "Answer:" or "Response:"; start directly with content.

OFF-TOPIC HANDLING:
- If off-topic: one sentence stating you can only help with Avillo/workspace + real estate workflow, then suggest 1–2 relevant prompts.

OUTPUT:
Return ONLY valid JSON:
{
  "reply": "string",
  "actions"?: Array<{ "type": string, "label"?: string, "id"?: string, "payload"?: any }>
}
`.trim();
}

/* ------------------------------------
 * Route
 * -----------------------------------*/

export async function POST(req: Request) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok || !ctx.userId || !ctx.workspaceId) {
      return jsonError(ctx.status || 401, ctx.error?.error || "Unauthorized");
    }

    const body = (await req.json().catch(() => null)) as ChatBody | null;
    if (!body || typeof body !== "object") return jsonError(400, "Invalid JSON body.");

    const rawMessages = body.messages;
    const page = typeof body.page === "string" ? body.page : undefined;
    const pageContextRaw =
      body.pageContext && typeof body.pageContext === "object" ? body.pageContext : undefined;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return jsonError(400, "Missing messages.");
    }

    // Validate + clamp
    const messages: ClientMsg[] = rawMessages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
      .map((m) => ({ role: m.role, text: clampStr(m.text, 3000) }))
      .filter((m) => m.text.length > 0);

    if (messages.length === 0) return jsonError(400, "Missing messages.");

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text || "";
    const intent = inferIntent(lastUser);

    const wsId = ctx.workspaceId;
    const userId = ctx.userId;
    const vctx: VisibilityCtx = {
      workspaceId: wsId,
      userId,
      isWorkspaceAdmin: false,
    };

    // ----------------------------
    // Time boundaries (browser tz preferred) — via canonical shared lib
    // ----------------------------
    const browserTZ = safeIanaTZ(body.tz);
    const { zone, todayStart, tomorrowStart, in7Start } = dayBoundsForTZ(browserTZ);

    // ----------------------------
    // Page context (preferred) + fallback fuzzy focus
    // ----------------------------
    const pageContext: PageContext = {
      contactId: sanitizeId(pageContextRaw?.contactId) ?? undefined,
      listingId: sanitizeId(pageContextRaw?.listingId) ?? undefined,
      taskId: sanitizeId(pageContextRaw?.taskId) ?? undefined,
      conversationId: sanitizeId(pageContextRaw?.conversationId) ?? undefined,
      tab: typeof pageContextRaw?.tab === "string" ? clampStr(pageContextRaw.tab, 64) : undefined,
      filters: pageContextRaw?.filters ?? undefined,
    };

    const hints = extractQuotedOrAfterKeywords(lastUser);

    // ----------------------------
    // Privacy boundary for tasks (aligned with schema)
    // - tasks are private to current user: assignedToUserId = userId
    // - exclude deleted (deletedAt null)
    // ----------------------------
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

    // ----------------------------
    // Parallel queries (lean + high value)
    // ----------------------------
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
      lastTouchByContact,
      workspacePins, // ✅ NEW
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
          contact: { select: { id: true, firstName: true, lastName: true } },
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
          contact: { select: { id: true, firstName: true, lastName: true } },
          listing: { select: { id: true, address: true, status: true } },
        },
      }),

      // NOTE: keep your prior behavior: "week" = tomorrow → +7 days (excludes today)
      prisma.task.findMany({
        where: { ...taskWhereMe, status: "OPEN", dueAt: { gte: tomorrowStart, lt: in7Start } },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          dueAt: true,
          source: true,
          contact: { select: { id: true, firstName: true, lastName: true } },
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
        take: 10,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          relationshipType: true,
          stage: true,
          clientRole: true,
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
        select: { id: true, address: true, status: true, price: true, updatedAt: true },
      }),

      prisma.cRMActivity.groupBy({
        by: ["contactId"],
        where: {
          ...whereReadableCRMActivity(vctx),
          actorUserId: userId,
          contactId: { not: null },
        },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: "asc" } },
        take: 20,
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

    // Never touched: owned contacts with no CRMActivity by me
    const neverTouched = await prisma.contact.findMany({
      where: {
        ...whereReadableContact(vctx),
        ownerUserId: userId,
        crmActivity: { none: { actorUserId: userId } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        relationshipType: true,
        stage: true,
        clientRole: true,
        updatedAt: true,
      },
    });

    const lastTouchMap = new Map<string, Date | null>();
    for (const row of lastTouchByContact) {
      if (row.contactId) lastTouchMap.set(row.contactId, row._max.createdAt ?? null);
    }

    const followupsCandidates = [
      ...neverTouched.map((c) => ({
        id: c.id,
        name: formatName(c.firstName, c.lastName),
        relationshipType: c.relationshipType,
        stage: c.stage,
        clientRole: c.clientRole,
        lastTouchAt: null as Date | null,
        updatedAt: c.updatedAt,
        reason: "never_touched" as const,
      })),
      ...myRecentContacts
        .map((c) => {
          const lastTouchAt = lastTouchMap.get(c.id) ?? null;
          return {
            id: c.id,
            name: formatName(c.firstName, c.lastName),
            relationshipType: c.relationshipType,
            stage: c.stage,
            clientRole: c.clientRole,
            lastTouchAt,
            updatedAt: c.updatedAt,
            reason: (lastTouchAt ? "stale_touch" : "unknown") as "stale_touch" | "unknown",
          };
        })
        .sort((a, b) => {
          const aT = a.lastTouchAt ? new Date(a.lastTouchAt).getTime() : -1;
          const bT = b.lastTouchAt ? new Date(b.lastTouchAt).getTime() : -1;
          return aT - bT;
        }),
    ];

    const followups = enforceBudget(
      Array.from(new Map(followupsCandidates.map((x) => [x.id, x])).values()).slice(0, 12),
      12
    );

    // ----------------------------
    // Focus hydration (pageContext ids first, then conservative fuzzy)
    // ----------------------------
    const focus: any = {};
    const focusTaskId = pageContext.taskId;
    const focusContactId = pageContext.contactId;
    const focusListingId = pageContext.listingId;
    const focusConversationId = pageContext.conversationId;

    if (focusTaskId) {
      const task = await prisma.task.findFirst({
        where: { id: focusTaskId, workspaceId: wsId, assignedToUserId: userId, deletedAt: null },
        select: {
          id: true,
          title: true,
          notes: true,
          dueAt: true,
          status: true,
          source: true,
          contact: {
            select: { id: true, firstName: true, lastName: true, stage: true, clientRole: true },
          },
          listing: { select: { id: true, address: true, status: true, price: true } },
        },
      });

      if (task) {
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
                stage: task.contact.stage,
                clientRole: task.contact.clientRole,
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
      }
    }

    if (focusContactId) {
      const c = await prisma.contact.findFirst({
        where: { id: focusContactId, ...whereReadableContact(vctx) },
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
          contactNotes: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { text: true, reminderAt: true, createdAt: true },
          },

          // ✅ PINS
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

          // ✅ PINS
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

    if (focusListingId) {
      const l = await prisma.listing.findFirst({
        where: { id: focusListingId, ...whereReadableListing(vctx) },
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

          // ✅ NEW: listing pins
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

          // ✅ NEW: listing notes
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
          seller: l.seller ? { id: l.seller.id, name: formatName(l.seller.firstName, l.seller.lastName) } : null,
          buyers: l.buyers.map((b) => ({
            id: b.contact.id,
            name: formatName(b.contact.firstName, b.contact.lastName),
            role: b.role ?? null,
          })),
          photos: l.photos.map((p) => ({ url: p.url, isCover: p.isCover })),

          // ✅ NEW: listing pins
          pins: l.pins.map((lp) => ({
            id: lp.id,
            pinId: lp.pin.id,
            pinName: lp.pin.name,
            createdAt: lp.createdAt,
            createdByUserId: lp.createdByUserId ?? null,
          })),

          // ✅ NEW: listing notes
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

    if (focusConversationId) {
      const convo = await prisma.conversation.findFirst({
        where: {
          id: focusConversationId,
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

    // Fuzzy focus only if no explicit ids and nothing hydrated yet
    if (
      !focus.task &&
      !focus.contact &&
      !focus.listing &&
      !focus.conversation &&
      !focusTaskId &&
      !focusContactId &&
      !focusListingId &&
      !focusConversationId
    ) {     
      const hintTask = hints.task?.slice(0, 80) || null;
      const hintContact = hints.contact?.slice(0, 80) || null;
      const hintListing = hints.listing?.slice(0, 80) || null;

      if (hintTask) {
        const t = await prisma.task.findFirst({
          where: {
            ...taskWhereMe,
            deletedAt: null,
            OR: [{ title: { contains: hintTask, mode: "insensitive" } }],
          },
          select: { id: true, title: true, dueAt: true, status: true },
        });
        if (t) {
          focus.task = {
            id: t.id,
            title: t.title,
            dueAt: t.dueAt ?? null,
            dueAtLabel: formatDateTimeInZone(t.dueAt ?? null, zone),
            dueLabel: formatDateInZone(t.dueAt ?? null, zone),
            dueLabelLong: formatDateLongInZone(t.dueAt ?? null, zone),
            status: t.status,
          };
        }
      }

      if (!focus.contact && hintContact) {
        const parts = hintContact
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3);

        const p0 = parts[0] ?? "";
        const p1 = parts[1] ?? "";

        const OR: any[] = [
          { firstName: { contains: hintContact, mode: "insensitive" } },
          { lastName: { contains: hintContact, mode: "insensitive" } },
        ];

        if (p0 && p1) {
          OR.push({
            AND: [
              { firstName: { contains: p0, mode: "insensitive" } },
              { lastName: { contains: p1, mode: "insensitive" } },
            ],
          });
        }

        const c = await prisma.contact.findFirst({
          where: {
            ...whereReadableContact(vctx),
            OR,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stage: true,
            clientRole: true,
            relationshipType: true,
          },
        });

        if (c) {
          focus.contact = {
            id: c.id,
            name: formatName(c.firstName, c.lastName),
            relationshipType: c.relationshipType,
            stage: c.stage,
            clientRole: c.clientRole,
          };
        }
      }

      if (!focus.listing && hintListing) {
        const l = await prisma.listing.findFirst({
          where: {
            ...whereReadableListing(vctx),
            address: { contains: hintListing, mode: "insensitive" },
          },
          select: { id: true, address: true, status: true, price: true },
        });
        if (l) focus.listing = { id: l.id, address: l.address, status: l.status, price: l.price ?? null };
      }
    }

    // ----------------------------
    // Build context
    // ----------------------------
    const context = {
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
          zone, // IANA zone or UTC (canonical)
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

      // ✅ NEW: workspace pin bank summary
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
            contactName: t.contact ? formatName(t.contact.firstName, t.contact.lastName) : null,
            listingAddress: t.listing?.address ?? null,
            listingStatus: t.listing?.status ?? null,
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
            contactName: t.contact ? formatName(t.contact.firstName, t.contact.lastName) : null,
            listingAddress: t.listing?.address ?? null,
            listingStatus: t.listing?.status ?? null,
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
            contactName: t.contact ? formatName(t.contact.firstName, t.contact.lastName) : null,
            listingAddress: t.listing?.address ?? null,
            listingStatus: t.listing?.status ?? null,
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
          lastTouchAt: c.lastTouchAt ? new Date(c.lastTouchAt).toISOString() : null,
          updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
          reason: c.reason,
        })),
        notes:
          "These are my owned contacts prioritized by oldest/never touch. Use for 'who should I follow up with' or daily planning.",
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

    // ----------------------------
    // OpenAI (strict JSON)
    // ----------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.22,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPreamble() },
        {
          role: "user",
          content: [
            "WORKSPACE CONTEXT (authoritative, do not assume beyond this):",
            JSON.stringify(context, null, 2),
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

    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : null;
    if (!reply) {
      return jsonError(502, "AI returned empty reply.", { rawSnippet: raw.slice(0, 500) });
    }

    const allowedActionTypes = new Set(["open_contact", "open_listing", "open_task", "draft_sms"]);

    const actions =
      Array.isArray(parsed.actions) && parsed.actions.length
        ? parsed.actions
            .filter((a) => a && typeof a.type === "string" && allowedActionTypes.has(a.type))
            .map((a) => {
              if (a.type === "draft_sms") {
                const payload = a.payload && typeof a.payload === "object" ? a.payload : null;
                const contactId = sanitizeId(payload?.contactId);
                const conversationId = sanitizeId(payload?.conversationId);
                const message = sanitizeDraftMessage(payload?.message);

                if (!contactId || !message || !myActivePhoneNumber) return null;

                const focusedConversationId =
                  focus?.conversation?.id && typeof focus.conversation.id === "string"
                    ? focus.conversation.id
                    : null;

                const focusedConversationContactId =
                  focus?.conversation?.contact?.id && typeof focus.conversation.contact.id === "string"
                    ? focus.conversation.contact.id
                    : null;

                if (focusedConversationId) {
                  if (!conversationId || conversationId !== focusedConversationId) return null;
                }

                if (focusedConversationContactId && contactId !== focusedConversationContactId) return null;

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

              if (a.type === "open_contact" || a.type === "open_listing" || a.type === "open_task") {
                const id = sanitizeId(a.id);
                if (!id) return null;

                return {
                  type: a.type,
                  id,
                  ...(typeof a.label === "string" ? { label: clampStr(a.label, 80) } : {}),
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