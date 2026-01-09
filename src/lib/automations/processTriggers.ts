// src/lib/automations/processTriggers.ts
import { prisma } from "@/lib/prisma";
import { runAutomation } from "./runAutomation";
import type { AutomationTrigger, AutomationContext } from "./types";
import { requireEntitlement } from "@/lib/entitlements";

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

/**
 * Workspace-first trigger processor
 * Rules:
 * - Entitlement gate (defense-in-depth)
 * - Workspace membership guard (prevents cross-tenant execution)
 * - Validate contact/listing belong to workspace when provided
 * - HARD RULE: Partner contacts never run automations
 * - Only run automations scoped to workspace + trigger + active
 *
 * NOTE: context.workspaceId is REQUIRED.
 */
export async function processTriggers(trigger: AutomationTrigger, context: AutomationContext) {
  try {
    const userId = safeId((context as any)?.userId);
    const workspaceId = safeId((context as any)?.workspaceId);
    const contactId = safeId((context as any)?.contactId);
    const listingId = safeId((context as any)?.listingId);

    if (!userId) return;
    if (!workspaceId) return;

    // Defense-in-depth: if called directly, still enforce entitlement
    const gate = await requireEntitlement(userId, "AUTOMATIONS_TRIGGER");
    if (!gate.ok) return;

    // Membership guard
    const membership = await prisma.workspaceUser.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!membership) return;

    // Validate contact belongs to workspace + HARD RULE: Partner contacts don't run automations
    if (contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { id: true, relationshipType: true },
      });
      if (!contact) return;
      if (String(contact.relationshipType) === "PARTNER") return;
    }

    // Validate listing belongs to workspace
    if (listingId) {
      const listing = await prisma.listing.findFirst({
        where: { id: listingId, workspaceId },
        select: { id: true },
      });
      if (!listing) return;
    }

    // ✅ Workspace-first: find active automations for this workspace + trigger
    // Attribution-only: createdByUserId is optional and NOT used for tenant scoping.
    const automations = await prisma.automation.findMany({
      where: {
        workspaceId,
        trigger,
        active: true,
      },
      include: { steps: true },
      orderBy: { createdAt: "asc" },
    });

    if (!automations.length) return;

    // Run sequentially to avoid thundering herds
    for (const a of automations) {
      const steps = Array.isArray((a.steps as any)?.steps) ? ((a.steps as any).steps as any[]) : [];

      await runAutomation(a.id, steps, {
        ...(context as any),
        userId,
        workspaceId,
        contactId: contactId ?? null,
        listingId: listingId ?? null,
        trigger: String(trigger),
      } as any);
    }
  } catch (err) {
    console.error("processTriggers error:", err);
    return; // silent by design
  }
}