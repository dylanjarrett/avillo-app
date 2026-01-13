import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resendClient";
import { buildWorkspaceInviteEmailHtml } from "@/lib/emails/workspace-invite";

function formatExpires(d?: Date | null) {
  if (!d) return undefined;
  try {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return undefined;
  }
}

function appBaseUrl() {
  const v =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://app.avillo.io";
  return String(v).replace(/\/+$/, "");
}

function normalizeOrigin(origin?: string | null) {
  const o = String(origin || "").trim();
  if (!o) return "";
  return o.replace(/\/+$/, "");
}

export async function sendWorkspaceInviteEmail(input: {
  workspaceId: string;
  invitedByUserId: string | null;
  toEmail: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  token: string;
  expiresAt: Date;
  origin?: string;
}) {
  const [ws, inviter] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true },
    }),
    input.invitedByUserId
      ? prisma.user.findUnique({
          where: { id: input.invitedByUserId },
          select: { name: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  const workspaceName = ws?.name?.trim() || "your team";
  const inviterName =
    inviter?.name?.trim() ||
    (inviter?.email ? inviter.email.split("@")[0] : "") ||
    "A teammate";

  const base = normalizeOrigin(input.origin) || appBaseUrl();
  const acceptUrl = `${base}/invite/accept?token=${encodeURIComponent(input.token)}`;


  const html = buildWorkspaceInviteEmailHtml({
    invitedName: null,
    inviterName,
    workspaceName,
    role: input.role,
    acceptUrl,
    expiresAt: formatExpires(input.expiresAt),
  });

  const subject = `You’ve been invited to join ${workspaceName} on Avillo`;

  return sendEmail({
    to: input.toEmail,
    subject,
    html,
    replyTo: "support@avillo.io",
  });
}