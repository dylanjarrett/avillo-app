// src/lib/automations/messaging.ts
import { sendSms } from "@/lib/twilioClient";
import { sendEmail } from "@/lib/resendClient";
import { prisma } from "@/lib/prisma";
import { getActiveOwnedSmsNumber } from "@/lib/comms/getActiveOwnedSmsNumber";

type SendAutomationSmsArgs = {
  userId: string;
  workspaceId: string;
  to: string;
  body: string;
  contactId?: string | null;
  listingId?: string | null;
  automationRunId?: string | null;
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
  const {
    userId,
    workspaceId,
    to,
    body,
    contactId,
    listingId,
    automationRunId,
  } = args;

  if (!(await isMember(workspaceId, userId))) {
    console.warn("🚫 [AUTOMATION] SMS blocked (no workspace membership)", {
      userId,
      workspaceId,
    });
    return {
      success: false,
      blocked: true,
      error: "User is not an active member of this workspace.",
    } as const;
  }

  const ownedNumber = await getActiveOwnedSmsNumber({ workspaceId, userId });

  if (!ownedNumber) {
    console.warn("🚫 [AUTOMATION] SMS blocked (no active provisioned number)", {
      userId,
      workspaceId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
    });

    return {
      success: false,
      blocked: true,
      error: "No active provisioned SMS number found for this user. Provision one in Comms first.",
    } as const;
  }

  console.log("📨 [AUTOMATION] SMS →", {
    from: ownedNumber.e164,
    phoneNumberId: ownedNumber.id,
    to,
    preview: safeLogText(body, 60),
    userId,
    workspaceId,
    contactId: contactId ?? null,
    listingId: listingId ?? null,
    automationRunId: automationRunId ?? null,
  });

  void auditMessage({
    workspaceId,
    actorUserId: userId,
    contactId: contactId ?? null,
    type: "automation_sms",
    summary: "Automation sent SMS.",
    data: {
      from: ownedNumber.e164,
      phoneNumberId: ownedNumber.id,
      to,
      preview: safeLogText(body, 60),
      listingId: listingId ?? null,
      automationRunId: automationRunId ?? null,
    },
  });

  return sendSms({
    userId,
    workspaceId,
    phoneNumberId: ownedNumber.id,
    to,
    body,
    contactId: contactId ?? null,
    listingId: listingId ?? null,
    source: "AUTOMATION",
    automationRunId: automationRunId ?? null,
  });
}

export async function sendAutomationEmail(args: SendAutomationEmailArgs) {
  const { userId, workspaceId, to, subject, html, contactId } = args;

  if (!(await isMember(workspaceId, userId))) {
    console.warn("🚫 [AUTOMATION] EMAIL blocked (no workspace membership)", {
      userId,
      workspaceId,
    });
    return { success: false, blocked: true } as const;
  }

  console.log("📧 [AUTOMATION] EMAIL →", {
    to,
    subject: safeLogText(subject, 80),
    userId,
    workspaceId,
    contactId: contactId ?? null,
  });

  void auditMessage({
    workspaceId,
    actorUserId: userId,
    contactId: contactId ?? null,
    type: "automation_email",
    summary: "Automation sent email.",
    data: { to, subject: safeLogText(subject, 80) },
  });

  return sendEmail({ to, subject, html });
}