// src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace"; // <-- adjust path if needed

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(_req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

    const user = await prisma.user.findUnique({
      where: { id: ws.userId },
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!user) return jsonError("User not found.", 404);

    return NextResponse.json(
      { success: true, user },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("PROFILE GET ERROR →", err);
    return jsonError("Failed to load profile.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

    let body: { name?: string; brokerage?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid request body.", 400);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const brokerage = typeof body.brokerage === "string" ? body.brokerage.trim() : "";

    const updated = await prisma.user.update({
      where: { id: ws.userId },
      data: {
        name: name.length ? name : null,
        brokerage: brokerage.length ? brokerage : null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        phone: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { success: true, user: updated },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("PROFILE POST ERROR →", err);
    return jsonError("Failed to update profile.", 500);
  }
}