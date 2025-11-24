// src/app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body.name ?? "").trim();
    const brokerage = (body.brokerage ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (!email.includes("@") || email.length > 120) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 400 }
      );
    }

    const passwordHash = await hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        brokerage: brokerage || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        user,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("signup error", err);
    return NextResponse.json(
      { error: "Something went wrong while creating your account." },
      { status: 500 }
    );
  }
}