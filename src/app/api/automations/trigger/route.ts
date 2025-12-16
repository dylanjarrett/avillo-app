import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { processTriggers } from "@/lib/automations/processTriggers";
import { requireEntitlement } from "@/lib/entitlements";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireEntitlement(user.id, "AUTOMATIONS_TRIGGER");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const { trigger, contactId, listingId, payload } = await req.json();
  await processTriggers(trigger, { userId: user.id, contactId, listingId, payload });

  return NextResponse.json({ success: true });
}