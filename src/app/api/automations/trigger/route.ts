import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { processTriggers } from "@/lib/automations/processTriggers";
import { requireEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireEntitlement(user.id, "AUTOMATIONS_TRIGGER");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const { trigger, contactId, listingId, payload } = await req.json();

  // ✅ Guardrail: do not process triggers for PARTNER contacts
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: user.id },
      select: { id: true, relationshipType: true },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (String(contact.relationshipType) === "PARTNER") {
      return NextResponse.json(
        { success: false, skipped: true, reason: "Partner contacts do not run automations." },
        { status: 200 }
      );
    }
  }

  await processTriggers(trigger, { userId: user.id, contactId, listingId, payload });

  return NextResponse.json({ success: true });
}
