// src/components/intelligence/engines/SellerEngine.tsx
"use client";

import React, { useState } from "react";
import { generateAI } from "@/lib/intelligence";

interface SellerEngineProps {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setOutput: (v: string) => void;
}

export default function SellerEngine({
  loading,
  setLoading,
  setOutput,
}: SellerEngineProps) {
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");

  async function handleGenerate() {
    if (!notes.trim()) {
      alert("Add your seller context first.");
      return;
    }

    setLoading(true);
    setOutput("");

    try {
      const res = await generateAI({
        mode: "seller",
        propertyNotes: notes,
        clientType: "seller",
        tone,
        length,
        format: "hybrid",
      });

      setOutput(
        res.text ||
          "No output generated. Try tweaking your notes or settings and run again."
      );
    } catch (err) {
      console.error(err);
      setOutput("Something went wrong generating this seller pack.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/70 uppercase">
          Seller engine
        </p>
        <h2 className="text-lg font-semibold text-slate-50">
          Prep updates, pricing scripts & seller communication
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Add context about your seller, pricing convo, timeline and any
          objections. Avillo will generate updates, talking points and email
          drafts.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-200">Seller notes</p>
        <textarea
          rows={7}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-200/40 focus:border-amber-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400">Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-sm text-slate-100"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="direct">Direct</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-400">Depth</label>
          <select
            value={length}
            onChange={(e) =>
              setLength(e.target.value as "short" | "medium" | "long")
            }
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-sm text-slate-100"
          >
            <option value="short">Short</option>
            <option value="medium">Medium (recommended)</option>
            <option value="long">Long</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="mt-2 inline-flex items-center justify-center rounded-xl border border-amber-200/60 bg-amber-100/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Generating…" : "Generate seller pack"}
      </button>
    </div>
  );
}
