// src/app/api/intelligence/recent/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const outputs = await prisma.intelligenceOutput.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        engine: true,
        engineInput: true,
        inputSummary: true,
        preview: true,
        listingId: true,
        contactId: true,
      },
    });

    // Load attached listings / contacts for display (workspace-safe)
    const listingIds = Array.from(
      new Set(outputs.map((o) => o.listingId).filter((id): id is string => Boolean(id)))
    );
    const contactIds = Array.from(
      new Set(outputs.map((o) => o.contactId).filter((id): id is string => Boolean(id)))
    );

    const [listings, contacts] = await Promise.all([
      listingIds.length
        ? prisma.listing.findMany({
            where: { id: { in: listingIds }, workspaceId: ctx.workspaceId },
            select: { id: true, address: true },
          })
        : Promise.resolve([]),
      contactIds.length
        ? prisma.contact.findMany({
            where: { id: { in: contactIds }, workspaceId: ctx.workspaceId },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    const listingMap = new Map(listings.map((l) => [l.id, l.address ?? "Listing"]));
    const contactMap = new Map(
      contacts.map((c) => {
        const fullName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
        return [c.id, fullName || c.email || "Contact"];
      })
    );

    const entries = outputs.map((o) => {
      const label = engineLabelFromEnum(String(o.engine));
      const slug = engineSlugFromEnum(String(o.engine));

      let rawPrompt: string | undefined;
      if (o.engineInput && typeof o.engineInput === "object") {
        const ei = o.engineInput as any;
        if (typeof ei.prompt === "string" && ei.prompt.trim().length > 0) {
          rawPrompt = ei.prompt.trim();
        }
      }

      const snippetSource = rawPrompt || o.inputSummary || o.preview || "";
      const snippet = typeof snippetSource === "string" ? snippetSource.slice(0, 220) : "";

      let contextType: "listing" | "contact" | "none" = "none";
      let contextLabel: string | null = null;
      let contextId: string | null = null;

      // Only show context if the related object is found within workspace scope
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
    return NextResponse.json({ error: "Failed to load recent AI activity" }, { status: 500 });
  }
}