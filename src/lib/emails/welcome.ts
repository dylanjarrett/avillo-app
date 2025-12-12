// src/lib/emails/welcome.ts
type WelcomeEmailParams = {
  name?: string | null;
  appUrl: string;
  logoUrl?: string;
};

export function buildWelcomeEmailHtml({
  name,
  appUrl,
  logoUrl,
}: WelcomeEmailParams): string {
  const firstName =
    (name || "")
      .trim()
      .split(" ")[0] || "there";

  const safeAppUrl = appUrl || "https://app.avillo.io";
  const safeLogoUrl =
    logoUrl ||
    process.env.AVILLO_LOGO_URL ||
    "https://app.avillo.io/avillo-logo.png";

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>Welcome to Avillo</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6; margin:0; padding:24px 8px;">
      <tr>
        <td align="center" style="padding:0; margin:0;">
          <!-- Outer card -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px; width:100%; background-color:#ffffff; border-radius:24px; border:1px solid #e5e7eb; overflow:hidden;">
            <tr>
              <td style="padding:28px 24px 8px 24px;">

                <!-- Logo row (bulletproof centered) -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="padding:0 0 20px 0; text-align:center;">
                      <img
                        src="${safeLogoUrl}"
                        alt="Avillo"
                        width="160"
                        style="
                          display:block;
                          margin:0 auto;
                          max-width:160px;
                          height:auto;
                        "
                      />
                    </td>
                  </tr>
                </table>

                <!-- Inner content card -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-radius:20px; border:1px solid #e5e7eb; background-color:#f9fafb;">
                  <tr>
                    <td style="padding:20px 20px 22px 20px;">

                      <p style="margin:0 0 6px 0; font-size:11px; line-height:1.4; font-weight:600; letter-spacing:0.16em; text-transform:uppercase; color:#6b7280;">
                        You're In🏡
                      </p>

                      <h1 style="margin:0 0 14px 0; font-size:18px; line-height:1.4; font-weight:600; color:#111827;">
                        Welcome to Avillo, ${firstName}.
                      </h1>

                      <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:#374151;">
                        We're really glad you're here. You're early to what we're building with Avillo — an AI operating system for real estate designed to remove busywork and give you back your time.
                      </p>

                      <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:#374151;">
                        Because you're part of the private beta, your feedback has a direct impact on Avillo's future. We're shaping this platform <strong style="font-weight:600;">with you</strong>, not just for you — and your ideas genuinely help us build a better experience for every agent who joins after you.
                      </p>

                      <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:#374151;">
                        You can sign in anytime at:
                        <br />
                        <a href="http://${safeAppUrl}" style="color:#f4b41a; text-decoration:none;" target="_blank" rel="noopener">
                          ${safeAppUrl}
                        </a>
                      </p>

                      <p style="margin:0 0 0 0; font-size:13px; line-height:1.6; color:#374151;">
                        If you ever have questions, ideas, or feedback — even small things — just reply to this email or reach us at
                        <a href="mailto:support@avillo.io" style="color:#f4b41a; text-decoration:none;">support@avillo.io</a>. We truly appreciate you helping shape Avillo.
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
          <!-- /Outer card -->
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}