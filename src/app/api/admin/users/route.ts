// src/app/api/admin/users/route.ts
import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole, SubscriptionPlan } from "@prisma/client";

async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { dbUser };
}

// GET all users
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("errorResponse" in authCheck) return authCheck.errorResponse;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
    });

    const payload = users.map((u) => ({
      id: u.id,
      name: u.name ?? "",
      email: u.email,
      brokerage: u.brokerage ?? "",
      role: u.role,                        // ENUM
      plan: u.plan,                        // ENUM
      openAITokensUsed: u.openAITokensUsed ?? 0,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ users: payload });
  } catch (err) {
    console.error("Admin GET users error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

// PATCH update role or plan
export async function PATCH(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("errorResponse" in authCheck) return authCheck.errorResponse;

  try {
    const body = await req.json();

    const { userId, role, plan } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const data: any = {};

    if (role) {
      if (!Object.values(UserRole).includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      data.role = role;
    }

    if (plan) {
      if (!Object.values(SubscriptionPlan).includes(plan)) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
      data.plan = plan;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
    });

    const payload = {
      id: updated.id,
      name: updated.name ?? "",
      email: updated.email,
      brokerage: updated.brokerage ?? "",
      role: updated.role,
      plan: updated.plan,
      openAITokensUsed: updated.openAITokensUsed ?? 0,
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };

    return NextResponse.json({ user: payload });
  } catch (err) {
    console.error("Admin PATCH user error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}