//src/lib/emails/workspace-invite.ts
type WorkspaceInviteEmailParams = {
  invitedName?: string | null;
  inviterName: string;
  workspaceName: string;
  role: "AGENT" | "ADMIN" | "OWNER";
  acceptUrl: string;
  expiresAt?: string;
  logoUrl?: string;
};

export function buildWorkspaceInviteEmailHtml({
  invitedName,
  inviterName,
  workspaceName,
  role,
  acceptUrl,
  expiresAt,
  logoUrl,
}: WorkspaceInviteEmailParams): string {
  const firstName =
    (invitedName || "")
      .trim()
      .split(" ")[0] || "there";

  const safeLogoUrl =
    logoUrl ||
    process.env.AVILLO_LOGO_URL ||
    "https://app.avillo.io/avillo-logo.png";

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>You're invited to Avillo</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6; margin:0; padding:24px 8px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px; width:100%; background-color:#ffffff; border-radius:24px; border:1px solid #e5e7eb; overflow:hidden;">
            <tr>
              <td style="padding:28px 24px 8px 24px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td align="center" style="padding:0 0 20px 0;">
                      <img
                        src="${safeLogoUrl}"
                        alt="Avillo"
                        width="160"
                        style="display:block; margin:0 auto; max-width:160px; height:auto;"
                      />
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" style="border-radius:20px; border:1px solid #e5e7eb; background-color:#f9fafb;">
                  <tr>
                    <td style="padding:20px 20px 22px 20px;">
                      <p style="margin:0 0 6px 0; font-size:11px; line-height:1.4; font-weight:600; letter-spacing:0.16em; text-transform:uppercase; color:#6b7280;">
                        You're invited 🏡
                      </p>

                      <h1 style="margin:0 0 14px 0; font-size:18px; line-height:1.4; font-weight:600; color:#111827;">
                        You’ve been invited to Avillo.
                      </h1>

                      <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:#374151;">
                        <strong style="font-weight:600;">${inviterName}</strong> has invited you to join the
                        <strong style="font-weight:600;">${workspaceName}</strong> workspace on Avillo as an
                        <strong style="font-weight:600;">${role}</strong>.
                      </p>

                      <p style="margin:0 0 14px 0; font-size:13px; line-height:1.6; color:#374151;">
                        Avillo is an AI operating system for real estate — designed to remove busywork and help agents move faster with confidence.
                      </p>

                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0;">
                        <tr>
                          <td align="center">
                            <a
                              href="${acceptUrl}"
                              target="_blank"
                              rel="noopener"
                              style="
                                display:inline-block;
                                padding:12px 18px;
                                background-color:#111827;
                                color:#ffffff;
                                font-size:13px;
                                font-weight:600;
                                text-decoration:none;
                                border-radius:10px;
                              "
                            >
                              Accept invitation
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0 0 12px 0; font-size:12px; line-height:1.6; color:#6b7280;">
                        If you don’t yet have an Avillo account, you’ll be prompted to create one.
                        If you already have an account, you’ll be signed in automatically.
                      </p>

                      ${
                        expiresAt
                          ? `<p style="margin:0 0 12px 0; font-size:12px; line-height:1.6; color:#6b7280;">
                               This invitation expires on ${expiresAt}.
                             </p>`
                          : ""
                      }

                      <p style="margin:0; font-size:12px; line-height:1.6; color:#6b7280;">
                        If you weren’t expecting this invitation, you can safely ignore this email.
                      </p>

                      <p style="margin:18px 0 0 0; font-size:13px; line-height:1.6; color:#4b5563;">
                        — The Avillo team
                      </p>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}
