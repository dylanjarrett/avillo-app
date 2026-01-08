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

/* ------------------------------------
 * Fair Housing / NAR compliance guardrails
 *
 * Behavior (minimal + predictable):
 * - HARD hits => block with 422 + compliance hits
 * - SOFT hits => silently rewritten (no banner payload on success)
 * -----------------------------------*/

type ComplianceHit = { type: "HARD" | "SOFT"; match: string; rule: string };

const HARD_BLOCK_REGEXES: Array<{ rule: string; re: RegExp }> = [
  // Explicit preference/limitation
  {
    rule: "Explicit exclusion/inclusion (children)",
    re: /\b(no\s+kids|no\s+children|adults?\s+only|singles?\s+only)\b/i,
  },
  {
    rule: "Explicit protected-class preference",
    re: /\b(whites?\s+only|christians?\s+only|jews?\s+only|muslims?\s+only|mexicans?\s+only|asians?\s+only)\b/i,
  },
  {
    rule: "Discriminatory preference wording",
    re: /\b(prefer(?:s|red)?\s+(?:christian|white|black|asian|latino|lgbt|gay|straight)|ideal\s+for\s+(?:christian|white|black|asian|latino))\b/i,
  },

  // Protected-class keywords (treat as hard block inside marketing generation)
  {
    rule: "Protected-class keyword present",
    re: /\b(race|racial|ethnic|ethnicity|religion|church|synagogue|mosque|temple|nationality|national\s+origin|disabled|disability|handicap|wheelchair|sex\b|gender\s+identity|sexual\s+orientation|lgbtq|gay|lesbian|transgender|familial\s+status)\b/i,
  },

  // Steering language
  {
    rule: "Steering: who should live here",
    re: /\b(perfect\s+for\s+(?:families|kids|young\s+professionals|students|retirees|empty\s+nesters|singles)|great\s+for\s+(?:families|kids|retirees|students)|not\s+for\s+(?:families|kids|students))\b/i,
  },
];

const SOFT_REWRITE_REGEXES: Array<{
  rule: string;
  re: RegExp;
  replace: (m: string) => string;
}> = [
  // Safety/crime claims → redirect to verification
  {
    rule: "Safety/crime claims",
    re: /\b(safe|safer|safest|low\s+crime|crime[-\s]?free|high\s+crime|unsafe|secure\s+neighborhood)\b/gi,
    replace: () =>
      "buyers should review official local resources for crime and safety information",
  },

  // School quality claims → neutral + verify
  {
    rule: "School quality superlatives",
    re: /\b(best\s+schools?|top[-\s]?rated\s+schools?|great\s+schools?|award[-\s]?winning\s+schools?)\b/gi,
    replace: () =>
      "near local schools (buyers should verify boundaries, ratings, and enrollment eligibility with official sources)",
  },

  // Demographic targeting (non-protected but steering risk) → broad framing
  {
    rule: "Demographic targeting (age/life stage)",
    re: /\b(young\s+professionals?|retirees?|empty\s+nesters?|students?|singles?)\b/gi,
    replace: () => "a wide range of buyers",
  },

  // Family-friendly phrasing → amenity-based
  {
    rule: "Family-friendly phrasing",
    re: /\b(family[-\s]?friendly|great\s+for\s+families|perfect\s+for\s+families)\b/gi,
    replace: () => "offers nearby amenities and flexible living space",
  },
];

function collectComplianceHits(text: string): ComplianceHit[] {
  const hits: ComplianceHit[] = [];
  if (!text) return hits;

  for (const { rule, re } of HARD_BLOCK_REGEXES) {
    const m = text.match(re);
    if (m?.[0]) hits.push({ type: "HARD", match: m[0], rule });
  }

  for (const { rule, re } of SOFT_REWRITE_REGEXES) {
    const m = text.match(re);
    if (m?.[0]) hits.push({ type: "SOFT", match: m[0], rule });
  }

  return hits;
}

function sanitizeText(text: string): { text: string; hits: ComplianceHit[] } {
  let out = text || "";
  const hits = collectComplianceHits(out);

  // Apply soft rewrites (silent)
  for (const { re, replace } of SOFT_REWRITE_REGEXES) {
    out = out.replace(re, (m) => replace(m));
  }

  return { text: out, hits };
}

function deepSanitize<T>(
  value: T,
  allHits: ComplianceHit[] = []
): { value: T; hits: ComplianceHit[] } {
  if (typeof value === "string") {
    const { text, hits } = sanitizeText(value);
    allHits.push(...hits);
    return { value: text as unknown as T, hits: allHits };
  }

  if (Array.isArray(value)) {
    const next = value.map((v) => deepSanitize(v, allHits).value);
    return { value: next as unknown as T, hits: allHits };
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, any>;
    const next: Record<string, any> = {};
    for (const k of Object.keys(obj)) {
      const res = deepSanitize(obj[k], allHits);
      next[k] = res.value;
    }
    return { value: next as T, hits: allHits };
  }

  return { value, hits: allHits };
}

function hasHardHit(hits: ComplianceHit[]) {
  return hits.some((h) => h.type === "HARD");
}

/* ------------------------------------
 * Prompts
 * -----------------------------------*/

