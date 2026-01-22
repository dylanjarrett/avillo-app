//api/automations/trigger/route
import { NextRequest, NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { processTriggers } from "@/lib/automations/processTriggers";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
function safeString(v: any, max = 120): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const gate = await requireEntitlement(ctx.workspaceId, "AUTOMATIONS_TRIGGER");
    if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

    const body = (await req.json().catch(() => null)) as any | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

    const trigger = safeString(body.trigger, 80);
    const contactId = safeId(body.contactId);
    const listingId = safeId(body.listingId);
    const payload = body.payload ?? null;

    const idempotencyKey =
      safeString(body.idempotencyKey ?? body.requestId ?? "", 180) || undefined;

    if (!trigger) return NextResponse.json({ error: "Missing trigger" }, { status: 400 });

    if (contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId: ctx.workspaceId },
        select: { id: true, relationshipType: true },
      });

      if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

      if (String(contact.relationshipType) === "PARTNER") {
        return NextResponse.json(
          { success: false, skipped: true, reason: "Partner contacts do not run automations." },
          { status: 200 }
        );
      }
    }

    if (listingId) {
      const listing = await prisma.listing.findFirst({
        where: { id: listingId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });

      if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    await processTriggers(trigger as any, {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      payload: payload ?? undefined,
      idempotencyKey,
    } as any);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/automations/trigger POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t process this trigger. Try again, or email support@avillo.io." },
      { status: 500 }
    );
  }
}