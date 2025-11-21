import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AVILLO_OPENAI_KEY,
});

export async function POST(req: Request) {
  try {
    if (!client.apiKey) {
      console.error("Missing AVILLO_OPENAI_KEY");
      return NextResponse.json(
        { error: "Missing AVILLO_OPENAI_KEY on server" },
        { status: 500 }
      );
    }

    const { sellerName, address, context, agentName } = (await req.json()) as {
      sellerName?: string;
      address?: string;
      context?: string;
      agentName?: string;
    };

    if (!sellerName || !address || !agentName) {
      return NextResponse.json(
        { error: "Missing required fields: sellerName, address, agentName" },
        { status: 400 }
      );
    }

    const prompt = `
You are Avillo, an AI assistant for real estate agents.

Write a **3-part pre-listing email sequence** for a seller lead.

Details:
- Seller name: ${sellerName}
- Property address: ${address}
- Context / notes: ${context || "n/a"}
- Agent name: ${agentName}

Goals:
- Warm up the relationship.
- Educate the seller on process and value.
- Make it easy to book a meeting or call.

Return a SINGLE JSON object with EXACTLY this shape:

{
  "email1": "First warm-up email...",
  "email2": "Second email...",
  "email3": "Third email..."
}

Rules:
- Each value must be a full email body including subject line.
- Tone: professional, friendly, confident.
- Do NOT include markdown.
- Return ONLY JSON, no text before or after.
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
        { error: "Model did not return valid JSON for pre-listing emails" },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("seller-prelisting error", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate pre-listing emails" },
      { status: 500 }
    );
  }
}