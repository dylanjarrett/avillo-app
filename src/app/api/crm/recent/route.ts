// src/app/api/crm/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ records: [] }, { status: 200 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const take = Math.min(Math.max(Number(limitParam || "6"), 1), 20);

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ records: [] }, { status: 200 });
  }

  const records = await prisma.cRMRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take,
  });

  const summaries = records.map((r) => ({
    id: r.id,
    type: r.type,
    preview: r.processed.slice(0, 180),
    createdAt: r.createdAt.toISOString(),
    createdAtFormatted: r.createdAt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  }));

  return NextResponse.json({ records: summaries });
}
