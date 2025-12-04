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

// tiny helper so TS is happy about session.user.id
interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

// map UI engine slug -> Prisma enum value
function mapEngineToEnum(engine: EngineWire): "LISTING" | "SELLER" | "BUYER" | "NEIGHBORHOOD" {
  switch (engine) {
    case "listing":
      return "LISTING";
    case "seller":
      return "SELLER";
    case "buyer":
      return "BUYER";
    case "neighborhood":
      return "NEIGHBORHOOD";
    default:
      return "LISTING";
  }
}

// nice label for history / CRM
function engineLabel(engine: EngineWire): string {
  switch (engine) {
    case "listing":
      return "Listing Engine";
    case "seller":
      return "Seller Studio";
    case "buyer":
      return "Buyer Studio";
    case "neighborhood":
      return "Neighborhood Engine";
    default:
      return "Engine";
  }
}

// quick preview of the output blob for history cards
function derivePreview(engine: EngineWire, payload: unknown): string {
  if (!payload) return "";

  if (typeof payload === "string") return payload.slice(0, 220);

  // try to match your listing pack structure
  if (engine === "listing" && typeof payload === "object" && payload !== null) {
    const maybe: any = payload;
    const long =
      (maybe.listing?.long as string | undefined) ||
      (maybe.longMlsDescription as string | undefined) ||
      (maybe.long_mls_description as string | undefined);

    if (long) return long.slice(0, 220);
  }

  if (typeof payload === "object" && payload !== null) {
    const anyPayload: any = payload;
    const firstText =
      anyPayload.summary ||
      anyPayload.description ||
      anyPayload.overview ||
      anyPayload.body ||
      "";

    if (typeof firstText === "string" && firstText.length > 0) {
      return firstText.slice(0, 220);
    }

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
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { engine, userInput, outputs, contextType, contextId } = body;

    const allowedEngines: EngineWire[] = [
      "listing",
      "seller",
      "buyer",
      "neighborhood",
    ];
    if (!engine || !allowedEngines.includes(engine)) {
      return NextResponse.json(
        { error: "Invalid engine type" },
        { status: 400 }
      );
    }

    // ---- normalize context ----
    let listingId: string | null = null;
    let contactId: string | null = null;

    if (contextType === "listing" && contextId) {
      listingId = contextId;
    } else if (contextType === "contact" && contextId) {
      contactId = contextId;
    }

    const engineEnum = mapEngineToEnum(engine);

    const inputSummary =
      userInput && userInput.trim().length > 0
        ? userInput.trim().slice(0, 240)
        : null;

    const preview = derivePreview(engine, outputs);

    // store the run
    const created = await prisma.intelligenceOutput.create({
      data: {
        userId,
        engine: engineEnum as any, // keep TS simple
        listingId,
        contactId,
        engineInput: {
          prompt: userInput ?? null,
          contextType: contextType ?? "none",
          contextId: contextId ?? null,
        },
        inputSummary,
        payload: outputs as any,
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
    return NextResponse.json(
      { error: "Failed to save output" },
      { status: 500 }
    );
  }
}