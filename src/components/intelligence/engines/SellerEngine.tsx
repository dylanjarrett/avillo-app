"use client";

import { useState, useEffect } from "react";
import { SellerOutputCanvas } from "@/components/intelligence/OutputCard";

export type SellerToolId = "prelisting" | "presentation" | "objection";

export type SellerPack = {
  prelisting?: {
    email1?: string;
    email2?: string;
    email3?: string;
  };
  presentation?: {
    opening?: string;
    questions?: string;
    story?: string;
    pricing?: string;
    marketing?: string;
    process?: string;
    value?: string;
    nextSteps?: string;
  };
  objection?: {
    talkTrack?: string;
    smsReply?: string;
    emailFollowUp?: string;
  };
};

type RestoreRequest =
  | {
      engine: "listing" | "seller" | "buyer" | "neighborhood";
      prompt: string;
    }
  | null;

type SellerEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: SellerPack | null) => void;
  setError: (message: string | null) => void;
  restoreRequest?: RestoreRequest;
  contextType?: "listing" | "contact" | "none" | null;
  contextId?: string | null;
  onSavedRun?: () => void;
};

export default function SellerEngine({
  isGenerating,
  setIsGenerating,
  setOutput,
  setError,
  restoreRequest,
  contextType,
  contextId,
  onSavedRun,
}: SellerEngineProps) {
  const [activeTool, setActiveTool] = useState<SellerToolId>("prelisting");

  // ----- Shared Seller Studio brief (one canvas powering all tools) -----
  const [sellerName, setSellerName] = useState("");
  const [address, setAddress] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [agentName, setAgentName] = useState("");
  const [brandPositioning, setBrandPositioning] = useState("");
  const [marketingStyle, setMarketingStyle] = useState("");
  const [objectionType, setObjectionType] = useState("Commission / fee");
  const [objectionContext, setObjectionContext] = useState("");

  // ---- Pack + history ----
  const [pack, setPack] = useState<SellerPack | null>(null);
  const [savingOutput, setSavingOutput] = useState(false);

  /* ------------------------------------
   * RESTORE HANDLER (from history card)
   * -----------------------------------*/
  useEffect(() => {
    if (!restoreRequest) return;
    if (restoreRequest.engine !== "seller") return;

    const raw = restoreRequest.prompt.trim();
    if (!raw) return;

    // Pick a reasonable active tab based on the text
    if (/objection|pushback|fee|commission|we want|not ready/i.test(raw)) {
      setActiveTool("objection");
    } else if (
      /presentation|deck|pricing|marketing|timeline|story/i.test(raw)
    ) {
      setActiveTool("presentation");
    } else {
      setActiveTool("prelisting");
    }

    // Reset + drop the text into context fields
    setSellerName("");
    setAddress("");
    setAgentName("");
    setBrandPositioning("");
    setMarketingStyle("");
    setObjectionType("Commission / fee");
    setContextNotes(raw);
    setObjectionContext(raw);
  }, [restoreRequest]);

  /* ------------------------------------
   * VALIDATION (shared brief)
   * -----------------------------------*/
  function validateBrief(): boolean {
    if (!sellerName || !address || !agentName) {
      setError(
        "Please fill seller name, property address, and your name before generating."
      );
      return false;
    }
    return true;
  }

  /* ------------------------------------
   * GENERATE (one Seller pack)
   * -----------------------------------*/
  async function handleGenerate() {
    if (!validateBrief()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const body: any = {
        engine: "seller",
        // we still send the activeTool so the prompt can bias tone,
        // but the engine always returns the full seller pack
        tool: activeTool,
        sellerName,
        address,
        contextNotes,
        agentName,
        brandPositioning,
        marketingStyle,
        objectionType,
        objectionContext,
      };

      const res = await fetch("/api/generate-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "Failed to generate Seller Studio outputs."
        );
      }

      const data = await res.json();
      const nextPack: SellerPack = {
        ...(pack || {}),
        ...(data || {}),
      };

      setPack(nextPack);
      setOutput(nextPack);
    } catch (err: any) {
      console.error("Seller engine error", err);
      setError(err?.message || "Something went wrong while generating.");
    } finally {
      setIsGenerating(false);
    }
  }

  /* ------------------------------------
   * SAVE TO HISTORY (DB)
   * -----------------------------------*/
  async function handleSaveOutput() {
    if (!pack) return;

    setSavingOutput(true);
    try {
      const summaryLines = [
        sellerName && address ? `${sellerName} — ${address}` : sellerName,
        contextNotes,
        brandPositioning && `Brand: ${brandPositioning}`,
        marketingStyle && `Style: ${marketingStyle}`,
        objectionType && `Objection focus: ${objectionType}`,
        `Agent: ${agentName || "Unknown agent"}`,
      ].filter(Boolean);

      const userInput = summaryLines.join("\n").trim();

      const res = await fetch("/api/intelligence/save-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "seller",
          userInput,
          outputs: pack,
          contextType: (contextType ?? "none") as
            | "listing"
            | "contact"
            | "none",
          contextId: contextId ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Save seller output failed", data);
      } else {
        onSavedRun?.();
      }
    } catch (err) {
      console.error("Failed to save seller pack", err);
    } finally {
      setSavingOutput(false);
    }
  }

  /* ------------------------------------
   * RENDER
   * -----------------------------------*/
  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* LEFT: Seller Studio brief */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)] opacity-40 blur-3xl" />

        <h2 className="mb-1 text-sm font-semibold text-slate-50">
          Seller Studio
        </h2>
        <p className="mb-3 text-xs text-slate-200/90">
          Fill out one seller brief. Avillo will generate pre-listing emails,
          a listing presentation outline, and objection responses from the same
          canvas.
        </p>

        {/* PILL SELECTOR – now just controls which output view is active */}
        <div className="mb-4 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap">
          <SellerToolPill
            label="Pre-listing Emails"
            description="3-part warm-up drip."
            active={activeTool === "prelisting"}
            onClick={() => setActiveTool("prelisting")}
          />
          <SellerToolPill
            label="Listing Presentation"
            description="Structured deck outline."
            active={activeTool === "presentation"}
            onClick={() => setActiveTool("presentation")}
          />
          <SellerToolPill
            label="Objection Lab"
            description="Live script + SMS + email."
            active={activeTool === "objection"}
            onClick={() => setActiveTool("objection")}
          />
        </div>

        {/* SHARED INPUT FIELDS */}
        <div className="space-y-3 text-xs text-slate-100">
          <InputField
            label="Seller name"
            value={sellerName}
            onChange={setSellerName}
            placeholder="Jordan & Alex"
          />

          <InputField
            label="Property address"
            value={address}
            onChange={setAddress}
            placeholder="1234 Ocean View Dr"
          />

          <TextareaField
            label="Context / notes"
            value={contextNotes}
            onChange={setContextNotes}
            placeholder="High-level goals, timing, concerns, why they’re selling..."
            rows={3}
          />

          <InputField
            label="Your name"
            value={agentName}
            onChange={setAgentName}
            placeholder="Your name"
          />

          <InputField
            label="Brand positioning (optional)"
            value={brandPositioning}
            onChange={setBrandPositioning}
            placeholder="High-touch, data-driven, neighborhood expert..."
          />

          <InputField
            label="Marketing style (optional)"
            value={marketingStyle}
            onChange={setMarketingStyle}
            placeholder="Concise & direct, story-driven, luxury tone..."
          />

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
              Objection focus (optional)
            </label>
            <select
              value={objectionType}
              onChange={(e) => setObjectionType(e.target.value)}
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100"
            >
              <option>Commission / fee</option>
              <option>Waiting for the market</option>
              <option>We have another agent</option>
              <option>We want to list higher</option>
              <option>We’re not ready yet</option>
            </select>
            <p className="mt-1 text-[10px] text-slate-400/90">
              Used primarily for Objection Lab, but it also helps tone the
              emails and presentation.
            </p>
          </div>

          <TextareaField
            label="Objection notes (optional)"
            value={objectionContext}
            onChange={setObjectionContext}
            placeholder="What did they say? Any history or specific pushback you want handled?"
            rows={3}
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20 disabled:opacity-60"
        >
          {isGenerating ? "Generating…" : "Generate Seller Pack"}
        </button>
      </div>

      {/* RIGHT: Seller outputs (tabbed by activeTool) */}
      <SellerOutputCanvas
        pack={pack}
        activeTool={activeTool}
        onSaveOutput={handleSaveOutput}
        savingOutput={savingOutput}
      />
    </section>
  );
}

/* ------------------------------------
 * SMALL COMPONENTS
 * -----------------------------------*/
function SellerToolPill({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full flex-col rounded-xl border px-4 py-2 text-left text-xs transition sm:w-auto " +
        (active
          ? "border-amber-100/80 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)]"
          : "border-slate-700/80 bg-slate-900/60 text-slate-300/90 hover:border-amber-100/60 hover:text-amber-100 hover:bg-slate-900/80")
      }
    >
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[10px] text-slate-300/90">{description}</span>
    </button>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100"
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100"
      />
    </div>
  );
}