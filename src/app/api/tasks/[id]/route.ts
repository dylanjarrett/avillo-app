// src/app/api/tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const body = (await req.json().catch(() => null)) as
      | { status?: "OPEN" | "DONE"; restore?: boolean }
      | null;

    // Restore flow (undo delete)
    if (body?.restore) {
      const updated = await prisma.task.updateMany({
        where: { id: params.id, userId: user.id },
        data: { deletedAt: null },
      });

      if (updated.count === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    const status = (body?.status || "DONE").toUpperCase() as "OPEN" | "DONE";

    const updated = await prisma.task.updateMany({
      where: {
        id: params.id,
        userId: user.id,
        deletedAt: null, // don't allow updating "deleted" tasks unless restored
      },
      data: {
        status,
        completedAt: status === "DONE" ? new Date() : null,
      },
    });

    if (updated.count === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/tasks/[id] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update task." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    // Soft delete
    const updated = await prisma.task.updateMany({
      where: { id: params.id, userId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (updated.count === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/tasks/[id] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete task." }, { status: 500 });
  }
}