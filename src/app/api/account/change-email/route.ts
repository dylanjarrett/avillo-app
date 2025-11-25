// src/app/api/account/change-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const newEmail = (body.newEmail ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!newEmail || !password) {
    return NextResponse.json(
      { error: "New email and password required" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  if (!user.passwordHash) {
    return NextResponse.json(
      {
        error:
          "This account uses Google login. Contact support@avillo.io to change email.",
      },
      { status: 400 }
    );
  }

  const matches = await compare(password, user.passwordHash);
  if (!matches) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 400 }
    );
  }

  const exists = await prisma.user.findUnique({
    where: { email: newEmail },
  });

  if (exists) {
    return NextResponse.json(
      { error: "Email already in use" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { email: newEmail },
  });

  return NextResponse.json({
    success: true,
    message: "Email updated. Please log back in.",
  });
}
