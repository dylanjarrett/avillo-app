//components/comms/comms-types.ts
export type CommsTab = "thread" | "calls" | "info";

export type Conversation = {
  id: string;

  // Display
  title: string; // contact name OR phone OR "Unknown"
  subtitle?: string | null; // phone or secondary label
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;

  // Thread identity
  phone?: string | null; // other party phone (E.164 preferred)
  contactId?: string | null;

  // Badge
  unreadCount?: number;

  // Optional metadata
  updatedAt?: string | null;
};

export type SmsMessage = {
  id: string;
  conversationId: string;

  direction: "INBOUND" | "OUTBOUND" | "SYSTEM";
  body: string;

  from?: string | null;
  to?: string | null;

  status?: string | null; // queued/sent/delivered/failed etc
  createdAt: string;
};

export type CallItem = {
  id: string;
  conversationId: string;

  direction: "INBOUND" | "OUTBOUND";
  status?: string | null;

  from?: string | null;
  to?: string | null;

  durationSec?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string | null;
};