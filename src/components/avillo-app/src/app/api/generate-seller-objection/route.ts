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
      agentName,
      brand,
      objectionType,
      context,
    } = (await req.json()) as {
      sellerName?: string;
      agentName?: string;
      brand?: string;
      objectionType?: string;
      context?: string;
    };

    if (!agentName || !objectionType) {
      return NextResponse.json(
        { error: "Missing required fields: agentName, objectionType" },
        { status: 400 }
      );
    }

    const prompt = `
You are Avillo, an AI assistant helping an agent handle seller objections.

Create:
1) A live talk track the agent can say in-person or on a call.
2) A short SMS reply.
3) A longer follow-up email.

Details:
- Seller name: ${sellerName || "the seller"}
- Agent name: ${agentName}
- Brand positioning: ${brand || "n/a"}
- Objection type: ${objectionType}
- Context: ${context || "n/a"}

Return a SINGLE JSON object with EXACTLY this shape:

{
  "talkTrack": "What to say live...",
  "smsReply": "Short text message reply...",
  "emailFollowUp": "Longer follow-up email..."
}

Rules:
- Tone: calm, confident, empathetic, non-pushy.
- Keep things realistic for U.S. residential real estate.
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
        { error: "Model did not return valid JSON for objection handling" },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-seller-objection error", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate objection handling" },
      { status: 500 }
    );
  }
}