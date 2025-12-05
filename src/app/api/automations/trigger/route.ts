import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { processTriggers } from "@/lib/automations/processTriggers";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { trigger, contactId, listingId } = body;

  await processTriggers(trigger, {
    userId: user.id,
    contactId,
    listingId,
  });

  return NextResponse.json({ success: true });
}