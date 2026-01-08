"use client";

import { useEffect, useState } from "react";
import { SellerOutputCanvas } from "@/components/intelligence/OutputCard";

export type SellerToolId = "prelisting" | "presentation" | "objection";

export type SellerPack = {
  prelisting?: { email1?: string; email2?: string; email3?: string };
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
  objection?: { talkTrack?: string; smsReply?: string; emailFollowUp?: string };
};

type ComplianceHit = { type: "HARD"; match: string; rule: string };

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

  // Compliance banner hooks (HARD blocks only)
  onComplianceGuard?: (payload: { error: string; hits?: ComplianceHit[] }) => void;
  clearComplianceGuard?: () => void;
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
  onComplianceGuard,
  clearComplianceGuard,
}: SellerEngineProps) {
  const [activeTool, setActiveTool] = useState<SellerToolId>("prelisting");

  // Shared Seller Studio brief
  const [sellerName, setSellerName] = useState("");
  const [address, setAddress] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [agentName, setAgentName] = useState("");
  const [brandPositioning, setBrandPositioning] = useState("");
  const [marketingStyle, setMarketingStyle] = useState("");
  const [objectionType, setObjectionType] = useState("Commission / fee");
  const [objectionContext, setObjectionContext] = useState("");

  const [pack, setPack] = useState<SellerPack | null>(null);
  const [savingOutput, setSavingOutput] = useState(false);

  function clearGuardOnEdit() {
    // If you want HARD banners to remain until user dismisses, remove this line.
    clearComplianceGuard?.();
  }

  /* ------------------------------------
   * RESTORE HANDLER (from history card)
   * -----------------------------------*/
  useEffect(() => {
    if (!restoreRequest) return;
    if (restoreRequest.engine !== "seller") return;

    const raw = (restoreRequest.prompt || "").trim();
    if (!raw) return;

    const brief = parseSellerBriefFromHistory(raw);

    setSellerName(brief.sellerName || "");
    setAddress(brief.address || "");
    setContextNotes(brief.context || "");
    setAgentName(brief.agentName || "");
    setBrandPositioning(brief.brand || "");
    setMarketingStyle(brief.style || "");
    setObjectionType(brief.objectionFocus || "Commission / fee");
    setObjectionContext(brief.objectionNotes || "");

    setActiveTool(brief.lastTool || inferToolFromBrief(brief));

    // reset banners/errors on restore
    clearComplianceGuard?.();
    setError(null);
  }, [restoreRequest, clearComplianceGuard, setError]);

  function inferToolFromBrief(brief: SellerBrief): SellerToolId {
    if (brief.lastTool) return brief.lastTool;
    if (brief.objectionFocus || brief.objectionNotes) return "objection";
    if (brief.brand || brief.style) return "presentation";
    return "prelisting";
  }

  /* ------------------------------------
   * VALIDATION (shared brief)
   * -----------------------------------*/
  function validateBrief(): boolean {
    if (!sellerName.trim() || !address.trim() || !agentName.trim()) {
      setError("Please fill seller name, property address, and your name before generating.");
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
      const body = {
        engine: "seller",
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

      // HARD compliance block only (422)
      if (res.status === 422) {
        const data = await res.json().catch(() => null);
        onComplianceGuard?.({
          error:
            data?.error ||
            "We blocked this request due to protected-class targeting or steering language.",
          hits: (data?.compliance?.hits ?? []) as ComplianceHit[],
        });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate Seller Studio outputs.");
      }

      // success: clear any previous block banner
      clearComplianceGuard?.();

      const data = await res.json();
      const nextPack: SellerPack = { ...(pack || {}), ...(data || {}) };

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
      const userInput = formatSellerBriefForHistory({
        sellerName,
        address,
        context: contextNotes,
        agentName,
        brand: brandPositioning,
        style: marketingStyle,
        objectionFocus: objectionType,
        objectionNotes: objectionContext,
        lastTool: activeTool,
      });

      const res = await fetch("/api/intelligence/save-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "seller",
          userInput,
          outputs: pack,
          contextType: (contextType ?? "none") as "listing" | "contact" | "none",
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

        <h2 className="mb-1 text-sm font-semibold text-slate-50">Seller Studio</h2>
        <p className="mb-3 text-xs text-slate-200/90">
          Fill out one seller brief. Avillo generates pre-listing emails, a listing presentation outline,
          and objection responses from the same canvas.
        </p>

        {/* Tool pills */}
        <div className="mb-4 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap">
          <SellerToolPill
            label="Pre-listing Emails"
            description="3-part warm-up drip."
            active={activeTool === "prelisting"}
            onClick={() => {
              setActiveTool("prelisting");
              clearGuardOnEdit();
            }}
          />
          <SellerToolPill
            label="Listing Presentation"
            description="Structured deck outline."
            active={activeTool === "presentation"}
            onClick={() => {
              setActiveTool("presentation");
              clearGuardOnEdit();
            }}
          />
          <SellerToolPill
            label="Objection Lab"
            description="Live script + SMS + email."
            active={activeTool === "objection"}
            onClick={() => {
              setActiveTool("objection");
              clearGuardOnEdit();
            }}
          />
        </div>

        {/* Inputs */}
        <div className="space-y-3 text-xs text-slate-100">
          <InputField
            label="Seller name"
            value={sellerName}
            onChange={(v) => {
              setSellerName(v);
              clearGuardOnEdit();
            }}
            placeholder="Jordan & Alex"
          />

          <InputField
            label="Property address"
            value={address}
            onChange={(v) => {
              setAddress(v);
              clearGuardOnEdit();
            }}
            placeholder="1234 Ocean View Dr"
          />

          <TextareaField
            label="Context / notes"
            value={contextNotes}
            onChange={(v) => {
              setContextNotes(v);
              clearGuardOnEdit();
            }}
            placeholder="Goals, timing, concerns, why they’re selling..."
            rows={3}
          />

          <InputField
            label="Your name"
            value={agentName}
            onChange={(v) => {
              setAgentName(v);
              clearGuardOnEdit();
            }}
            placeholder="Your name"
          />

          <InputField
            label="Brand positioning (optional)"
            value={brandPositioning}
            onChange={(v) => {
              setBrandPositioning(v);
              clearGuardOnEdit();
            }}
            placeholder="High-touch, data-driven, neighborhood expert..."
          />

          <InputField
            label="Marketing style (optional)"
            value={marketingStyle}
            onChange={(v) => {
              setMarketingStyle(v);
              clearGuardOnEdit();
            }}
            placeholder="Concise & direct, story-driven, luxury tone..."
          />

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
              Objection focus (optional)
            </label>
            <select
              value={objectionType}
              onChange={(e) => {
                setObjectionType(e.target.value);
                clearGuardOnEdit();
              }}
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100"
            >
              <option>Commission / fee</option>
              <option>Waiting for the market</option>
              <option>We have another agent</option>
              <option>We want to list higher</option>
              <option>We’re not ready yet</option>
            </select>
            <p className="mt-1 text-[10px] text-slate-400/90">
              Used mainly for Objection Lab. It can also influence tone across outputs.
            </p>
          </div>

          <TextareaField
            label="Objection notes (optional)"
            value={objectionContext}
            onChange={(v) => {
              setObjectionContext(v);
              clearGuardOnEdit();
            }}
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

      {/* RIGHT: Outputs */}
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
        className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-100/70 focus:ring-1 focus:ring-amber-100/70"
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
        className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-100/70 focus:ring-1 focus:ring-amber-100/70"
      />
    </div>
  );
}

/* ------------------------------------
 * HISTORY HELPERS (save + restore)
 * -----------------------------------*/

type SellerBrief = {
  sellerName?: string;
  address?: string;
  context?: string;
  agentName?: string;
  brand?: string;
  style?: string;
  objectionFocus?: string;
  objectionNotes?: string;
  lastTool?: SellerToolId;
};

function formatSellerBriefForHistory(brief: SellerBrief): string {
  return [
    brief.sellerName && `Seller: ${brief.sellerName}`,
    brief.address && `Address: ${brief.address}`,
    brief.context && `Context: ${brief.context}`,
    brief.agentName && `Agent: ${brief.agentName}`,
    brief.brand && `Brand positioning: ${brief.brand}`,
    brief.style && `Marketing style: ${brief.style}`,
    brief.objectionFocus && `Objection focus: ${brief.objectionFocus}`,
    brief.objectionNotes && `Objection notes: ${brief.objectionNotes}`,
    brief.lastTool && `Tool: ${brief.lastTool}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSellerBriefFromHistory(raw: string): SellerBrief {
  const brief: SellerBrief = {};
  if (!raw) return brief;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let current: keyof SellerBrief | null = null;

  const append = (prev: string | undefined, line: string) =>
    (prev ? `${prev}\n` : "") + line;

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      // continuation -> context by default
      brief.context = append(brief.context, line);
      current = "context";
      continue;
    }

    const label = line.slice(0, idx).toLowerCase().replace(/[^a-z]/g, "");
    const value = line.slice(idx + 1).trim();
    if (!value) continue;

    switch (label) {
      case "seller":
      case "sellername":
        brief.sellerName = value;
        current = "sellerName";
        break;
      case "address":
      case "property":
      case "propertyaddress":
        brief.address = value;
        current = "address";
        break;
      case "context":
      case "notes":
      case "contextnotes":
        brief.context = value;
        current = "context";
        break;
      case "agent":
      case "yourname":
        brief.agentName = value;
        current = "agentName";
        break;
      case "brand":
      case "brandpositioning":
        brief.brand = value;
        current = "brand";
        break;
      case "style":
      case "marketingstyle":
        brief.style = value;
        current = "style";
        break;
      case "objection":
      case "objectionfocus":
        brief.objectionFocus = value;
        current = "objectionFocus";
        break;
      case "objectionnotes":
        brief.objectionNotes = value;
        current = "objectionNotes";
        break;
      case "tool": {
        const v = value.toLowerCase();
        if (v.includes("pre")) brief.lastTool = "prelisting";
        else if (v.includes("present")) brief.lastTool = "presentation";
        else if (v.includes("object")) brief.lastTool = "objection";
        current = null;
        break;
      }
      default:
        // Unknown label -> treat as context
        brief.context = append(brief.context, value);
        current = "context";
        break;
    }
  }

  // If someone pasted multi-line values without labels, try to attach them to the last seen key.
  // (Optional: keep tiny logic; safe default is doing nothing.)
  if (current && lines.length) {
    // no-op; retained for clarity
  }

  return brief;
}
