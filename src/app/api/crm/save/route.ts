// src/app/api/crm/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContactPayload = {
  id?: string;

  // Core name + contact
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;

  // Pipeline + metadata
  stage?: string;          // "new" | "warm" | "hot" | "past"
  source?: string;
  tags?: string[];

  // Avillo CRM extras (make sure these exist on your Prisma Contact model)
  label?: string;          // e.g. "potential buy"
  type?: string;           // "Buyer" | "Seller" | "Past / sphere"
  priceRange?: string;
  areas?: string;
  timeline?: string;

  // Notes & touchpoints
  notes?: string;          // general notes (legacy)
  nextTouchDate?: string;
  lastTouchNote?: string;
  workingNotes?: string;
};

type ActivityPayload = {
  type: string;     // "note", "call", "stage_change", "updated", etc.
  summary?: string; // Human-readable summary
};

type SaveBody = {
  contact?: ContactPayload;
  activity?: ActivityPayload;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as SaveBody | null;

    if (!body || (!body.contact && !body.activity)) {
      return NextResponse.json(
        { error: "Nothing to save. Include contact and/or activity data." },
        { status: 400 }
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

    let contactId: string | undefined = body.contact?.id;
    let contactRecord: any = null;

    /* --------------------------
       CREATE OR UPDATE CONTACT
    --------------------------- */
    if (body.contact) {
      const {
        id,
        firstName,
        lastName,
        email,
        phone,
        stage,
        tags,
        notes,
        source,
        label,
        type,
        priceRange,
        areas,
        timeline,
        nextTouchDate,
        lastTouchNote,
        workingNotes,
      } = body.contact;

      const baseData = {
        firstName,
        lastName,
        email,
        phone,
        stage,
        tags: tags ?? [],
        notes,
        source,

        // extended CRM fields
        label,
        type,
        priceRange,
        areas,
        timeline,
        nextTouchDate,
        lastTouchNote,
        workingNotes,
      };

      if (id) {
        // UPDATE CONTACT
        contactRecord = await prisma.contact.update({
          where: { id },
          data: baseData,
        });

        contactId = contactRecord.id;

        // Log CRM activity for update
        await prisma.cRMActivity.create({
          data: {
            userId: user.id,
            contactId,
            type: "updated",
            summary:
              `Updated contact ${firstName ?? ""} ${lastName ?? ""}`.trim() ||
              "Updated contact",
            data: {},
          },
        });
      } else {
        // CREATE CONTACT
        contactRecord = await prisma.contact.create({
          data: {
            userId: user.id,
            stage: stage ?? "new",
            tags: tags ?? [],
            ...baseData,
          },
        });

        contactId = contactRecord.id;

        // Log CRM activity for creation
        await prisma.cRMActivity.create({
          data: {
            userId: user.id,
            contactId,
            type: "created",
            summary:
              `New contact: ${firstName ?? ""} ${lastName ?? ""}`.trim() ||
              "New contact added",
            data: {},
          },
        });
      }
    }

    /* --------------------------
       OPTIONAL: LOG ACTIVITY
    --------------------------- */
    let activityRecord = null;

    if (body.activity) {
      const { type, summary } = body.activity;

      if (!type) {
        return NextResponse.json(
          { error: "Activity type is required when logging an activity." },
          { status: 400 }
        );
      }

      activityRecord = await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contactId ?? null,
          type,
          summary:
            summary ||
            (type === "note"
              ? "New note added"
              : `Activity recorded: ${type}`),
          data: {},
        },
      });
    }

    return NextResponse.json({
      success: true,
      contact: contactRecord,
      activity: activityRecord,
    });
  } catch (err) {
    console.error("crm/save error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t save your CRM update. Try again or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}