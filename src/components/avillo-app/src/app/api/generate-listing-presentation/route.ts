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

    const {
      sellerName,
      address,
      context,
      agentName,
      brand,
      style,
    } = (await req.json()) as {
      sellerName?: string;
      address?: string;
      context?: string;
      agentName?: string;
      brand?: string;
      style?: string;
    };

    if (!sellerName || !address || !agentName) {
      return NextResponse.json(
        { error: "Missing required fields: sellerName, address, agentName" },
        { status: 400 }
      );
    }

    const prompt = `
You are Avillo, an AI assistant for listing presentations.

Create a **structured listing presentation outline** for this seller.

Details:
- Seller name: ${sellerName}
- Property address: ${address}
- Property notes: ${context || "n/a"}
- Agent name: ${agentName}
- Brand positioning: ${brand || "n/a"}
- Marketing style: ${style || "n/a"}

Return a SINGLE JSON object with EXACTLY this shape:

{
  "opening": "Intro, rapport, agenda...",
  "questions": "Discovery questions to ask the seller...",
  "story": "Property & neighborhood story...",
  "pricing": "Pricing strategy talking points...",
  "marketing": "Marketing plan overview...",
  "process": "Process & timeline overview...",
  "value": "How the agent adds value...",
  "nextSteps": "Clear next steps & close..."
}

Rules:
- Each field should be a few short paragraphs or bullet-style lines.
- Tone: confident, collaborative, easy to present verbally.
- Do NOT include markdown.
- Return ONLY JSON, no extra text.
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
        { error: "Model did not return valid JSON for listing presentation" },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-listing-presentation error", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate listing presentation pack" },
      { status: 500 }
    );
  }
}