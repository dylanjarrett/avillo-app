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

    const body = await req.json();

    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 120) : undefined;
    const brokerage =
      typeof body.brokerage === "string"
        ? body.brokerage.trim().slice(0, 160)
        : undefined;
    const image =
      typeof body.image === "string" ? body.image.trim().slice(0, 255) : undefined;

    if (!name && !brokerage && !image) {
      return NextResponse.json(
        { error: "No profile fields to update." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const data: Record<string, any> = {};
    if (name !== undefined) data.name = name;
    if (brokerage !== undefined) data.brokerage = brokerage;
    if (image !== undefined) data.image = image;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
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
    });
  } catch (err) {
    console.error("PROFILE API ERROR → ", err);
    return NextResponse.json(
      { error: "Server error updating profile." },
      { status: 500 }
    );
  }
}