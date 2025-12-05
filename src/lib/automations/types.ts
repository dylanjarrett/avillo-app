// src/lib/automations/types.ts

export type AutomationTrigger =
  | "NEW_CONTACT"
  | "STAGE_CHANGE"
  | "NEW_LISTING"
  | "LISTING_STATUS_CHANGE"
  | "LISTING_SELLER_ASSIGNED"
  | "LISTING_BUYER_ASSIGNED"
  | "LISTING_SELLER_UNLINKED"
  | "LISTING_BUYER_UNLINKED";

export type AutomationContext = {
  userId: string;
  contactId?: string;
  listingId?: string;
};

export type AutomationStep =
  | {
      type: "SEND_SMS";
      message: string;
    }
  | {
      type: "SEND_EMAIL";
      subject: string;
      body: string;
    }
  | {
      type: "UPDATE_CONTACT_STAGE";
      stage: "new" | "warm" | "hot" | "past";
    }
  | {
      type: "DELAY";
      milliseconds: number;
    }
  | {
      type: "WAIT_FOR_STAGE";
      stage: "new" | "warm" | "hot" | "past";
    }
  | {
      type: "CREATE_CRM_NOTE";
      text: string;
    };