import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

function engineLabelFromEnum(engine: string): string {
  switch (engine) {
    case "LISTING":
      return "Listing Engine";
    case "SELLER":
      return "Seller Studio";
    case "BUYER":
      return "Buyer Studio";
    case "NEIGHBORHOOD":
      return "Neighborhood Engine";
    default:
      return "Engine";
  }
}

function engineSlugFromEnum(
  engine: string
): "listing" | "seller" | "buyer" | "neighborhood" | "unknown" {
  switch (engine) {
    case "LISTING":
      return "listing";
    case "SELLER":
      return "seller";
    case "BUYER":
      return "buyer";
    case "NEIGHBORHOOD":
      return "neighborhood";
    default:
      return "unknown";
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as SessionUser | undefined)?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const outputs = await prisma.intelligenceOutput.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Load attached listings / contacts for display
    const listingIds = Array.from(
      new Set(
        outputs
          .map((o) => o.listingId)
          .filter((id): id is string => Boolean(id))
      )
    );
    const contactIds = Array.from(
      new Set(
        outputs
          .map((o) => o.contactId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const listings =
      listingIds.length > 0
        ? await prisma.listing.findMany({
            where: { id: { in: listingIds } },
            select: { id: true, address: true },
          })
        : [];

    const contacts =
      contactIds.length > 0
        ? await prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];

    const listingMap = new Map(listings.map((l) => [l.id, l.address]));
    const contactMap = new Map(
  contacts.map(c => {
    const fullName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    return [c.id, fullName];
  })
);

    const entries = outputs.map((o) => {
  const label = engineLabelFromEnum(o.engine as string);
  const slug = engineSlugFromEnum(o.engine as string);

  let rawPrompt: string | undefined;
  if (o.engineInput && typeof o.engineInput === "object") {
    const ei = o.engineInput as any;
    if (typeof ei.prompt === "string" && ei.prompt.trim().length > 0) {
      rawPrompt = ei.prompt.trim();
    }
  }

  const snippetSource =
    rawPrompt || o.inputSummary || o.preview || "";

  const snippet =
    typeof snippetSource === "string"
      ? snippetSource.slice(0, 220)
      : "";

  let contextType: "listing" | "contact" | "none" = "none";
  let contextLabel: string | null = null;
  let contextId: string | null = null;

  if (o.listingId) {
    contextType = "listing";
    contextId = o.listingId;
    contextLabel = listingMap.get(o.listingId) ?? null;
  } else if (o.contactId) {
    contextType = "contact";
    contextId = o.contactId;
    contextLabel = contactMap.get(o.contactId) ?? null;
  }

  return {
    id: o.id,
    createdAt: o.createdAt,
    engine: label,
    engineSlug: slug,
    // IMPORTANT: title is now just the engine label,
    // not the user input summary
    title: label,
    snippet,
    prompt: rawPrompt || "",
    contextType,
    contextId,
    contextLabel,
  };
});

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("Intelligence recent error", err);
    return NextResponse.json(
      { error: "Failed to load recent AI activity" },
      { status: 500 }
    );
  }
}
