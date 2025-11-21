import { NextResponse } from "next/server";
import OpenAI from "openai";

// Use a unique env var name so we don't conflict with any global OPENAI_API_KEY
const client = new OpenAI({
  apiKey: process.env.AVILLO_OPENAI_KEY,
});

export async function POST(req: Request) {
  try {
    const { propertyText } = (await req.json()) as { propertyText?: string };

    if (!client.apiKey) {
      console.error("Missing AVILLO_OPENAI_KEY");
      return NextResponse.json(
        { error: "Missing AVILLO_OPENAI_KEY on server" },
        { status: 500 }
      );
    }

    if (!propertyText || !propertyText.trim()) {
      return NextResponse.json(
        { error: "Missing propertyText" },
        { status: 400 }
      );
    }

    const prompt = `
You are Avillo, an AI assistant that writes real estate marketing copy for agents.

Using the property details below, generate a full "intelligence pack" of marketing content.

Property:
${propertyText}

Return a SINGLE JSON object with EXACTLY this shape:

{
  "listing": {
    "long": "Long MLS-style description...",
    "short": "Short 1–2 sentence description...",
    "bullets": ["Feature 1", "Feature 2", "Feature 3"]
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
    "highlights": ["...", "..."],
    "buyer_concerns": ["...", "..."],
    "responses": ["...", "..."]
  },
  "marketability": {
    "score_1_to_10": 0,
    "summary": "...",
    "improvement_suggestions": ["...", "..."]
  },
  "vision_features": {
    "interior_style": "...",
    "notable_amenities": ["...", "..."],
    "exterior_notes": ["...", "..."],
    "potential_ideal_buyer": "..."
  },
  "open_house_pitch": "..."
}

Rules:
- Return ONLY JSON.
- NO markdown, NO explanations, NO extra text before or after the JSON.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      console.error("No content from OpenAI:", completion);
      return NextResponse.json(
        { error: "No content from model" },
        { status: 500 }
      );
    }

    // In case the model ever adds stray text, try to grab the JSON block
    let jsonText = content.trim();
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse JSON from model:", jsonText);
      return NextResponse.json(
        { error: "Model did not return valid JSON" },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-intelligence error", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate intelligence pack" },
      { status: 500 }
    );
  }
}
