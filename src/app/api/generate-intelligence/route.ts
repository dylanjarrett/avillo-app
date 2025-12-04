// src/app/api/generate-intelligence/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  IntelligencePack,
  SellerPack,
  BuyerPack,
  NeighborhoodPack,
} from "@/lib/intelligence";

const openai = new OpenAI({
  apiKey: process.env.AVILLO_OPENAI_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // engine = "listing" | "seller" | "buyer" | "neighborhood"
    const { engine, notes, tool, ...context } = body;

    if (!engine) {
      return NextResponse.json(
        { error: "Missing engine type." },
        { status: 400 }
      );
    }

    let prompt = "";

    // ----------------------------
    // LISTING ENGINE
    // ----------------------------
    if (engine === "listing") {
      prompt = `
You are an AI real estate assistant that transforms messy property notes into marketing-ready copy.

INPUT NOTES:
${notes || ""}

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

    // ----------------------------
    // SELLER ENGINE
    // ----------------------------
    if (engine === "seller") {
      prompt = `
You are an AI writing agent for real estate sellers. Tool = ${tool}.

Context from the agent:
${JSON.stringify(context, null, 2)}

Return JSON exactly shaped as:
{
  "prelisting": { "email1": "...", "email2": "...", "email3": "..." },
  "presentation": {
    "opening": "...",
    "questions": "...",
    "story": "...",
    "pricing": "...",
    "marketing": "...",
    "process": "...",
    "value": "...",
    "nextSteps": "..."
  },
  "objection": {
    "talkTrack": "...",
    "smsReply": "...",
    "emailFollowUp": "..."
  }
}`;
    }

    // ----------------------------
    // BUYER ENGINE
    // ----------------------------
    if (engine === "buyer") {
  prompt = `
You are an AI agent that helps real estate buyers across the full journey:
- onboarding / search recaps
- tour follow-ups
- offer strategy & negotiation

The current focus tool is: ${tool}.
You MUST still return a complete object for ALL three stages
("search", "tour", and "offer") so the agent can reuse the outputs later.

Context from the agent (buyer brief, tour notes, offer details, etc.):
${JSON.stringify(context, null, 2)}

Return JSON exactly shaped as:

{
  "search": {
    "recapEmail": "Polished email the agent can send the buyer recapping their search criteria, momentum, and agent plan.",
    "bulletSummary": "Bullet-point summary of budget, areas, must-haves, nice-to-haves, and any constraints.",
    "nextSteps": "Clear recommended next steps for the buyer (and what the agent will do next).",
    "smsFollowUp": "1–2 short SMS/DM style follow-up messages to keep the search warm.",

    // Backwards-compat: keep these for older canvases
    "summary": "Same or similar content as recapEmail, for legacy clients using the 'summary' field.",
    "questionsToAsk": "Optional list of questions the agent can ask on the next check-in."
  },
  "tour": {
    "recapEmail": "Email summarizing each home toured, how it landed for the buyer, and recommended direction.",
    "highlights": "Bulleted highlights from the tour (what resonated, what didn’t).",
    "concerns": "Bulleted list of concerns and open questions the buyer raised.",
    "decisionFrame": "Short narrative framing of options (pros/cons, tradeoffs, recommended path).",
    "nextSteps": "What happens after this tour (revisits, new searches, regroup call, etc.)."
  },
  "offer": {
    "offerEmail": "Email template to the buyer summarizing strategy and terms (or to the listing agent if appropriate).",
    "strategySummary": "Plain-language explanation of the offer strategy given the market and competition.",
    "negotiationPoints": "Bulleted list of talking points and levers (price, terms, credits, timelines, etc.).",
    "riskNotes": "Balanced explanation of risk, contingencies, and ways to protect the buyer.",
    "smsUpdate": "Short, reassuring SMS/DM the agent can send while drafting / submitting the offer."
  }
}`;
    }

    // ----------------------------
    // NEIGHBORHOOD ENGINE
    // ----------------------------
    if (engine === "neighborhood") {
      prompt = `
You are an AI assistant that creates neighborhood briefs for real estate agents.
The goal is to give a *narrative overview* buyers can read in emails, tours, or listing materials.
Do NOT invent precise statistics or guarantees. Be directional and always remind users to verify with official sources.

Agent context (may include ZIP code, city, neighborhood name, and buyer notes):
${JSON.stringify(context, null, 2)}

Return JSON exactly shaped as:

{
  "overview": {
    "areaSummary": "...",
    "whoItFits": "...",
    "priceVibe": "..."
    "talkingPoints": "Bullet-point style talking points the agent can reuse in emails, showings, and listing remarks."

  },
  "schools": {
    "schoolsOverview": "...",
    "notableSchools": "...",
    "schoolsDisclaimer": "Always verify school boundaries, ratings, and programs with official district and state sources."
  },
  "mobility": {
    "walkability": "...",
    "bikeability": "...",
    "transitOverview": "...",
    "drivingAccess": "...",
    "airports": "...",
    "commuteExamples": "..."
  },
  "essentials": {
    "groceries": "...",
    "gyms": "...",
    "errands": "...",
    "healthcare": "..."
  },
  "lifestyle": {
    "parksAndOutdoors": "...",
    "diningNightlife": "...",
    "familyActivities": "...",
    "safetyOverview": "...",
    "safetyDisclaimer": "This is a general lifestyle and safety overview only. For crime and safety information, buyers must review official crime maps, local police resources, and municipal data." 
    }
}`;
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "Unsupported engine type." },
        { status: 400 }
      );
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
            "You are Avillo’s AI engine. Respond ONLY with valid JSON output matching the provided schema. Do not include explanations.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";

    // Safe JSON parsing
    let parsed: IntelligencePack | SellerPack | BuyerPack | NeighborhoodPack;
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