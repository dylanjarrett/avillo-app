// src/app/api/sms/conversations/contacts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { whereReadableContact, type VisibilityCtx } from "@/lib/visibility";
import { WorkspaceRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTake(url: URL, def: number, max: number) {
  const raw = Number(url.searchParams.get("take"));
  if (!Number.isFinite(raw)) return def;
  const n = Math.floor(raw);
  return Math.min(Math.max(n, 1), max);
}

function normQ(raw: string) {
  return String(raw ?? "").trim();
}

function digitsOnly(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function shapeName(c: { firstName?: string | null; lastName?: string | null; email?: string | null }) {
  const name = `${(c.firstName ?? "").trim()} ${(c.lastName ?? "").trim()}`.trim();
  return name || (c.email ?? "").trim() || "Unnamed contact";
}

/**
 * GET /api/sms/conversations/contacts?q=...&take=8
 * - Comms-only contact search (lite)
 * - Uses visibility gates (whereReadableContact)
 * - Searches BOTH clients + partners (whatever is visible to the user)
 * - Returns only contacts with a phone (so selecting always works for Comms)
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json({ contacts: [] }, { status: 200 });

    // Determine admin-ness for visibility gates (OWNER/ADMIN)
    const membership = await prisma.workspaceUser.findFirst({
      where: { workspaceId: ctx.workspaceId, userId: ctx.userId, removedAt: null },
      select: { role: true },
    });

    const isWorkspaceAdmin =
      membership?.role === WorkspaceRole.OWNER || membership?.role === WorkspaceRole.ADMIN;

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin,
    };

    const url = new URL(req.url);
    const take = parseTake(url, 8, 20);
    const q = normQ(url.searchParams.get("q") || "");

    // If no query, return a small “recent” list (still phone-only)
    const qDigits = digitsOnly(q);

    const contacts = await prisma.contact.findMany({
      where: {
        ...whereReadableContact(vctx),

        // Comms needs a callable/textable phone
        phone: { not: null },

        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },

                // Phone search: try both the raw query and digits-only query
                { phone: { contains: q, mode: "insensitive" } },
                ...(qDigits
                  ? [{ phone: { contains: qDigits, mode: "insensitive" as const } }]
                  : []),
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        relationshipType: true,
        visibility: true,
        ownerUserId: true,
      },
    });

    // Filter out empty-string phone too (common edge case)
    const items = contacts
      .map((c) => {
        const phone = String(c.phone ?? "").trim();
        if (!phone) return null;

        return {
          id: c.id,
          name: shapeName(c),
          phone,
          relationshipType: c.relationshipType, // CLIENT | PARTNER (for UI badges if you want)
          visibility: c.visibility, // PRIVATE | WORKSPACE (debuggable)
          ownerUserId: c.ownerUserId ?? null, // optional for UI/debug
        };
      })
      .filter(Boolean);

    return NextResponse.json({ contacts: items });
  } catch (err) {
    console.error("sms/conversations/contacts GET error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t search contacts right now. Try again, or email support@avillo.io if it continues.",
      },
      { status: 500 }
    );
  }
}