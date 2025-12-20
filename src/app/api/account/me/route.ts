// src/app/api/account/me/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEntitlementsForUserId } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as SessionUser | undefined)?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Lazy-import Prisma (keeps it out of build-time evaluation / edge confusion)
    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true as any,

        accessLevel: true as any,
        plan: true as any,
        subscriptionStatus: true as any,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const entitlements = await getEntitlementsForUserId(userId);

    // Prevent any caching (important for plan changes / upgrades)
    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name ?? "",
          email: user.email,
          role: user.role,

          accessLevel: user.accessLevel,
          plan: user.plan,
          subscriptionStatus: user.subscriptionStatus,
        },
        entitlements,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    console.error("/api/account/me GET error:", err);
    return NextResponse.json({ error: "Failed to load account" }, { status: 500 });
  }
}