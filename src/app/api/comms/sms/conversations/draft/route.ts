// src/app/api/comms/sms/conversations/draft/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { normalizeE164 } from "@/lib/phone/normalize";
import { threadKeyForSms } from "@/lib/phone/threadKey";
import type { VisibilityCtx } from "@/lib/visibility";
import { whereReadableContact } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  to: string; // phone input (raw)
  contactId?: string | null;
  listingId?: string | null;
};

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

const CONVO_SELECT = {
  id: true,
  workspaceId: true,
  threadKey: true,
  phoneNumberId: true,
  assignedToUserId: true,

  otherPartyE164: true,
  displayName: true,

  lastMessageAt: true,
  lastInboundAt: true,
  lastOutboundAt: true,

  contactId: true,
  listingId: true,

  updatedAt: true,
  createdAt: true,

  contact: {
    select: { firstName: true, lastName: true, phone: true },
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    // Entitlement gate (matches the rest of Comms)
    const gate = await requireEntitlement(ctx.workspaceId, "COMMS_ACCESS");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.to) {
      return NextResponse.json({ error: "Missing destination phone number." }, { status: 400 });
    }

    const otherPartyE164 = normalizeE164(body.to);
    if (!otherPartyE164) {
      return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
    }

    const contactId = safeId(body.contactId);
    const listingId = safeId(body.listingId);

    // Visibility context (contacts are private to owner)
    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    // If caller provided a contactId, ensure it's readable (owned/private)
    if (contactId) {
      const ok = await prisma.contact.findFirst({
        where: { id: contactId, ...whereReadableContact(vctx) },
        select: { id: true },
      });

      if (!ok) {
        return NextResponse.json({ error: "Contact not found." }, { status: 404 });
      }
    }

    // Ensure user has an ACTIVE phone number in this workspace
    const myNumber = await prisma.userPhoneNumber.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        assignedToUserId: ctx.userId,
        status: "ACTIVE",
      },
      select: { id: true, e164: true },
    });

    if (!myNumber?.id) {
      return NextResponse.json(
        { error: "You need a phone number before you can start a new thread." },
        { status: 400 }
      );
    }

    /**
     * ✅ IMPORTANT:
     * Older/legacy conversations may have a different threadKey.
     * So before we upsert by threadKey, we first try to reuse an existing convo
     * by canonical identity: (workspaceId, phoneNumberId, assignedToUserId, otherPartyE164).
     */
    const existing = await prisma.conversation.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        phoneNumberId: myNumber.id,
        assignedToUserId: ctx.userId,
        otherPartyE164,
      },
      select: CONVO_SELECT,
    });

    if (existing) {
      // Only attach context if provided (don't wipe existing)
      const updated = await prisma.conversation.update({
        where: { id: existing.id },
        data: {
          ...(contactId ? { contactId } : {}),
          ...(listingId ? { listingId } : {}),
        },
        select: CONVO_SELECT,
      });

      return NextResponse.json({ conversation: updated });
    }

    // Canonical threadKey (do NOT include contactId)
    const threadKey = threadKeyForSms({
      phoneNumberId: myNumber.id,
      otherPartyE164,
    });

    // Upsert draft conversation (threadKey canonical path)
    const convo = await prisma.conversation.upsert({
      where: {
        workspaceId_threadKey: {
          workspaceId: ctx.workspaceId,
          threadKey,
        },
      },
      create: {
        workspaceId: ctx.workspaceId,
        threadKey,
        phoneNumberId: myNumber.id,
        assignedToUserId: ctx.userId,
        otherPartyE164, // REQUIRED now
        contactId,
        listingId,
      },
      update: {
        // Keep it assigned to the current user (owner model)
        assignedToUserId: ctx.userId,
        // Keep canonical identity in sync
        otherPartyE164,
        // Only set these if provided (don’t wipe existing context)
        ...(contactId ? { contactId } : {}),
        ...(listingId ? { listingId } : {}),
      },
      select: CONVO_SELECT,
    });

    return NextResponse.json({ conversation: convo });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    console.error("sms/conversations/draft POST error:", err);

    return NextResponse.json(
      {
        error: msg || "We couldn’t create this draft thread. Try again, or email support@avillo.io.",
      },
      { status: 500 }
    );
  }
}