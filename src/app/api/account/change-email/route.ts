import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const { newEmail, password } = await req.json();

    if (!newEmail || !password) {
      return NextResponse.json(
        { error: "New email and password required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error:
            "This account uses Google login. Contact support@avillo.io to update your email.",
        },
        { status: 400 }
      );
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect password." },
        { status: 400 }
      );
    }

    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "That is already your email." },
        { status: 400 }
      );
    }

    const exists = await prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() },
    });

    if (exists) {
      return NextResponse.json(
        { error: "Email already in use." },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail.toLowerCase() },
    });

    return NextResponse.json({
      success: true,
      message: "Email updated. Please log in again.",
    });
  } catch (err) {
    console.error("CHANGE EMAIL API ERROR → ", err);
    return NextResponse.json(
      { error: "Server error updating email." },
      { status: 500 }
    );
  }
}