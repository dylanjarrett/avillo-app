// src/app/api/password/reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string; token?: string; newPassword?: string };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const email = body.email?.trim().toLowerCase();
    const token = body.token;
    const newPassword = body.newPassword;

    if (!email || !token || !newPassword) {
      return NextResponse.json(
        { error: "Email, token, and new password are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    // Get user with reset fields
    const user = (await prisma.user.findUnique({
      where: { email },
    } as any)) as any;

    if (!user || !user.resetToken || !user.resetTokenExp) {
      return NextResponse.json(
        { error: "Invalid or expired reset link." },
        { status: 400 }
      );
    }

    if (user.resetTokenExp.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Reset link has expired." },
        { status: 400 }
      );
    }

    const isMatch = await compare(token, user.resetToken);
    if (!isMatch) {
      return NextResponse.json(
        { error: "Invalid or expired reset link." },
        { status: 400 }
      );
    }

    // All good – update password + clear reset fields
    const newHash = await hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        resetToken: null,
        resetTokenExp: null,
      } as any,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("password reset error:", err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}