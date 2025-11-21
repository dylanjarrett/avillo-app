// src/types/avillo.ts
export interface AvilloIntelligencePack {
  listing: {
    long: string;
    short: string;
    bullets: string[];
  };
  social: {
    instagram_caption: string;
    facebook_post: string;
    linkedin_post: string;
    tiktok_hook: string;
    tiktok_script: string;
  };
  emails: {
    buyer_email: string;
    seller_email: string;
  };
  talking_points: {
    highlights: string[];
    buyer_concerns: string[];
    responses: string[];
  };
  marketability: {
    score_1_to_10: number;
    summary: string;
    improvement_suggestions: string[];
  };
  open_house_pitch: string;
  vision_features: {
    interior_style: string;
    notable_amenities: string[];
    exterior_notes: string[];
    potential_ideal_buyer: string;
  };
}
