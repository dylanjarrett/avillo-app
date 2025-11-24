// src/app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const token = body.token ?? "";
  const password = body.password ?? "";

  if (!token || !password) {
    return NextResponse.json(
      { error: "Reset token and new password are required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters long." },
      { status: 400 }
    );
  }

  try {
    const verification = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (
      !verification ||
      !verification.identifier ||
      verification.expires < new Date()
    ) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const email = verification.identifier;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    const passwordHash = await hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Consume the token
    await prisma.verificationToken.delete({
      where: { token },
    });

    return NextResponse.json({
      success: true,
      message: "Password updated. You can now sign in with your new password.",
    });
  } catch (err) {
    console.error("reset-password error", err);
    return NextResponse.json(
      { error: "Something went wrong while resetting your password." },
      { status: 500 }
    );
  }
}
