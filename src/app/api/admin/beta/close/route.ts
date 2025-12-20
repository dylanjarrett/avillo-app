// src/app/api/admin/beta/close/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return {
      ok: false as const,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { prisma } = await import("@/lib/prisma");

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, email: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return {
      ok: false as const,
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, session, dbUser };
}

/**
 * POST /api/admin/beta/close
 * Flips all beta users to expired (forces upgrade modal / gating everywhere).
 *
 * Safe + idempotent:
 * - Running it multiple times is fine; subsequent runs will update 0 users.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.errorResponse;

  try {
    const { prisma } = await import("@/lib/prisma");

    const result = await prisma.user.updateMany({
      where: { accessLevel: "BETA" as any },
      data: { accessLevel: "EXPIRED" as any },
    });

    // Optional: write an audit event (non-blocking)
    try {
      await prisma.cRMActivity.create({
        data: {
          userId: auth.dbUser.id,
          type: "beta_closed",
          summary: "Beta closed globally (BETA → EXPIRED)",
          data: {
            updatedCount: result.count,
            at: new Date().toISOString(),
          },
        },
      });
    } catch (e) {
      console.warn("[admin-beta-close] Failed to write audit:", e);
    }

    return NextResponse.json({
      ok: true,
      updatedCount: result.count,
      message: `Closed beta: ${result.count} user(s) moved from BETA → EXPIRED.`,
    });
  } catch (err) {
    console.error("[admin-beta-close] Error:", err);
    return NextResponse.json({ error: "Failed to close beta." }, { status: 500 });
  }
}