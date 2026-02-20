// src/components/comms/comms-types.ts

export type CommsTab = "thread" | "calls" | "info";

export type Conversation = {
  id: string;

  title: string;
  subtitle: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;

  phone: string | null;
  contactId: string | null;

  unreadCount: number;

  readState?: {
    lastReadAt: string;
    lastReadEventId: string | null;
  } | null;

  isDraft?: boolean;

  updatedAt: string | null;
};

export type SmsMessage = {
  id: string;
  conversationId: string;

  direction: "INBOUND" | "OUTBOUND" | "SYSTEM";
  body: string;

  from: string | null;
  to: string | null;

  status: string | null;
  createdAt: string;
};

export type CallItem = {
  id: string;
  conversationId: string;

  direction: "INBOUND" | "OUTBOUND";
  status: string | null;

  from: string | null;
  to: string | null;

  durationSec: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
};