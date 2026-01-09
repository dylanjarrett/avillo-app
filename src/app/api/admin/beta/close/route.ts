import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    select: { id: true, role: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return {
      ok: false as const,
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, dbUser };
}

/**
 * POST /api/admin/beta/close
 * Flips all BETA users to EXPIRED (forces upgrade gating everywhere).
 * Safe + idempotent.
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