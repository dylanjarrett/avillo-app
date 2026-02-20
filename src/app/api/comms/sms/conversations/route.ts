// src/app/api/comms/sms/conversations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { normalizeE164 } from "@/lib/phone/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTake(url: URL, def: number, max: number) {
  const rawStr = url.searchParams.get("take");
  if (rawStr == null || rawStr === "") return def;

  const raw = Number(rawStr);
  if (!Number.isFinite(raw)) return def;

  const n = Math.floor(raw);
  return Math.min(Math.max(n, 1), max);
}

function parseIsoDateSafe(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cleanPreview(input: unknown) {
  const s = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

function resolveOtherPartyE164(convo: {
  otherPartyE164: string | null;
  contact?: { phone?: string | null } | null;
}) {
  const direct = String(convo.otherPartyE164 ?? "").trim();
  if (direct) return direct;

  // legacy fallback: derive from contact.phone when possible
  const fallback = normalizeE164(convo.contact?.phone ?? "");
  return fallback || null;
}

/**
 * User-private inbox:
 * - only returns conversations assigned to the authed user
 * - stable pagination using (updatedAt, id) cursor
 * - dedupes legacy rows that resolve to the same destination (phoneNumberId + otherPartyE164)
 * - overlays per-user comm readState for unread dot calculation in UI
 *
 * Query:
 *  - take: number (default 50, max 100)
 *  - cursorUpdatedAt: ISO string
 *  - cursorId: conversation id (tie-breaker)
 */
export async function GET(req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

    // ✅ Entitlement gate
    const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
    if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

    const url = new URL(req.url);
    const take = parseTake(url, 50, 100);

    const cursorUpdatedAt = parseIsoDateSafe(url.searchParams.get("cursorUpdatedAt"));
    const cursorId = String(url.searchParams.get("cursorId") || "").trim();

    const where: any = {
      workspaceId: ws.workspaceId,
      assignedToUserId: ws.userId, // ✅ user-private boundary
    };

    // Stable cursor: fetch items "older than" the cursor (updatedAt desc, id desc)
    if (cursorUpdatedAt && cursorId) {
      where.OR = [
        { updatedAt: { lt: cursorUpdatedAt } },
        { updatedAt: cursorUpdatedAt, id: { lt: cursorId } },
      ];
    }

    // NOTE: we fetch take+1 for cursoring, then dedupe within the page
    const items = await prisma.conversation.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: {
        id: true,
        contactId: true,
        listingId: true,
        phoneNumberId: true,
        assignedToUserId: true,
        displayName: true,
        otherPartyE164: true,
        lastMessageAt: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        threadKey: true,
        createdAt: true,
        updatedAt: true,
        contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
      },
    });

    const hasMore = items.length > take;
    const pageRaw = hasMore ? items.slice(0, take) : items;

    // ---- Dedupe by canonical destination ----
    // Key: phoneNumberId + resolved otherPartyE164 (fallback from contact.phone for legacy rows)
    const seen = new Set<string>();
    const page = pageRaw.filter((c) => {
      const resolved = resolveOtherPartyE164(c);
      const key = resolved ? `${c.phoneNumberId}::${resolved}` : `id::${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const ids = page.map((c) => c.id);

    // ---- Compute lastMessagePreview for each conversation (1 query, not N+1) ----
    const previewByConvo: Record<string, string | null> = {};
    if (ids.length) {
      const lastMsgs = await prisma.smsMessage.findMany({
        where: {
          workspaceId: ws.workspaceId,
          conversationId: { in: ids },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, conversationId: true, body: true },
      });

      for (const m of lastMsgs) {
        const cid = String(m.conversationId);
        if (previewByConvo[cid] !== undefined) continue; // newest wins due to ordering
        previewByConvo[cid] = cleanPreview(m.body);
      }
    }

    // ---- ReadState overlay (1 query) ----
    const readStateByConvo: Record<
      string,
      { lastReadAt: string; lastReadEventId: string | null } | null
    > = {};

    if (ids.length) {
      const rs = await prisma.commReadState.findMany({
        where: {
          workspaceId: ws.workspaceId,
          userId: ws.userId,
          conversationId: { in: ids },
        },
        select: {
          conversationId: true,
          lastReadAt: true,
          lastReadEventId: true,
        },
      });

      for (const r of rs) {
        readStateByConvo[String(r.conversationId)] = {
          lastReadAt: r.lastReadAt.toISOString(),
          lastReadEventId: r.lastReadEventId ?? null,
        };
      }
    }

    const enriched = page.map((c) => ({
      ...c,
      // ensure UI always has a usable number even for legacy rows
      otherPartyE164: c.otherPartyE164 ?? resolveOtherPartyE164(c),
      lastMessagePreview: previewByConvo[c.id] ?? null,

      // ✅ overlay readState so UI can compute unread dot reliably
      readState: readStateByConvo[c.id] ?? null,
    }));

    const last = enriched[enriched.length - 1];

    const res = NextResponse.json({
      items: enriched,
      nextCursor:
        hasMore && last
          ? { cursorUpdatedAt: new Date(last.updatedAt).toISOString(), cursorId: last.id }
          : null,
    });

    // ✅ prevent any intermediate caching layers from serving stale readState/unread
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.headers.set("Pragma", "no-cache");

    return res;
  } catch (err: any) {
    console.error("comms/sms/conversations GET error:", err);
    return NextResponse.json(
      { error: String(err?.message ?? "Failed to load conversations.") },
      { status: 500 }
    );
  }
}