function complianceSystemPreamble() {
  return `
You are Avillo’s Intelligence engine for real estate professionals.

COMPLIANCE (NON-NEGOTIABLE):
- Do NOT reference, target, prefer, exclude, or imply ANY protected class or demographic group.
- Do NOT say or imply who a home/neighborhood is "perfect for" based on people (age, family status, religion, race, etc.).
- Avoid crime/safety claims (e.g., "safe", "low crime"). If asked, redirect to official sources.
- Avoid school quality rankings/superlatives. If mentioning schools, keep it neutral and instruct buyers to verify boundaries/ratings with official sources.
- Stick to objective property features, amenities, geography, commuting access, and neutral lifestyle descriptors.

OUTPUT:
- Respond ONLY with valid JSON matching the provided schema. No extra keys, no markdown, no commentary.
`.trim();
}

function buildPrompt(engine: string, notes: unknown, tool: unknown, context: any) {
  if (engine === "listing") {
    return `
You transform messy property notes into marketing-ready copy that is property/amenity focused and compliant.

INPUT NOTES:
${typeof notes === "string" ? notes : ""}

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
}`.trim();
  }

  if (engine === "seller") {
    return `
You are an AI writing agent for real estate sellers. Tool = ${
      typeof tool === "string" ? tool : ""
    }.

Context from the agent:
${JSON.stringify(context ?? {}, null, 2)}

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
}`.trim();
  }

  if (engine === "buyer") {
    return `
You help real estate buyers across the full journey:
- onboarding / search recaps
- tour follow-ups
- offer strategy & negotiation

The current focus tool is: ${typeof tool === "string" ? tool : ""}.
You MUST still return a complete object for ALL three stages ("search", "tour", and "offer").

Context from the agent:
${JSON.stringify(context ?? {}, null, 2)}

Return JSON exactly shaped as:
{
  "search": {
    "recapEmail": "...",
    "bulletSummary": "...",
    "nextSteps": "...",
    "smsFollowUp": "...",
    "summary": "...",
    "questionsToAsk": "..."
  },
  "tour": {
    "recapEmail": "...",
    "highlights": "...",
    "concerns": "...",
    "decisionFrame": "...",
    "nextSteps": "..."
  },
  "offer": {
    "offerEmail": "...",
    "strategySummary": "...",
    "negotiationPoints": "...",
    "riskNotes": "...",
    "smsUpdate": "..."
  }
}`.trim();
  }

  if (engine === "neighborhood") {
    return `
You create neighborhood briefs for real estate agents.
Goal: a narrative overview buyers can read in emails, tours, or listing materials.

Rules:
- Do NOT invent precise statistics or guarantees.
- Do NOT describe demographics or who "belongs" here.
- "whoItFits" must be lifestyle-only (commute patterns, amenities, architecture, outdoors, dining), never people-groups.

Agent context:
${JSON.stringify(context ?? {}, null, 2)}

Return JSON exactly shaped as:
{
  "overview": {
    "areaSummary": "...",
    "whoItFits": "...",
    "priceVibe": "...",
    "talkingPoints": "..."
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
}`.trim();
  }

  return "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { engine, notes, tool, ...context } = body as Record<string, any>;

    if (!engine || typeof engine !== "string") {
      return NextResponse.json({ error: "Missing engine type." }, { status: 400 });
    }

    // ----------------------------
    // Pre-check user inputs (HARD only)
    // ----------------------------
    const inputText = [
      typeof notes === "string" ? notes : "",
      JSON.stringify(context ?? {}, null, 2),
      typeof tool === "string" ? tool : "",
      engine,
    ].join("\n\n");

    const inputHits = collectComplianceHits(inputText);
    if (hasHardHit(inputHits)) {
      return NextResponse.json(
        {
          error:
            "Potential Fair Housing / ethics risk detected in the input. Please remove demographic targeting, protected-class references, or steering language and try again.",
          compliance: {
            level: "HARD_BLOCK",
            hits: inputHits.filter((h) => h.type === "HARD").slice(0, 10),
          },
        },
        { status: 422 }
      );
    }

    const prompt = buildPrompt(engine, notes, tool, context);
    if (!prompt) {
      return NextResponse.json(
        { error: "Unsupported engine type." },
        { status: 400 }
      );
    }

    // ----------------------------
    // OpenAI (strict JSON)
    // ----------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: complianceSystemPreamble() },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";

    let parsed: IntelligencePack | SellerPack | BuyerPack | NeighborhoodPack;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("Error parsing AI response:", raw);
      return NextResponse.json(
        { error: "AI returned invalid JSON.", rawSnippet: raw.slice(0, 500) },
        { status: 502 }
      );
    }

    // ----------------------------
    // Post-check + sanitize model output
    // - SOFT rewrites applied silently
    // - HARD hits in output => block
    // ----------------------------
    const { value: sanitized, hits: outputHits } = deepSanitize(parsed);

    const hardOutput = outputHits.filter((h) => h.type === "HARD");
    if (hardOutput.length > 0) {
      console.warn("Compliance HARD_BLOCK (output):", hardOutput.slice(0, 10));
      return NextResponse.json(
        {
          error:
            "Potential Fair Housing / ethics risk detected in AI output. Try rephrasing inputs to focus on property features and neutral location details.",
          compliance: { level: "HARD_BLOCK", hits: hardOutput.slice(0, 10) },
        },
        { status: 422 }
      );
    }

    const softOutput = outputHits.filter((h) => h.type === "SOFT");
    if (softOutput.length > 0) {
      console.info("Compliance SOFT_REWRITE applied:", softOutput.slice(0, 10));
    }

    return NextResponse.json(sanitized);
  } catch (err: any) {
    console.error("Error in /api/generate-intelligence:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}