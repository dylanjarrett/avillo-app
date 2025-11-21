"use client";

import { useState } from "react";
import { MOCK_PACK } from "../mock/avilloMock";
import AppShell from "@/components/AppShell";

// ----- Types -----

type ListingSection = {
  long?: string;
  short?: string;
  bullets?: string[];
};

type IntelligencePack = {
  listing?: ListingSection;
  social?: {
    instagram_caption?: string;
    facebook_post?: string;
    linkedin_post?: string;
    tiktok_hook?: string;
    tiktok_script?: string;
  };
  emails?: {
    buyer_email?: string;
    seller_email?: string;
  };
  talking_points?: {
    highlights?: string[];
    buyer_concerns?: string[];
    responses?: string[];
  };
  marketability?: {
    score_1_to_10?: number;
    summary?: string;
    improvement_suggestions?: string[];
  };
  open_house_pitch?: string;
};

type WorkspaceId = "listing" | "seller" | "buyer";
type SellerToolId = "prelisting" | "presentation" | "objection";
type ListingTabId =
  | "listing"
  | "social"
  | "emails"
  | "talking"
  | "insights"
  | "pitch";

// ----- Main page component -----

export default function AvilloClientPage() {
  const [activeWorkspace, setActiveWorkspace] =
    useState<WorkspaceId>("listing");
  const [activeSellerTool, setActiveSellerTool] =
    useState<SellerToolId>("prelisting");
  const [activeListingTab, setActiveListingTab] =
    useState<ListingTabId>("listing");

  // Listing Intelligence state
  const [propertyText, setPropertyText] = useState("");
  const [pack, setPack] = useState<IntelligencePack>(MOCK_PACK);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);

  // Seller: Pre-listing emails
  const [sellerNamePL, setSellerNamePL] = useState("");
  const [addressPL, setAddressPL] = useState("");
  const [contextPL, setContextPL] = useState("");
  const [agentNamePL, setAgentNamePL] = useState("");
  const [preEmail1, setPreEmail1] = useState("");
  const [preEmail2, setPreEmail2] = useState("");
  const [preEmail3, setPreEmail3] = useState("");
  const [isGeneratingPrelisting, setIsGeneratingPrelisting] = useState(false);

  // Seller: Listing presentation pack
  const [sellerNameLP, setSellerNameLP] = useState("");
  const [addressLP, setAddressLP] = useState("");
  const [contextLP, setContextLP] = useState("");
  const [agentNameLP, setAgentNameLP] = useState("");
  const [brandLP, setBrandLP] = useState("");
  const [styleLP, setStyleLP] = useState("");
  const [lpOpening, setLpOpening] = useState("");
  const [lpQuestions, setLpQuestions] = useState("");
  const [lpStory, setLpStory] = useState("");
  const [lpPricing, setLpPricing] = useState("");
  const [lpMarketing, setLpMarketing] = useState("");
  const [lpProcess, setLpProcess] = useState("");
  const [lpValue, setLpValue] = useState("");
  const [lpNextSteps, setLpNextSteps] = useState("");
  const [isGeneratingPresentation, setIsGeneratingPresentation] =
    useState(false);

  // Seller: Objection lab
  const [sellerNameObj, setSellerNameObj] = useState("");
  const [agentNameObj, setAgentNameObj] = useState("");
  const [brandObj, setBrandObj] = useState("");
  const [objectionType, setObjectionType] =
    useState("Commission / fee");
  const [contextObj, setContextObj] = useState("");
  const [objTalkTrack, setObjTalkTrack] = useState("");
  const [objSms, setObjSms] = useState("");
  const [objEmail, setObjEmail] = useState("");
  const [isGeneratingObjection, setIsGeneratingObjection] =
    useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ----- API handlers -----

  async function handleGenerateIntelligence() {
    if (!propertyText.trim()) {
      setErrorMessage("Please paste property details first.");
      return;
    }
    setErrorMessage(null);
    setIsGeneratingPack(true);

    try {
      const res = await fetch("/api/generate-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "Failed to generate intelligence pack"
        );
      }

      const data = (await res.json()) as IntelligencePack;
      setPack(data);
    } catch (err: any) {
      console.error("Generate intelligence error", err);
      setErrorMessage(
        err?.message || "Failed to generate intelligence pack"
      );
    } finally {
      setIsGeneratingPack(false);
    }
  }

  async function handleGeneratePrelisting() {
    if (!sellerNamePL || !addressPL || !agentNamePL) {
      setErrorMessage(
        "Please fill seller name, address, and your name to generate emails."
      );
      return;
    }

    setErrorMessage(null);
    setIsGeneratingPrelisting(true);

    try {
      const res = await fetch("/api/generate-prelisting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerName: sellerNamePL,
          address: addressPL,
          context: contextPL,
          agentName: agentNamePL,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "Failed to generate pre-listing emails"
        );
      }

      const data = (await res.json()) as {
        email1?: string;
        email2?: string;
        email3?: string;
      };

      setPreEmail1(data.email1 || "");
      setPreEmail2(data.email2 || "");
      setPreEmail3(data.email3 || "");
    } catch (err: any) {
      console.error("Prelisting error", err);
      setErrorMessage(
        err?.message || "Failed to generate pre-listing emails"
      );
    } finally {
      setIsGeneratingPrelisting(false);
    }
  }

  async function handleGeneratePresentation() {
    if (!sellerNameLP || !addressLP || !agentNameLP) {
      setErrorMessage(
        "Please fill seller name, address, and your name to generate the deck."
      );
      return;
    }

    setErrorMessage(null);
    setIsGeneratingPresentation(true);

    try {
      const res = await fetch("/api/generate-listing-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerName: sellerNameLP,
          address: addressLP,
          context: contextLP,
          agentName: agentNameLP,
          brand: brandLP,
          style: styleLP,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ||
            "Failed to generate listing presentation pack"
        );
      }

      const data = (await res.json()) as {
        opening?: string;
        questions?: string;
        story?: string;
        pricing?: string;
        marketing?: string;
        process?: string;
        value?: string;
        nextSteps?: string;
      };

      setLpOpening(data.opening || "");
      setLpQuestions(data.questions || "");
      setLpStory(data.story || "");
      setLpPricing(data.pricing || "");
      setLpMarketing(data.marketing || "");
      setLpProcess(data.process || "");
      setLpValue(data.value || "");
      setLpNextSteps(data.nextSteps || "");
    } catch (err: any) {
      console.error("Presentation error", err);
      setErrorMessage(
        err?.message ||
          "Failed to generate listing presentation pack"
      );
    } finally {
      setIsGeneratingPresentation(false);
    }
  }

  async function handleGenerateObjection() {
    if (!objectionType || !agentNameObj) {
      setErrorMessage(
        "Please choose an objection type and enter your name."
      );
      return;
    }

    setErrorMessage(null);
    setIsGeneratingObjection(true);

    try {
      const res = await fetch("/api/generate-seller-objection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerName: sellerNameObj,
          agentName: agentNameObj,
          brand: brandObj,
          objectionType,
          context: contextObj,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "Failed to generate objection handling"
        );
      }

      const data = (await res.json()) as {
        talkTrack?: string;
        smsReply?: string;
        emailFollowUp?: string;
      };

      setObjTalkTrack(data.talkTrack || "");
      setObjSms(data.smsReply || "");
      setObjEmail(data.emailFollowUp || "");
    } catch (err: any) {
      console.error("Objection error", err);
      setErrorMessage(
        err?.message || "Failed to generate objection handling"
      );
    } finally {
      setIsGeneratingObjection(false);
    }
  }

  // ----- Render -----

 return (
    <AppShell>
      {/* WORKSPACE INTRO */}
      <section className="mb-8 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#AAB4C0]">
            Avillo • AI Tools for Real Estate
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Choose a workflow.
          </h1>
        </div>

        {/* Workspace cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <WorkspaceCard
            label="Core engine"
            title="Listing Intelligence"
            status="Active"
            description="MLS copy, bullets, social captions, emails, talking points, open-house pitch."
            active={activeWorkspace === "listing"}
            onClick={() => setActiveWorkspace("listing")}
          />
          <WorkspaceCard
            label="Relationship engine"
            title="Seller Studio"
            status="Open"
            description="Prelisting emails, listing presentation, objection handling."
            active={activeWorkspace === "seller"}
            onClick={() => setActiveWorkspace("seller")}
          />
          <WorkspaceCard
            label="Buyer Studio"
            title="Coming soon"
            status="Waitlist"
            description="Buyer tours, offers, follow-ups."
            active={activeWorkspace === "buyer"}
            disabled
          />
        </div>
      </section>

      {/* ERROR BAR */}
      {errorMessage && (
        <div className="mb-6 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {errorMessage}
        </div>
      )}

      {/* ACTIVE WORKSPACE */}
      <section className="pb-16 space-y-8">
        {activeWorkspace === "listing" && (
          <ListingIntelligenceSection
            propertyText={propertyText}
            setPropertyText={setPropertyText}
            pack={pack}
            isGenerating={isGeneratingPack}
            onGenerate={handleGenerateIntelligence}
            activeTab={activeListingTab}
            setActiveTab={setActiveListingTab}
          />
        )}

        {activeWorkspace === "seller" && (
          <SellerStudioSection
            activeTool={activeSellerTool}
            setActiveTool={setActiveSellerTool}
            // Prelisting
            sellerNamePL={sellerNamePL}
            setSellerNamePL={setSellerNamePL}
            addressPL={addressPL}
            setAddressPL={setAddressPL}
            contextPL={contextPL}
            setContextPL={setContextPL}
            agentNamePL={agentNamePL}
            setAgentNamePL={setAgentNamePL}
            preEmail1={preEmail1}
            preEmail2={preEmail2}
            preEmail3={preEmail3}
            isGeneratingPrelisting={isGeneratingPrelisting}
            onGeneratePrelisting={handleGeneratePrelisting}
            // Presentation
            sellerNameLP={sellerNameLP}
            setSellerNameLP={setSellerNameLP}
            addressLP={addressLP}
            setAddressLP={setAddressLP}
            contextLP={contextLP}
            setContextLP={setContextLP}
            agentNameLP={agentNameLP}
            setAgentNameLP={setAgentNameLP}
            brandLP={brandLP}
            setBrandLP={setBrandLP}
            styleLP={styleLP}
            setStyleLP={setStyleLP}
            lpOpening={lpOpening}
            lpQuestions={lpQuestions}
            lpStory={lpStory}
            lpPricing={lpPricing}
            lpMarketing={lpMarketing}
            lpProcess={lpProcess}
            lpValue={lpValue}
            lpNextSteps={lpNextSteps}
            isGeneratingPresentation={isGeneratingPresentation}
            onGeneratePresentation={handleGeneratePresentation}
            // Objection
            sellerNameObj={sellerNameObj}
            setSellerNameObj={setSellerNameObj}
            agentNameObj={agentNameObj}
            setAgentNameObj={setAgentNameObj}
            brandObj={brandObj}
            setBrandObj={setBrandObj}
            objectionType={objectionType}
            setObjectionType={setObjectionType}
            contextObj={contextObj}
            setContextObj={setContextObj}
            objTalkTrack={objTalkTrack}
            objSms={objSms}
            objEmail={objEmail}
            isGeneratingObjection={isGeneratingObjection}
            onGenerateObjection={handleGenerateObjection}
          />
        )}

        {activeWorkspace === "buyer" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-[#AAB4C0]">
            Buyer Studio is in private testing. When it goes live, you
            will be able to send weekly search summaries, tour follow-up
            notes, and offer strategy emails in your voice.
          </div>
        )}
      </section>
    </AppShell>
  );
}

