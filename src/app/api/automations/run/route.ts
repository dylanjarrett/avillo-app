import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutomation } from "@/lib/automations/runAutomation";
import { requireEntitlement } from "@/lib/entitlements";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const gate = await requireEntitlement(ctx.userId, "AUTOMATIONS_RUN");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const body = await req.json().catch(() => null);
  const { automationId, contactId, listingId } = body ?? {};

  if (!automationId) {
    return NextResponse.json({ error: "Missing automationId" }, { status: 400 });
  }

  // Validate automation belongs to tenant
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId: ctx.workspaceId },
    include: { steps: true },
  });

  if (!automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  // Guardrail: automations should only run on CLIENT contacts
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId: ctx.workspaceId },
      select: { id: true, relationshipType: true },
    });

    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    if (String(contact.relationshipType) === "PARTNER") {
      return NextResponse.json(
        { error: "Automations can only run on Client contacts." },
        { status: 400 }
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

  const steps = automation.steps?.steps ? (automation.steps.steps as any[]) : [];

  await runAutomation(automation.id, steps, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    contactId: contactId ?? null,
    listingId: listingId ?? null,
    trigger: "MANUAL_RUN",
  } as any);

  return NextResponse.json({ success: true });
}