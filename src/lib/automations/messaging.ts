// src/lib/automations/messaging.ts
import { sendSms } from "@/lib/twilioClient";
import { sendEmail } from "@/lib/resendClient";
import { prisma } from "@/lib/prisma";

type SendAutomationSmsArgs = {
  userId: string;
  workspaceId: string;
  to: string;
  body: string;
  contactId?: string | null;
};

type SendAutomationEmailArgs = {
  userId: string;
  workspaceId: string;
  to: string;
  subject: string;
  html: string;
  contactId?: string | null;
};

function safeLogText(v: string, max = 80) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function isMember(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId, removedAt: null },
    select: { id: true },
  });
  return Boolean(membership);
}

/**
 * Non-blocking audit trail (workspace-scoped).
 * We intentionally swallow errors so messaging never fails due to logging.
 */
async function auditMessage(args: {
  workspaceId: string;
  actorUserId: string;
  contactId?: string | null;
  type: "automation_sms" | "automation_email";
  summary: string;
  data?: any;
}) {
  try {
    await prisma.cRMActivity.create({
      data: {
        workspaceId: args.workspaceId,
        actorUserId: args.actorUserId,
        contactId: args.contactId ?? null,
        type: "system",
        summary: args.summary,
        data: {
          kind: args.type,
          ...(args.data ?? {}),
        },
      },
    });
  } catch {
    // non-blocking by design
  }
}

export async function sendAutomationSms(args: SendAutomationSmsArgs) {
  const { userId, workspaceId, to, body, contactId } = args;

  // Optional defense-in-depth tenant guard
  if (!(await isMember(workspaceId, userId))) {
    console.warn("🚫 [AUTOMATION] SMS blocked (no workspace membership)", { userId, workspaceId });
    return { success: false, blocked: true } as any;
  }

  console.log("📨 [AUTOMATION] SMS →", {
    to,
    preview: safeLogText(body, 60),
    userId,
    workspaceId,
    contactId: contactId ?? null,
  });

  // Fire-and-forget audit
  void auditMessage({
    workspaceId,
    actorUserId: userId,
    contactId: contactId ?? null,
    type: "automation_sms",
    summary: "Automation sent SMS.",
    data: { to, preview: safeLogText(body, 60) },
  });

  return sendSms({
    userId,
    workspaceId,
    to,
    body,
    ...(contactId ? { contactId } : {}),
    source: "AUTOPILOT",
  });
}

export async function sendAutomationEmail(args: SendAutomationEmailArgs) {
  const { userId, workspaceId, to, subject, html, contactId } = args;

  // Optional defense-in-depth tenant guard
  if (!(await isMember(workspaceId, userId))) {
    console.warn("🚫 [AUTOMATION] EMAIL blocked (no workspace membership)", { userId, workspaceId });
    return { success: false, blocked: true } as any;
  }

  console.log("📧 [AUTOMATION] EMAIL →", {
    to,
    subject: safeLogText(subject, 80),
    userId,
    workspaceId,
    contactId: contactId ?? null,
  });

  // Fire-and-forget audit
  void auditMessage({
    workspaceId,
    actorUserId: userId,
    contactId: contactId ?? null,
    type: "automation_email",
    summary: "Automation sent email.",
    data: { to, subject: safeLogText(subject, 80) },
  });

  // If you later want "from" to be workspace-branded, this is the spot.
  return sendEmail({ to, subject, html });
}