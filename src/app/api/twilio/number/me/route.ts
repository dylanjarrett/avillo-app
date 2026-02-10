// src/app/api/twilio/number/me/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { PhoneNumberStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId, userId } = await requireWorkspace();

    // Gate comms access (BETA bypass handled inside entitlements)
    await requireEntitlement(workspaceId, "COMMS_ACCESS");

    const n = await prisma.userPhoneNumber.findFirst({
      where: {
        workspaceId,
        assignedToUserId: userId,
        status: PhoneNumberStatus.ACTIVE,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        e164: true,
        status: true,
        provider: true,
        capabilities: true,
        label: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Return 200 + null so the client never gets Next.js HTML error pages
    if (!n) return NextResponse.json(null);

    return NextResponse.json(n);
  } catch (err: any) {
    const message =
      err?.message ||
      err?.error?.message ||
      "Failed to load your phone number.";

    const status = Number(err?.statusCode || err?.status || 500);

    return NextResponse.json({ error: { message } }, { status });
  }
}