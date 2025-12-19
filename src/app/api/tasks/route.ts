import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";


async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}


function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}


export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ tasks: [] });

    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ tasks: [] });


    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "today"; // today | overdue | all | week
    const status = (url.searchParams.get("status") || "OPEN").toUpperCase(); // OPEN | DONE
    const contactId = url.searchParams.get("contactId");
    const listingId = url.searchParams.get("listingId");

    const now = new Date();
    let dueFilter: any = {};
    if (scope === "today") {
      dueFilter = { dueAt: { gte: startOfDay(now), lte: endOfDay(now) } };
    } else if (scope === "overdue") {
      dueFilter = { dueAt: { lt: startOfDay(now) } };
    } else if (scope === "week") {
      const start = startOfDay(now);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      dueFilter = { dueAt: { gte: start, lt: end } };
    } // all => no dueAt filter


    const includeDeleted = url.searchParams.get("includeDeleted") === "1";

    const where: any = {
      userId: user.id,
      status,
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(contactId ? { contactId } : {}),
      ...(listingId ? { listingId } : {}),
      ...(scope === "all" ? {} : dueFilter),
    };


    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        listing: { select: { id: true, address: true } },
      },
    });


    const shaped = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes ?? "",
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      status: t.status,
      source: t.source,
      contact: t.contact
        ? {
            id: t.contact.id,
            name:
              `${(t.contact.firstName ?? "").trim()} ${(t.contact.lastName ?? "").trim()}`.trim() ||
              t.contact.email ||
              "Contact",
          }
        : null,
      listing: t.listing ? { id: t.listing.id, address: t.listing.address ?? "Listing" } : null,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    }));


    return NextResponse.json({ tasks: shaped });
  } catch (err) {
    console.error("/api/tasks GET error:", err);
    return NextResponse.json({ tasks: [] }, { status: 200 });
  }
}


type CreateTaskBody = {
  title?: string;
  notes?: string;
  dueAt?: string | null;
  contactId?: string | null;
  listingId?: string | null;
  source?: "PEOPLE_NOTE" | "AUTOPILOT" | "MANUAL";
};


export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }


    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });


    const body = (await req.json().catch(() => null)) as CreateTaskBody | null;
    if (!body?.title || !body.title.trim()) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }


    let due: Date | null = null;
    if (body.dueAt) {
      const parsed = new Date(body.dueAt);
      if (!isNaN(parsed.getTime())) due = parsed;
    }


    const task = await prisma.task.create({
      data: {
        userId: user.id,
        contactId: body.contactId ?? null,
        listingId: body.listingId ?? null,
        title: body.title.trim(),
        notes: body.notes?.trim() || null,
        dueAt: due,
        source: (body.source as any) ?? "MANUAL",
        status: "OPEN",
      },
    });


    return NextResponse.json({
      task: {
        id: task.id,
        title: task.title,
        notes: task.notes ?? "",
        dueAt: task.dueAt ? task.dueAt.toISOString() : null,
        status: task.status,
        source: task.source,
        createdAt: task.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("/api/tasks POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t create this task. Try again, or email support@avillo.io." },
      { status: 500 }
    );
  }
}