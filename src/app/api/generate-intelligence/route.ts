import { NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  IntelligencePack,
  SellerPack,
  BuyerPack,
} from "@/lib/intelligence";

const openai = new OpenAI({
  apiKey: process.env.AVILLO_OPENAI_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { engine, notes, tool, ...context } = body;

    if (!engine) {
      return NextResponse.json(
        { error: "Missing engine type." },
        { status: 400 }
      );
    }

    let prompt = "";

    // ----------------------------
    // Prompt per Engine Type
    // ----------------------------
    if (engine === "listing") {
      prompt = `
You are an AI real estate assistant that transforms messy property notes into marketing-ready copy.

INPUT NOTES:
${notes}

OUTPUT JSON with fields exactly matching:
{
  "listing": {
    "long": "...",
    "short": "...",
    "bullets": ["..."]
  },
  "social": {
    "instagram_caption": "...",
    "facebook_post": "...",
    "linkedin_post": "...",
    "tiktok_hook": "...",
    "tiktok_script": "..."
  },
  "emails": {
    "buyer_email": "...",
    "seller_email": "..."
  },
  "talking_points": {
    "highlights": ["..."],
    "buyer_concerns": ["..."],
    "responses": ["..."]
  },
  "marketability": {
    "score_1_to_10": 7,
    "summary": "...",
    "improvement_suggestions": ["..."]
  },
  "open_house_pitch": "..."
}`;
    }

    if (engine === "seller") {
      prompt = `
You are an AI writing agent for real estate sellers. Tool = ${tool}.

Context:
${JSON.stringify(context, null, 2)}

Return JSON exactly shaped as:
{
  "prelisting": { "email1": "...", "email2": "...", "email3": "..." },
  "presentation": {
    "opening": "...", "questions": "...", "story": "...", "pricing": "...",
    "marketing": "...", "process": "...", "value": "...", "nextSteps": "..."
  },
  "objection": {
    "talkTrack": "...", "smsReply": "...", "emailFollowUp": "..."
  }
}`;
    }

    if (engine === "buyer") {
      prompt = `
You are an AI agent that helps real estate buyers with summaries, tours, and offers. Tool = ${tool}.

Context:
${JSON.stringify(context, null, 2)}

Return JSON exactly shaped as:
{
  "search": {
    "summary": "...",
    "nextSteps": "...",
    "smsFollowUp": "..."
  },
  "tour": {
    "recapEmail": "...",
    "highlights": "...",
    "concerns": "..."
  },
  "offer": {
    "offerEmail": "...",
    "strategySummary": "...",
    "negotiationPoints": "..."
  }
}`;
    }

    // ----------------------------
    // Call OpenAI
    // ----------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are Avillo’s AI engine. Respond only with valid JSON output matching the provided schema.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";

    // Safe JSON parsing
    let parsed: IntelligencePack | SellerPack | BuyerPack;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Error parsing AI response:", raw);
      parsed = {} as any;
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Error in /api/generate-intelligence:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
