// src/app/api/account/change-phone/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Normalize phone to E.164-ish format.
 * Accepts:
 *  - 10-digit US numbers → +1XXXXXXXXXX
 *  - 11-digit starting with 1 → +1XXXXXXXXXX
 *  - Existing +XXXXXXXX format
 */
function normalizePhone(input: string | null) {
  if (!input) return null;

  const raw = input.trim();
  if (!raw) return null;

  // Already E.164
  if (raw.startsWith("+")) {
    const cleaned = "+" + raw.slice(1).replace(/[^\d]/g, "");
    return cleaned.length >= 10 && cleaned.length <= 16 ? cleaned : null;
  }

  const digits = raw.replace(/[^\d]/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    let body: { phone?: string | null } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const normalized = normalizePhone(body.phone ?? null);

    if (body.phone && !normalized) {
      return NextResponse.json(
        {
          error:
            "Please enter a valid phone number (10 digits or +E.164 format).",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: { phone: normalized },
      select: {
        id: true,
        phone: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        phone: updated.phone,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    console.error("CHANGE PHONE API ERROR →", err);
    return NextResponse.json(
      { error: "Failed to update phone number." },
      { status: 500 }
    );
  }
}
