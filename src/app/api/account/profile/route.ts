// src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ------- GET: fetch current profile -------
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    // Build a safe payload (don’t leak hashes, etc.)
    const profile = {
      id: user.id,
      name: user.name,
      email: user.email,
      // brokerage is optional – if your schema doesn’t have it, this will just be undefined
      brokerage: user.brokerage ?? null,
      createdAt: user.createdAt,
    };

    return NextResponse.json({ success: true, user: profile });
  } catch (err) {
    console.error("profile GET error", err);
    return NextResponse.json(
      { error: "Something went wrong loading your profile." },
      { status: 500 }
    );
  }
}

// ------- POST: update profile (name + brokerage) -------
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 }
    );
  }

  let body: { name?: string; brokerage?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const name = (body.name ?? "").trim();
  const brokerage = (body.brokerage ?? "").trim();

  if (!name) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 }
    );
  }

  if (name.length > 80) {
    return NextResponse.json(
      { error: "Name is too long." },
      { status: 400 }
    );
  }

  if (brokerage.length > 120) {
    return NextResponse.json(
      { error: "Brokerage is too long." },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        name,
        brokerage: brokerage || null,
      },
    });

    const safeUser = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      brokerage: updated.brokerage ?? null,
    };

    return NextResponse.json({ success: true, user: safeUser });
  } catch (err) {
    console.error("update-profile error", err);
    return NextResponse.json(
      { error: "Something went wrong updating your profile." },
      { status: 500 }
    );
  }
}
