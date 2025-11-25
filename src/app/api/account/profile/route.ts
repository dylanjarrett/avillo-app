// src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
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

    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        name: name || null,
        brokerage: brokerage || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        brokerage: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Profile updated.",
        user: updated,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("PROFILE UPDATE ERROR → ", err);
    return NextResponse.json(
      { error: "Something went wrong updating your profile." },
      { status: 500 }
    );
  }
}