// ----- Reusable components -----

type WorkspaceCardProps = {
  label: string;
  title: string;
  status: string;
  description: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

function WorkspaceCard({
  label,
  title,
  status,
  description,
  active,
  disabled,
  onClick,
}: WorkspaceCardProps) {
  const base =
    "relative flex flex-col gap-3 rounded-2xl border px-4 py-4 text-left transition shadow-[0_0_18px_rgba(0,0,0,0.55)]";
  const activeStyles =
    "border-[#1A73E8] bg-[rgba(16,20,31,0.95)] shadow-[0_0_28px_rgba(26,115,232,0.55)]";
  const inactiveStyles =
    "border-white/10 bg-[rgba(10,12,20,0.95)] hover:border-[#1A73E8]/55 hover:shadow-[0_0_22px_rgba(26,115,232,0.45)]";
  const disabledStyles = "opacity-60 cursor-not-allowed";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`${base} ${active ? activeStyles : inactiveStyles} ${
        disabled ? disabledStyles : ""
      }`}
    >
      <div className="flex items-center justify-between text-xs text-[#AAB4C0]">
        <span className="uppercase tracking-[0.18em]">{label}</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] ${
            active
              ? "border-[#4D9FFF] text-[#4D9FFF]"
              : "border-white/20 text-white/70"
          }`}
        >
          {status}
        </span>
      </div>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#AAB4C0]">
          {description}
        </p>
      </div>
    </button>
  );
}

// ----- Listing Intelligence -----

type ListingSectionProps = {
  propertyText: string;
  setPropertyText: (value: string) => void;
  pack: IntelligencePack;
  isGenerating: boolean;
  onGenerate: () => void;
  activeTab: ListingTabId;
  setActiveTab: (id: ListingTabId) => void;
};

function ListingIntelligenceSection({
  propertyText,
  setPropertyText,
  pack,
  isGenerating,
  onGenerate,
  activeTab,
  setActiveTab,
}: ListingSectionProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* Input */}
      <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.98)] p-5 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
        <h2 className="mb-1 text-sm font-semibold">
          Listing Intelligence
        </h2>
        <p className="mb-4 text-xs text-[#AAB4C0]">
          Turn one property description into a full MLS + social +
          talking-point system.
        </p>

        <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#AAB4C0]">
          Property details
        </label>
        <textarea
          value={propertyText}
          onChange={(e) => setPropertyText(e.target.value)}
          placeholder="Paste full property details here (address, features, upgrades, location description, etc.)"
          className="mb-4 h-44 w-full rounded-lg border border-white/15 bg-[#101321] p-3 text-sm text-white placeholder-[#6B7280] focus:border-[#1A73E8] focus:outline-none focus:ring-0"
        />

        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="mt-1 w-full rounded-lg bg-[#1A73E8] py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating pack…" : "Generate Intelligence Pack"}
        </button>

        <p className="mt-2 text-[11px] text-[#AAB4C0]">
          Outputs stay in this session only. Model calls are powered by
          OpenAI and tuned for real-estate workflows.
        </p>
      </div>

      {/* Output with tabs */}
      <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.98)] p-4 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
        {/* Tab bar */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {[
            { id: "listing", label: "Listing copy" },
            { id: "social", label: "Social kit" },
            { id: "emails", label: "Emails" },
            { id: "talking", label: "Talking points" },
            { id: "insights", label: "Insights" },
            { id: "pitch", label: "Open-house pitch" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ListingTabId)}
              className={`rounded-full px-3 py-1 transition ${
                activeTab === tab.id
                  ? "bg-[#1A73E8] text-white shadow-[0_0_16px_rgba(26,115,232,0.55)]"
                  : "bg-transparent text-[#AAB4C0] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 text-xs">
          {activeTab === "listing" && (
            <>
              <OutputCard
                title="Long MLS description"
                value={pack.listing?.long}
              />
              <OutputCard
                title="Short description"
                value={pack.listing?.short}
              />
              <OutputCard
                title="Feature bullets"
                value={
                  pack.listing?.bullets?.length
                    ? pack.listing.bullets.join("\n• ")
                    : ""
                }
                prefixBullet
              />
            </>
          )}

          {activeTab === "social" && (
            <>
              <OutputCard
                title="Instagram caption"
                value={pack.social?.instagram_caption}
              />
              <OutputCard
                title="Facebook post"
                value={pack.social?.facebook_post}
              />
              <OutputCard
                title="LinkedIn post"
                value={pack.social?.linkedin_post}
              />
              <OutputCard
                title="TikTok hook"
                value={pack.social?.tiktok_hook}
              />
              <OutputCard
                title="TikTok script"
                value={pack.social?.tiktok_script}
              />
            </>
          )}

          {activeTab === "emails" && (
            <>
              <OutputCard
                title="Buyer email"
                value={pack.emails?.buyer_email}
              />
              <OutputCard
                title="Seller email"
                value={pack.emails?.seller_email}
              />
            </>
          )}

          {activeTab === "talking" && (
            <>
              <OutputCard
                title="Seller highlights"
                value={pack.talking_points?.highlights?.join("\n• ")}
                prefixBullet
              />
              <OutputCard
                title="Buyer concerns"
                value={pack.talking_points?.buyer_concerns?.join("\n• ")}
                prefixBullet
              />
              <OutputCard
                title="Suggested responses"
                value={pack.talking_points?.responses?.join("\n• ")}
                prefixBullet
              />
            </>
          )}

          {activeTab === "insights" && (
            <>
              <OutputCard
                title="Marketability score (1–10)"
                value={
                  pack.marketability?.score_1_to_10 != null
                    ? String(pack.marketability.score_1_to_10)
                    : ""
                }
              />
              <OutputCard
                title="Marketability summary"
                value={pack.marketability?.summary}
              />
              <OutputCard
                title="Improvement suggestions"
                value={pack.marketability?.improvement_suggestions?.join(
                  "\n• "
                )}
                prefixBullet
              />
            </>
          )}

          {activeTab === "pitch" && (
            <OutputCard
              title="Open-house pitch"
              value={pack.open_house_pitch}
            />
          )}
        </div>
      </div>
    </section>
  );
}

