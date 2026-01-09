// src/app/api/account/change-phone/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace"; // <-- adjust path if needed

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(input: string | null) {
  if (!input) return null;

  const raw = input.trim();
  if (!raw) return null;

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
    const ws = await requireWorkspace();
    if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

    let body: { phone?: string | null } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const normalized = normalizePhone(body.phone ?? null);

    if (body.phone && !normalized) {
      return NextResponse.json(
        { error: "Please enter a valid phone number (10 digits or +E.164 format)." },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: ws.userId },
      data: { phone: normalized },
      select: { id: true, phone: true },
    });

    return NextResponse.json(
      { success: true, phone: updated.phone },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("CHANGE PHONE API ERROR →", err);
    return NextResponse.json({ error: "Failed to update phone number." }, { status: 500 });
  }
}