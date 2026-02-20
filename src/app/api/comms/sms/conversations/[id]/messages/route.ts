// src/app/api/comms/sms/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { normalizeE164 } from "@/lib/phone/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * IMPORTANT: URLSearchParams.get("take") returns null when missing.
 * Number(null) === 0, so we must handle null/empty explicitly or we'd clamp to 1.
 */
function parseTake(url: URL, def: number, max: number) {
  const rawStr = url.searchParams.get("take");
  if (rawStr == null || rawStr === "") return def;

  const raw = Number(rawStr);
  if (!Number.isFinite(raw)) return def;

  const n = Math.floor(raw);
  return Math.min(Math.max(n, 1), max);
}

function digits10(input: string) {
  const d = String(input ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length <= 10 ? d : d.slice(-10);
}

/**
 * Best-effort coercion to E.164:
 * - try normalizeE164 first
 * - if that fails but we have 10 digits, assume US and return +1XXXXXXXXXX
 */
function coerceE164(input: string) {
  const strict = normalizeE164(String(input ?? ""));
  if (strict) return strict;

  const d10 = digits10(input);
  if (d10 && d10.length === 10) return `+1${d10}`;

  return "";
}

/**
 * Derives the other party for this conversation.
 * Returns:
 * - otherE164: canonical when we can determine it (best effort)
 * - other10: always used for healing query
 */
async function deriveOtherParty(input: {
  workspaceId: string;
  conversationId: string;
  pnE164: string;
  contactId?: string | null;
  otherPartyE164?: string | null;
}) {
  const { workspaceId, conversationId, pnE164, contactId, otherPartyE164 } = input;

  // 1) Conversation.otherPartyE164 (best)
  const direct = coerceE164(String(otherPartyE164 ?? ""));
  if (direct) return { otherE164: direct, other10: digits10(direct) };

  // 2) Most recent message attached to this conversation
  const latest = await prisma.smsMessage.findFirst({
    where: { workspaceId, conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { fromNumber: true, toNumber: true },
  });

  const pn = coerceE164(pnE164);
  const pn10 = digits10(pn);

  if (latest && pn10) {
    const aRaw = String(latest.fromNumber ?? "");
    const bRaw = String(latest.toNumber ?? "");

    const aE164 = coerceE164(aRaw);
    const bE164 = coerceE164(bRaw);

    const a10 = digits10(aRaw);
    const b10 = digits10(bRaw);

    // Prefer E.164 when available; otherwise fall back to last-10 match.
    if (aE164 && digits10(aE164) !== pn10) return { otherE164: aE164, other10: digits10(aE164) };
    if (bE164 && digits10(bE164) !== pn10) return { otherE164: bE164, other10: digits10(bE164) };

    if (a10 && a10 !== pn10)
      return { otherE164: aE164 || (a10.length === 10 ? `+1${a10}` : ""), other10: a10 };
    if (b10 && b10 !== pn10)
      return { otherE164: bE164 || (b10.length === 10 ? `+1${b10}` : ""), other10: b10 };
  }

  // 3) Contact phone fallback (best-effort)
  if (contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { phone: true },
    });

    const cpRaw = String(c?.phone ?? "");
    const cp10 = digits10(cpRaw);
    const cpE164 = coerceE164(cpRaw);

    if (cp10) return { otherE164: cpE164, other10: cp10 };
  }

  return { otherE164: "", other10: "" };
}

/**
 * Thread read:
 * - Enforces conversation ownership
 * - Heals SmsMessage rows by phone-pair (last-10 digits) onto the canonical conversationId
 * - Returns messages ascending for UI
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const conversationId = String(ctx.params.id || "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // 🔒 Privacy boundary: must be workspace + assigned to user
  const conv = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: ws.workspaceId,
      assignedToUserId: ws.userId,
    },
    select: {
      id: true,
      phoneNumberId: true,
      contactId: true,
      otherPartyE164: true,
      phoneNumber: { select: { e164: true } },
    },
  });

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const pnE164 = coerceE164(String(conv.phoneNumber?.e164 ?? ""));
  if (!pnE164) {
    return NextResponse.json({ error: "Conversation phone number is invalid." }, { status: 500 });
  }

  const { otherE164, other10 } = await deriveOtherParty({
    workspaceId: ws.workspaceId,
    conversationId: conv.id,
    pnE164,
    contactId: conv.contactId ?? null,
    otherPartyE164: conv.otherPartyE164 ?? null,
  });

  const pn10 = digits10(pnE164);

  const url = new URL(req.url);
  const take = parseTake(url, 50, 200);

  // If we can't derive phone-pair, safely return only what's already attached.
  if (!pn10 || !other10) {
    const fallback = await prisma.smsMessage.findMany({
      where: { workspaceId: ws.workspaceId, conversationId: conv.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        body: true,
        status: true,
        error: true,
        createdAt: true,
        source: true,
        createdByUserId: true,
      },
    });

    return NextResponse.json({ items: fallback, nextCursor: null });
  }

  // Keep canonical otherPartyE164 up to date when we can coerce it
  if (otherE164 && conv.otherPartyE164 !== otherE164) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { otherPartyE164: otherE164 },
    });
  }

  // Heal/attach by last-10 digit phone pair
  await prisma.$executeRaw`
    UPDATE "SmsMessage"
    SET
      "conversationId" = ${conv.id},
      "phoneNumberId" = ${conv.phoneNumberId},
      "assignedToUserId" = ${ws.userId}
    WHERE
      "workspaceId" = ${ws.workspaceId}
      AND (
        (
          RIGHT(regexp_replace(COALESCE("fromNumber", ''), '[^0-9]', '', 'g'), 10) = ${pn10}
          AND RIGHT(regexp_replace(COALESCE("toNumber", ''),   '[^0-9]', '', 'g'), 10) = ${other10}
        )
        OR
        (
          RIGHT(regexp_replace(COALESCE("fromNumber", ''), '[^0-9]', '', 'g'), 10) = ${other10}
          AND RIGHT(regexp_replace(COALESCE("toNumber", ''),   '[^0-9]', '', 'g'), 10) = ${pn10}
        )
      )
  `;

  const msgs = await prisma.smsMessage.findMany({
    where: { workspaceId: ws.workspaceId, conversationId: conv.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      direction: true,
      fromNumber: true,
      toNumber: true,
      body: true,
      status: true,
      error: true,
      createdAt: true,
      source: true,
      createdByUserId: true,
    },
  });

  return NextResponse.json({
    items: [...msgs].reverse(), // ascending for UI
    nextCursor: null,
  });
}