// ----- Generic output card with copy button -----

type OutputCardProps = {
  title: string;
  value?: string;
  prefixBullet?: boolean;
};

function OutputCard({ title, value, prefixBullet }: OutputCardProps) {
  const [copied, setCopied] = useState(false);

  // What we show on screen
  const display = value
    ? prefixBullet
      ? "• " + value
      : value
    : "Generated copy will appear here.";

  const handleCopy = async () => {
    if (!value) return;
    try {
      // Copy exactly what the user sees
      const toCopy = prefixBullet ? "• " + value : value;
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  return (
        <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.98)] p-4 text-sm shadow-[0_0_22px_rgba(0,0,0,0.65)]">
      <div className="mb-2 flex items-center justify-between text-xs text-[#AAB4C0]">
        <span className="font-medium">{title}</span>

        <button
          type="button"
          onClick={handleCopy}
          disabled={!value}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition
            ${
              copied
                ? "border-emerald-400 text-emerald-300 bg-emerald-500/10"
                : "border-white/25 text-white/70 hover:border-[#1A73E8] hover:text-[#4D9FFF]"
            }
            disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {copied ? (
            <>
              <span>✓</span>
              <span>Copied</span>
            </>
          ) : (
            <span>Copy</span>
          )}
        </button>
      </div>

       {/* Normal, easy-to-read body text (no weird mono font) */}
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#E5E7EB]">
        {display}
      </p>
    </div>
  );
}

