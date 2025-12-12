// src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * GET /api/account/profile
 * Returns the current user's profile in { success, user } shape
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return jsonError("Not authenticated.", 401);
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        createdAt: true,
      },
    });

    if (!user) {
      return jsonError("User not found.", 404);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        brokerage: user.brokerage,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("PROFILE GET ERROR →", err);
    return jsonError("Failed to load profile.", 500);
  }
}

/**
 * POST /api/account/profile
 * Updates name / brokerage and returns { success, user }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return jsonError("Not authenticated.", 401);
    }

    let body: { name?: string; brokerage?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid request body.", 400);
    }

    const name = body.name?.trim() || null;
    const brokerage = body.brokerage?.trim() || null;

    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: { name, brokerage },
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        brokerage: updated.brokerage,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    console.error("PROFILE POST ERROR →", err);
    return jsonError("Failed to update profile.", 500);
  }
}