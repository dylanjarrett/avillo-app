// src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET  -> return current profile details
 * POST -> update profile details (name, brokerage, image)
 */

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      brokerage: true,
      image: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 }
    );
  }

  let body: {
    name?: string;
    brokerage?: string;
    image?: string;
  } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const updates: {
    name?: string | null;
    brokerage?: string | null;
    image?: string | null;
  } = {};

  if (typeof body.name === "string") {
    updates.name = body.name.trim() || null;
  }
  if (typeof body.brokerage === "string") {
    updates.brokerage = body.brokerage.trim() || null;
  }
  if (typeof body.image === "string") {
    updates.image = body.image.trim() || null;
  }

  try {
    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: updates,
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        image: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updated,
      message: "Profile updated.",
    });
  } catch (err) {
    console.error("PROFILE UPDATE ERROR →", err);
    return NextResponse.json(
      { error: "Something went wrong updating your profile." },
      { status: 500 }
    );
  }
}