// ----- Seller Studio -----

type SellerStudioProps = {
  activeTool: SellerToolId;
  setActiveTool: (tool: SellerToolId) => void;

  // Prelisting
  sellerNamePL: string;
  setSellerNamePL: (v: string) => void;
  addressPL: string;
  setAddressPL: (v: string) => void;
  contextPL: string;
  setContextPL: (v: string) => void;
  agentNamePL: string;
  setAgentNamePL: (v: string) => void;
  preEmail1: string;
  preEmail2: string;
  preEmail3: string;
  isGeneratingPrelisting: boolean;
  onGeneratePrelisting: () => void;

  // Presentation
  sellerNameLP: string;
  setSellerNameLP: (v: string) => void;
  addressLP: string;
  setAddressLP: (v: string) => void;
  contextLP: string;
  setContextLP: (v: string) => void;
  agentNameLP: string;
  setAgentNameLP: (v: string) => void;
  brandLP: string;
  setBrandLP: (v: string) => void;
  styleLP: string;
  setStyleLP: (v: string) => void;
  lpOpening: string;
  lpQuestions: string;
  lpStory: string;
  lpPricing: string;
  lpMarketing: string;
  lpProcess: string;
  lpValue: string;
  lpNextSteps: string;
  isGeneratingPresentation: boolean;
  onGeneratePresentation: () => void;

  // Objection
  sellerNameObj: string;
  setSellerNameObj: (v: string) => void;
  agentNameObj: string;
  setAgentNameObj: (v: string) => void;
  brandObj: string;
  setBrandObj: (v: string) => void;
  objectionType: string;
  setObjectionType: (v: string) => void;
  contextObj: string;
  setContextObj: (v: string) => void;
  objTalkTrack: string;
  objSms: string;
  objEmail: string;
  isGeneratingObjection: boolean;
  onGenerateObjection: () => void;
};

