"use client";

import { useState } from "react";
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

type SellerEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: SellerPack | null) => void;
  setError: (message: string | null) => void;
};

export default function SellerEngine({
  isGenerating,
  setIsGenerating,
  setOutput,
  setError,
}: SellerEngineProps) {
  const [activeTool, setActiveTool] = useState<SellerToolId>("prelisting");

  // ---- Pre-listing state ----
  const [sellerNamePL, setSellerNamePL] = useState("");
  const [addressPL, setAddressPL] = useState("");
  const [contextPL, setContextPL] = useState("");
  const [agentNamePL, setAgentNamePL] = useState("");

  // ---- Presentation state ----
  const [sellerNameLP, setSellerNameLP] = useState("");
  const [addressLP, setAddressLP] = useState("");
  const [contextLP, setContextLP] = useState("");
  const [agentNameLP, setAgentNameLP] = useState("");
  const [brandLP, setBrandLP] = useState("");
  const [styleLP, setStyleLP] = useState("");

  // ---- Objection state ----
  const [sellerNameObj, setSellerNameObj] = useState("");
  const [agentNameObj, setAgentNameObj] = useState("");
  const [brandObj, setBrandObj] = useState("");
  const [objectionType, setObjectionType] = useState("Commission / fee");
  const [contextObj, setContextObj] = useState("");

  // ---- Result pack + CRM state ----
  const [pack, setPack] = useState<SellerPack | null>(null);
  const [savingCrm, setSavingCrm] = useState(false);

  // ----------------------------
  // Helpers for validating inputs
  // ----------------------------
  function validateCurrentTool(): boolean {
    if (activeTool === "prelisting") {
      if (!sellerNamePL || !addressPL || !agentNamePL) {
        setError(
          "Please fill seller name, property address, and your name to generate the pre-listing sequence."
        );
        return false;
      }
    }

    if (activeTool === "presentation") {
      if (!sellerNameLP || !addressLP || !agentNameLP) {
        setError(
          "Please fill seller name, property address, and your name to generate the presentation pack."
        );
        return false;
      }
    }

    if (activeTool === "objection") {
      if (!agentNameObj || !objectionType) {
        setError(
          "Please choose an objection type and enter your name to generate scripts."
        );
        return false;
      }
    }

    return true;
  }

  // ----------------------------
  // Generate via /api/generate-intelligence
  // ----------------------------
  async function handleGenerate() {
    if (!validateCurrentTool()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const body: any = {
        engine: "seller",
        tool: activeTool,
      };

      if (activeTool === "prelisting") {
        body.sellerName = sellerNamePL;
        body.address = addressPL;
        body.context = contextPL;
        body.agentName = agentNamePL;
      }

      if (activeTool === "presentation") {
        body.sellerName = sellerNameLP;
        body.address = addressLP;
        body.context = contextLP;
        body.agentName = agentNameLP;
        body.brand = brandLP;
        body.style = styleLP;
      }

      if (activeTool === "objection") {
        body.sellerName = sellerNameObj;
        body.agentName = agentNameObj;
        body.brand = brandObj;
        body.objectionType = objectionType;
        body.context = contextObj;
      }

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

      // Shape coming back from the API:
      // {
      //   prelisting?: { email1, email2, email3 },
      //   presentation?: { opening, questions, ... },
      //   objection?: { talkTrack, smsReply, emailFollowUp }
      // }
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

  // ----------------------------
  // Save active tool to CRM
  // ----------------------------
  async function handleSaveToCrm() {
    if (!pack) return;

    setSavingCrm(true);
    try {
      await fetch("/api/crm/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "seller",
          tool: activeTool,
          payload: pack,
        }),
      });
    } catch (err) {
      console.error("Failed to save seller pack to CRM", err);
    } finally {
      setSavingCrm(false);
    }
  }

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* ---------- LEFT: INPUT CARD ---------- */}
      <div className="avillo-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--avillo-cream)]">
          Seller Studio
        </h2>
        <p className="mb-4 text-xs text-[var(--avillo-cream-muted)]">
          Warm up sellers, structure your listing presentation, and handle
          objections in your voice.
        </p>

        {/* Tool selector pills */}
        <div className="mb-4 flex flex-col gap-2 text-xs sm:inline-flex sm:flex-row sm:flex-wrap">
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

        {/* Active tool input fields */}
        <div className="space-y-3 text-xs">
          {activeTool === "prelisting" && (
            <>
              <InputField
                label="Seller name"
                value={sellerNamePL}
                onChange={setSellerNamePL}
                placeholder="Jordan & Alex"
              />
              <InputField
                label="Property address"
                value={addressPL}
                onChange={setAddressPL}
                placeholder="1234 Ocean View Dr, San Diego, CA"
              />
              <TextareaField
                label="Context / notes (optional)"
                value={contextPL}
                onChange={setContextPL}
                placeholder="Motivations, timing, property highlights, neighborhood…"
                rows={3}
              />
              <InputField
                label="Your name"
                value={agentNamePL}
                onChange={setAgentNamePL}
                placeholder="Your name"
              />
            </>
          )}

          {activeTool === "presentation" && (
            <>
              <InputField
                label="Seller name"
                value={sellerNameLP}
                onChange={setSellerNameLP}
                placeholder="Jordan & Alex"
              />
              <InputField
                label="Property address"
                value={addressLP}
                onChange={setAddressLP}
                placeholder="1234 Ocean View Dr, San Diego, CA"
              />
              <TextareaField
                label="Context / notes (optional)"
                value={contextLP}
                onChange={setContextLP}
                placeholder="What makes this home & neighborhood special, motivations, timing…"
                rows={3}
              />
              <InputField
                label="Your name"
                value={agentNameLP}
                onChange={setAgentNameLP}
                placeholder="Your name"
              />
              <InputField
                label="Brand positioning (optional)"
                value={brandLP}
                onChange={setBrandLP}
                placeholder="Local expert, data-driven, high-touch"
              />
              <InputField
                label="Marketing style (optional)"
                value={styleLP}
                onChange={setStyleLP}
                placeholder="Modern, digital-first, high-touch"
              />
            </>
          )}

          {activeTool === "objection" && (
            <>
              <InputField
                label="Seller name (optional)"
                value={sellerNameObj}
                onChange={setSellerNameObj}
                placeholder="Jordan & Alex"
              />
              <InputField
                label="Your name"
                value={agentNameObj}
                onChange={setAgentNameObj}
                placeholder="Your name"
              />
              <InputField
                label="Brand positioning (optional)"
                value={brandObj}
                onChange={setBrandObj}
                placeholder="Local expert, data-driven, high-touch"
              />
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                  Objection type
                </label>
                <select
                  value={objectionType}
                  onChange={(e) => setObjectionType(e.target.value)}
                  className="avillo-input w-full bg-[rgba(15,23,42,0.9)]"
                >
                  <option>Commission / fee</option>
                  <option>Waiting for the market</option>
                  <option>We have another agent</option>
                  <option>We want to list higher</option>
                  <option>We’re not ready yet</option>
                </select>
              </div>
              <TextareaField
                label="Context notes (optional)"
                value={contextObj}
                onChange={setContextObj}
                placeholder="Meeting setting, their personality, price range, how the conversation has gone so far…"
                rows={3}
              />
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="avillo-btn mt-4 flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating…" : "Generate Seller Outputs"}
        </button>
      </div>

      {/* ---------- RIGHT: OUTPUT CANVAS (delegated) ---------- */}
      <SellerOutputCanvas
        pack={pack}
        activeTool={activeTool}
        onSaveToCrm={handleSaveToCrm}
        savingCrm={savingCrm}
      />
    </section>
  );
}

// --------------------
// Small sub-components
// --------------------

type SellerToolPillProps = {
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
};

function SellerToolPill({
  label,
  description,
  active,
  onClick,
}: SellerToolPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full flex-col rounded-xl border px-4 py-2 text-left text-xs transition sm:w-auto " +
        (active
          ? "border-[var(--avillo-gold)] bg-[rgba(24,20,10,0.95)] text-[var(--avillo-cream)] shadow-[0_0_16px_rgba(244,210,106,0.45)]"
          : "border-transparent text-[var(--avillo-cream-muted)] hover:border-[var(--avillo-gold)]/50 hover:text-[var(--avillo-cream)] hover:bg-white/5")
      }
    >
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[10px] text-[var(--avillo-cream-muted)]">
        {description}
      </span>
    </button>
  );
}

type InputFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: InputFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="avillo-input w-full"
      />
    </div>
  );
}

type TextareaFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
};

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: TextareaFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="avillo-textarea w-full"
      />
    </div>
  );
}
