// src/app/api/crm/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    raw?: string;
    processed?: string;
    type?: string;
  };

  const { raw, processed, type } = body;

  if (!processed) {
    return NextResponse.json(
      { error: "Missing processed AI text to save." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found in database." },
      { status: 404 }
    );
  }

  // Prisma model is CRMRecord -> client accessor is cRMRecord
  const saved = await prisma.cRMRecord.create({
    data: {
      userId: user.id,
      raw: raw ?? "",
      processed,
      type: type ?? "general",
    },
  });

  return NextResponse.json(
    {
      success: true,
      record: saved,
    },
    { status: 201 }
  );
}
