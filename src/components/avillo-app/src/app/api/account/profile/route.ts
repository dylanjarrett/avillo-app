// src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import authOptions from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { name?: string; brokerage?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const brokerage = (body.brokerage ?? "").trim();

  if (!name) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 }
    );
  }

  // Soft limits – just to guard against nonsense
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

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        brokerage: updated.brokerage,
      },
    });
  } catch (err) {
    console.error("update-profile error", err);
    return NextResponse.json(
      { error: "Something went wrong updating your profile." },
      { status: 500 }
    );
  }
}