function SellerStudioSection(props: SellerStudioProps) {
  const { activeTool, setActiveTool } = props;

  return (
    <section className="space-y-4">
      {/* Tab bar for Seller Studio tools */}
      {/* Tab bar for Seller Studio tools */}
  <div className="flex flex-col gap-2 text-xs sm:inline-flex sm:flex-row sm:flex-wrap sm:rounded-full sm:bg-white/5 sm:p-1">
    <SellerTab
      label="Pre-listing Emails"
      description="3-part warm-up drip."
      active={activeTool === "prelisting"}
      onClick={() => setActiveTool("prelisting")}
    />
    <SellerTab
      label="Listing Presentation"
      description="Structured deck outline."
      active={activeTool === "presentation"}
      onClick={() => setActiveTool("presentation")}
    />
    <SellerTab
      label="Objection Lab"
      description="Live script + SMS + email."
      active={activeTool === "objection"}
      onClick={() => setActiveTool("objection")}
    />
  </div>

      {activeTool === "prelisting" && <PrelistingPanel {...props} />}
      {activeTool === "presentation" && <PresentationPanel {...props} />}
      {activeTool === "objection" && <ObjectionPanel {...props} />}
    </section>
  );
}

type SellerTabProps = {
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
};

function SellerTab({
  label,
  description,
  active,
  onClick,
}: SellerTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full sm:w-auto
        flex flex-col
        rounded-xl sm:rounded-full
        px-4 py-2 sm:py-1.5
        text-left
        transition
        border
        ${
          active
            ? "bg-[#1A73E8] border-[#1A73E8] text-white shadow-[0_0_16px_rgba(26,115,232,0.55)]"
            : "border-transparent text-[#AAB4C0] hover:text-white hover:bg-white/5"
        }
      `}
    >
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[10px] text-white/70 sm:text-white/60">
        {description}
      </span>
    </button>
  );
}


// ----- Seller panels -----

function PrelistingPanel({
  sellerNamePL,
  setSellerNamePL,
  addressPL,
  setAddressPL,
  contextPL,
  setContextPL,
  agentNamePL,
  setAgentNamePL,
  preEmail1,
  preEmail2,
  preEmail3,
  isGeneratingPrelisting,
  onGeneratePrelisting,
}: SellerStudioProps) {
  return (
    <div className="grid gap-6 rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.98)] p-5 shadow-[0_0_24px_rgba(0,0,0,0.7)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      <div>
        <h2 className="mb-1 text-sm font-semibold">
          Seller: Pre-Listing Email Sequence
        </h2>
        <p className="mb-4 text-xs text-[#AAB4C0]">
          Turn a cold seller lead into a warm, ready-to-meet client with
          a 3-part, done-for-you email sequence.
        </p>

        <div className="space-y-3 text-xs">
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
            label="Property notes / context (optional)"
            value={contextPL}
            onChange={setContextPL}
            placeholder="Motivations, timing, property highlights, neighborhood, anything you want Avillo to know."
            rows={3}
          />
          <InputField
            label="Your name"
            value={agentNamePL}
            onChange={setAgentNamePL}
            placeholder="Dylan Jarrett"
          />
        </div>

        <button
          type="button"
          onClick={onGeneratePrelisting}
          disabled={isGeneratingPrelisting}
          className="mt-4 w-full rounded-lg bg-[#1A73E8] py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratingPrelisting
            ? "Generating pre-listing sequence…"
            : "Generate Pre-Listing Sequence"}
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <OutputCard title="Email 1" value={preEmail1} />
        <OutputCard title="Email 2" value={preEmail2} />
        <OutputCard title="Email 3" value={preEmail3} />
      </div>
    </div>
  );
}

function PresentationPanel({
  sellerNameLP,
  setSellerNameLP,
  addressLP,
  setAddressLP,
  contextLP,
  setContextLP,
  agentNameLP,
  setAgentNameLP,
  brandLP,
  setBrandLP,
  styleLP,
  setStyleLP,
  lpOpening,
  lpQuestions,
  lpStory,
  lpPricing,
  lpMarketing,
  lpProcess,
  lpValue,
  lpNextSteps,
  isGeneratingPresentation,
  onGeneratePresentation,
}: SellerStudioProps) {
  return (
    <div className="grid gap-6 rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.98)] p-5 shadow-[0_0_24px_rgba(0,0,0,0.7)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      <div>
        <h2 className="mb-1 text-sm font-semibold">
          Seller: Listing Presentation Pack
        </h2>
        <p className="mb-4 text-xs text-[#AAB4C0]">
          Turn your seller research into a structured listing
          presentation you can walk through in-person or over Zoom.
        </p>

        <div className="space-y-3 text-xs">
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
            label="Property notes / context (optional)"
            value={contextLP}
            onChange={setContextLP}
            placeholder="What makes this home & neighborhood special, seller motivations, timing, etc."
            rows={3}
          />
          <InputField
            label="Your name"
            value={agentNameLP}
            onChange={setAgentNameLP}
            placeholder="Dylan Jarrett"
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
        </div>

        <button
          type="button"
          onClick={onGeneratePresentation}
          disabled={isGeneratingPresentation}
          className="mt-4 w-full rounded-lg bg-[#1A73E8] py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratingPresentation
            ? "Generating listing presentation…"
            : "Generate Presentation Pack"}
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <OutputCard title="Opening & rapport" value={lpOpening} />
        <OutputCard title="Questions to ask them" value={lpQuestions} />
        <OutputCard
          title="Property & neighborhood story"
          value={lpStory}
        />
        <OutputCard title="Pricing strategy" value={lpPricing} />
        <OutputCard title="Marketing plan" value={lpMarketing} />
        <OutputCard title="Process & timeline" value={lpProcess} />
        <OutputCard title="Your value" value={lpValue} />
        <OutputCard title="Next steps" value={lpNextSteps} />
      </div>
    </div>
  );
}

function ObjectionPanel({
  sellerNameObj,
  setSellerNameObj,
  agentNameObj,
  setAgentNameObj,
  brandObj,
  setBrandObj,
  objectionType,
  setObjectionType,
  contextObj,
  setContextObj,
  objTalkTrack,
  objSms,
  objEmail,
  isGeneratingObjection,
  onGenerateObjection,
}: SellerStudioProps) {
  return (
    <div className="grid gap-6 rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.98)] p-5 shadow-[0_0_24px_rgba(0,0,0,0.7)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      <div>
        <h2 className="mb-1 text-sm font-semibold">
          Seller Objection Lab
        </h2>
        <p className="mb-4 text-xs text-[#AAB4C0]">
          Drop in a common objection and Avillo will give you a live talk
          track, a text-message version, and a longer follow-up email.
        </p>

        <div className="space-y-3 text-xs">
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
            placeholder="Dylan Jarrett"
          />
          <InputField
            label="Brand positioning (optional)"
            value={brandObj}
            onChange={setBrandObj}
            placeholder="Local expert, data-driven, high-touch"
          />

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#AAB4C0]">
              Objection type
            </label>
            <select
              value={objectionType}
              onChange={(e) => setObjectionType(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#101321] p-2.5 text-xs text-white focus:border-[#1A73E8] focus:outline-none focus:ring-0"
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
            placeholder="Meeting setting, their personality, price range, how the conversation has gone so far, etc."
            rows={3}
          />
        </div>

        <button
          type="button"
          onClick={onGenerateObjection}
          disabled={isGeneratingObjection}
          className="mt-4 w-full rounded-lg bg-[#1A73E8] py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratingObjection
            ? "Generating responses…"
            : "Generate Responses"}
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <OutputCard title="Live talk track" value={objTalkTrack} />
        <OutputCard title="Text message reply" value={objSms} />
        <OutputCard title="Email follow-up" value={objEmail} />
      </div>
    </div>
  );
}

// ----- Small input helpers -----

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
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#AAB4C0]">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/15 bg-[#101321] p-2.5 text-xs text-white placeholder-[#6B7280] focus:border-[#1A73E8] focus:outline-none focus:ring-0"
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
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#AAB4C0]">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-lg border border-white/15 bg-[#101321] p-2.5 text-xs text-white placeholder-[#6B7280] focus:border-[#1A73E8] focus:outline-none focus:ring-0"
      />
    </div>
  );
}