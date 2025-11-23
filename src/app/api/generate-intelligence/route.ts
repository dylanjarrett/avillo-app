// src/app/api/generate-intelligence/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const API_KEY =
  process.env.AVILLO_OPENAI_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.OPENAI_api_key ||
  "";

const openai = new OpenAI({
  apiKey: API_KEY,
});

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    console.error(
      "Missing OpenAI API key. Set AVILLO_OPENAI_KEY or OPENAI_API_KEY in .env.local"
    );
    return NextResponse.json(
      { error: "Missing OpenAI API key in server environment." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    propertyNotes?: string;
    clientType?: string;
    tone?: string;
    length?: "short" | "medium" | "long";
    format?: "bullets" | "paragraphs" | "hybrid";
  };

  const {
    mode = "general",
    propertyNotes = "",
    clientType = "general",
    tone = "professional",
    length = "medium",
    format = "hybrid",
  } = body;

  // ---------- system prompt ----------
  let systemPrompt = `
You are Avillo — an elite real-estate AI assistant.
Tone: ${tone}
Primary client type: ${clientType}
Mode: ${mode}

You generate polished, accurate, high-quality real estate content.
Always format cleanly with clear titles and sections.
`.trim();

  // For LISTING mode, force a structured template the UI can rely on
  if (mode === "listing") {
    systemPrompt += `

When mode = "listing", ALWAYS respond in this exact markdown layout:

## Listing copy
- Full MLS-ready description (2–4 paragraphs).
- Highlight unique features, neighborhood, and lifestyle.

## Social kit
- 3–5 short social captions.
- 1 slightly longer caption for Facebook/LinkedIn.
- Include a few relevant hashtags.

## Emails
- 1 email to your sphere about the new listing.
- 1 email to active buyers/prospects who might be a fit.

## Talking points
- 6–10 bullet talking points an agent can use on calls, tours, or video.

## Insights
- 1 short paragraph summarizing who this listing is ideal for.
- 3–5 bullets on pricing/positioning, buyer psychology, or marketing angle.

## Open-house pitch
- A concise script the agent can use to welcome open-house visitors (45–90 seconds).
`;
  }

  // ---------- user prompt ----------
  const userPrompt = `
Property Notes:
${propertyNotes}

Generate the appropriate output for:
Mode: ${mode}
Client type: ${clientType}
Length: ${length}
Preferred format: ${format}
  `.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";

  return NextResponse.json({ text });
}
