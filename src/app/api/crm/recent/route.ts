// src/app/api/crm/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    const activities = await prisma.cRMActivity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        contact: true,
      },
    });

    const items = activities.map((a) => ({
      id: a.id,
      type: a.type,
      summary: a.summary,
      createdAt: a.createdAt,
      contact: a.contact
        ? {
            id: a.contact.id,
            firstName: a.contact.firstName,
            lastName: a.contact.lastName,
            email: a.contact.email,
            stage: a.contact.stage,
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (err) {
    console.error("crm/recent error:", err);
    return NextResponse.json(
      {
        error:
          "Couldn’t load recent activity. Try again, or contact support@avillo.io if it continues.",
      },
      { status: 500 }
    );
  }
}
