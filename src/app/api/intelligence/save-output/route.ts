// src/app/api/intelligence/save-output/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EngineWire = "listing" | "seller" | "buyer" | "neighborhood";
type ContextTypeWire = "listing" | "contact" | "none" | null | undefined;

interface SaveOutputBody {
  engine: EngineWire;
  userInput?: string | null;
  outputs: unknown;
  contextType?: ContextTypeWire;
  contextId?: string | null;
}

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

function derivePreview(engine: EngineWire, payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload.slice(0, 220);

  if (engine === "listing" && typeof payload === "object" && payload !== null) {
    const maybe: any = payload;
    const long = maybe?.listing?.long || maybe?.longMlsDescription || maybe?.long_mls_description;
    if (long && typeof long === "string") return long.slice(0, 220);
  }

  if (typeof payload === "object" && payload !== null) {
    const anyPayload: any = payload;
    const first = anyPayload.summary || anyPayload.description || anyPayload.overview || anyPayload.body;
    if (typeof first === "string") return first.slice(0, 220);

    try {
      return JSON.stringify(payload).slice(0, 220);
    } catch {
      return "";
    }
  }

  return "";
}

async function validateContextInWorkspace(opts: {
  workspaceId: string;
  contextType?: ContextTypeWire;
  contextId?: string | null;
}) {
  const { workspaceId, contextType, contextId } = opts;
  if (!contextType || contextType === "none" || !contextId) return;

  if (contextType === "listing") {
    const ok = await prisma.listing.findFirst({
      where: { id: contextId, workspaceId },
      select: { id: true },
    });
    if (!ok) throw new Error("Invalid listing context");
  }

  if (contextType === "contact") {
    const ok = await prisma.contact.findFirst({
      where: { id: contextId, workspaceId },
      select: { id: true },
    });
    if (!ok) throw new Error("Invalid contact context");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    // Pro-only entitlement (userId keyed)
    const gate = await requireEntitlement(ctx.workspaceId, "INTELLIGENCE_SAVE");
    if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

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

    // Validate context belongs to this workspace
    try {
      await validateContextInWorkspace({
        workspaceId: ctx.workspaceId,
        contextType,
        contextId,
      });
    } catch {
      return NextResponse.json({ error: "Invalid context" }, { status: 400 });
    }

    const cleanedPayload = deepClean(outputs) ?? {};

    let listingId: string | null = null;
    let contactId: string | null = null;

    if (contextType === "listing" && contextId) listingId = contextId;
    else if (contextType === "contact" && contextId) contactId = contextId;

    const engineEnum = mapEngineToEnum(engine);

    const inputSummary =
      userInput && userInput.trim().length > 0 ? userInput.trim().slice(0, 240) : null;

    const preview = derivePreview(engine, cleanedPayload);

    const created = await prisma.intelligenceOutput.create({
      data: {
        workspaceId: ctx.workspaceId,
        createdByUserId: ctx.userId,

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
      select: { id: true, createdAt: true },
    });

    return NextResponse.json(
      { id: created.id, engine: engineLabel(engine), createdAt: created.createdAt },
      { status: 201 }
    );
  } catch (err) {
    console.error("Intelligence save-output error", err);
    return NextResponse.json({ error: "Failed to save output" }, { status: 500 });
  }
}