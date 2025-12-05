import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type EngineWire = "listing" | "seller" | "buyer" | "neighborhood";
type ContextTypeWire = "listing" | "contact" | "none" | null | undefined;

interface SaveOutputBody {
  engine: EngineWire;
  userInput?: string | null;
  outputs: unknown;
  contextType?: ContextTypeWire;
  contextId?: string | null;
}

interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

// Map UI engine -> prisma enum
function mapEngineToEnum(engine: EngineWire): "LISTING" | "SELLER" | "BUYER" | "NEIGHBORHOOD" {
  switch (engine) {
    case "listing": return "LISTING";
    case "seller": return "SELLER";
    case "buyer": return "BUYER";
    case "neighborhood": return "NEIGHBORHOOD";
    default: return "LISTING";
  }
}

function engineLabel(engine: EngineWire): string {
  switch (engine) {
    case "listing": return "Listing Engine";
    case "seller": return "Seller Studio";
    case "buyer": return "Buyer Studio";
    case "neighborhood": return "Neighborhood Engine";
    default: return "Engine";
  }
}

// Remove undefined/null keys recursively to prevent prisma JSON errors
function deepClean(obj: any): any {
  if (obj === null || obj === undefined) return undefined;

  if (Array.isArray(obj)) {
    const cleaned = obj.map((v) => deepClean(v)).filter((v) => v !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }

  if (typeof obj === "object") {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const v = deepClean(value);
      if (v !== undefined) cleaned[key] = v;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  return obj;
}

// Extract a preview text
function derivePreview(engine: EngineWire, payload: unknown): string {
  if (!payload) return "";

  if (typeof payload === "string") return payload.slice(0, 220);

  if (engine === "listing" && typeof payload === "object" && payload !== null) {
    const maybe: any = payload;
    const long =
      maybe?.listing?.long ||
      maybe?.longMlsDescription ||
      maybe?.long_mls_description;
    if (long && typeof long === "string") return long.slice(0, 220);
  }

  if (typeof payload === "object" && payload !== null) {
    const anyPayload: any = payload;

    const first =
      anyPayload.summary ||
      anyPayload.description ||
      anyPayload.overview ||
      anyPayload.body;

    if (typeof first === "string") return first.slice(0, 220);

    try {
      return JSON.stringify(payload).slice(0, 220);
    } catch {
      return "";
    }
  }

  return "";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as SessionUser | undefined)?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: SaveOutputBody;
    try {
      body = (await req.json()) as SaveOutputBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { engine, userInput, outputs, contextType, contextId } = body;

    const allowedEngines: EngineWire[] = ["listing", "seller", "buyer", "neighborhood"];
    if (!engine || !allowedEngines.includes(engine)) {
      return NextResponse.json({ error: "Invalid engine type" }, { status: 400 });
    }

    // ---------------------------------------
    // ★ DEEP CLEAN OUTPUT PAYLOAD (critical)
    // ---------------------------------------
    const cleanedPayload = deepClean(outputs) ?? {};

    // Normalize context
    let listingId: string | null = null;
    let contactId: string | null = null;

    if (contextType === "listing" && contextId) listingId = contextId;
    else if (contextType === "contact" && contextId) contactId = contextId;

    const engineEnum = mapEngineToEnum(engine);

    const inputSummary =
      userInput && userInput.trim().length > 0
        ? userInput.trim().slice(0, 240)
        : null;

    const preview = derivePreview(engine, cleanedPayload);

    // Save record
    const created = await prisma.intelligenceOutput.create({
      data: {
        userId,
        engine: engineEnum,
        listingId,
        contactId,
        engineInput: {
          prompt: userInput ?? null,
          contextType: contextType ?? "none",
          contextId: contextId ?? null,
        },
        inputSummary,
        payload: cleanedPayload,
        preview: preview || null,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        engine: engineLabel(engine),
        createdAt: created.createdAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Intelligence save-output error", err);
    return NextResponse.json({ error: "Failed to save output" }, { status: 500 });
  }
}