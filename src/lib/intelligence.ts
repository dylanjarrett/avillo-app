// src/lib/intelligence.ts

export type EngineMode = "listing" | "seller" | "buyer";

export interface GenerateAIArgs {
  mode: EngineMode;
  propertyNotes: string;
  clientType: "general" | "buyer" | "seller";
  tone: string;
  length: "short" | "medium" | "long";
  format: "bullets" | "narrative" | "hybrid";
}

export interface GenerateAIResult {
  text: string;
}

export async function generateAI(
  payload: GenerateAIArgs
): Promise<GenerateAIResult> {
  const res = await fetch("/api/generate-intelligence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("generateAI error", await res.text());
    throw new Error("Failed to generate AI output");
  }

  return res.json();
}
