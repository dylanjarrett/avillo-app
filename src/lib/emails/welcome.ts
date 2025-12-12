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
    "https://app.avillo.io/avillo-logo-navy.png";

  return `
  <div style="background-color:#f3f4f6;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:24px;padding:24px 16px;border:1px solid #e5e7eb;">

      <!-- Logo on white -->
      <div style="text-align:center;margin-bottom:24px;">
        <img
          src="${safeLogoUrl}"
          alt="Avillo"
          style="max-width:190px;height:auto;display:inline-block;"
        />
      </div>

      <!-- Inner card -->
      <div style="background:#f9fafb;border-radius:18px;padding:24px 20px;border:1px solid #e5e7eb;">
        <p style="font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;margin:0 0 8px;">
          WELCOME TO AVILLO
        </p>

        <h1 style="font-size:18px;font-weight:600;color:#111827;margin:0 0 16px;">
          Welcome to Avillo, ${firstName}.
        </h1>

        <p style="font-size:13px;line-height:1.6;color:#374151;margin:0 0 12px;">
          We're really glad you're here. You’re early to what we’re building with Avillo — an AI operating system for real estate designed to remove busywork and give you back your time.
        </p>

        <p style="font-size:13px;line-height:1.6;color:#374151;margin:0 0 12px;">
          Because you're part of the private beta, your feedback has a direct impact on Avillo’s future. We’re shaping this platform <strong>with you</strong>, not just for you — and your ideas genuinely help us build a better experience for every agent who joins after you.
        </p>

        <p style="font-size:13px;line-height:1.6;color:#374151;margin:0 0 16px;">
          You can sign in anytime at:
          <br />
          <a href="http://${safeAppUrl}" style="color:#f4b400;text-decoration:none;" target="_blank" rel="noopener">
            ${safeAppUrl}
          </a>
        </p>

        <p style="font-size:13px;line-height:1.6;color:#374151;margin:0 0 4px;">
          If you ever have questions, ideas, or feedback — even small things — just reply to this email or reach us at
          <a href="mailto:support@avillo.io" style="color:#f4b400;text-decoration:none;">support@avillo.io</a>.
        </p>

        <p style="font-size:13px;line-height:1.6;color:#374151;margin:18px 0 0;">
          We’re building Avillo for you and with you, and we’re grateful to have you in the first wave.
        </p>

        <p style="font-size:13px;line-height:1.6;color:#374151;margin:12px 0 0;">
          — The Avillo team
        </p>
      </div>
    </div>
  </div>
  `;
}