// src/lib/intelligence.ts

// -----------------------------
// Listing Engine
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

// -----------------------------
// Seller Engine
// -----------------------------

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

// -----------------------------
// Buyer Engine
// -----------------------------

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

// -----------------------------
// Neighborhood Engine
// -----------------------------

export type NeighborhoodTabId =
  | "overview"
  | "schools"
  | "mobility"
  | "essentials"
  | "lifestyle";

export type NeighborhoodPack = {
  overview: {
    areaSummary: string;
    whoItFits: string;
    priceVibe: string;
    talkingPoints: string[];
  };
  schools: {
    schoolsOverview: string;
    notableSchools: string;
    schoolsDisclaimer: string;
  };
  mobility: {
    walkability: string;
    bikeability: string;
    transitOverview: string;
    drivingAccess: string;
    airports: string;
    commuteExamples: string;
  };
  essentials: {
    groceries: string;
    gyms: string;
    errands: string;
    healthcare?: string;
  };
  lifestyle: {
    parksAndOutdoors: string;
    diningNightlife: string;
    familyActivities: string;
    safetyOverview: string;
    safetyDisclaimer: string;
  };
};

// -----------------------------
// Unified Output Type
// -----------------------------

export type AvilloEngineOutput =
  | { engine: "listing"; pack: IntelligencePack }
  | { engine: "seller"; pack: SellerPack }
  | { engine: "buyer"; pack: BuyerPack }
  | { engine: "neighborhood"; pack: NeighborhoodPack };