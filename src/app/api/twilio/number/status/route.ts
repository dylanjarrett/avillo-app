// src/app/api/twilio/number/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { getEntitlementsForWorkspaceId } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Comms status for the authed user in the current workspace.
 * - Does NOT hard-fail when Comms isn't enabled (so UI can show upgrade CTA cleanly)
 * - Returns whether user has an ACTIVE Avillo number assigned
 */
export async function GET(_req: NextRequest) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  const ent = await getEntitlementsForWorkspaceId(ws.workspaceId);

  const commsEnabled = !!ent.can.COMMS_ACCESS;
  const canProvision = !!ent.can.COMMS_PROVISION_NUMBER;

  const active = await prisma.userPhoneNumber.findFirst({
    where: {
      workspaceId: ws.workspaceId,
      assignedToUserId: ws.userId,
      status: "ACTIVE",
    },
    select: { id: true, e164: true, status: true },
  });

  return NextResponse.json({
    ok: true,
    ent: {
      accessLevel: ent.accessLevel,
      plan: ent.plan,
      subscriptionStatus: ent.subscriptionStatus,
      isPaidTier: ent.isPaidTier,
      can: {
        COMMS_ACCESS: ent.can.COMMS_ACCESS,
        COMMS_PROVISION_NUMBER: ent.can.COMMS_PROVISION_NUMBER,
      },
    },
    commsEnabled,
    canProvision,
    hasActiveNumber: !!active,
    activeNumber: active ? { id: active.id, e164: active.e164, status: active.status } : null,
  });
}