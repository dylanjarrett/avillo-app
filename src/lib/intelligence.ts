// src/lib/intelligence.ts

// -----------------------------
// Type Definitions
// -----------------------------

// Tabs used by the Listing Engine
export type ListingTabId =
  | "listing"
  | "social"
  | "emails"
  | "talking"
  | "insights"
  | "pitch";

// Listing Intelligence Pack
export type IntelligencePack = {
  listing?: {
    long?: string;
    short?: string;
    bullets?: string[];
  };
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

// Seller Engine Types
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

// Buyer Engine Types
export type BuyerToolId = "search" | "tour" | "offer";

export type BuyerPack = {
  search?: {
    summary?: string;
    nextSteps?: string;
    smsFollowUp?: string;
  };
  tour?: {
    recapEmail?: string;
    highlights?: string;
    concerns?: string;
  };
  offer?: {
    offerEmail?: string;
    strategySummary?: string;
    negotiationPoints?: string;
  };
};

// Unified Output Type for Any Engine
export type AvilloEngineOutput =
  | { engine: "listing"; pack: IntelligencePack }
  | { engine: "seller"; pack: SellerPack }
  | { engine: "buyer"; pack: BuyerPack };