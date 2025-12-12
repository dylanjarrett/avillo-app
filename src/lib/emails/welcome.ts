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
  <div style="background-color:#0B1020;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#0f172a;border-radius:24px;padding:32px 24px;border:1px solid rgba(148,163,184,0.35);">

      <!-- Logo -->
      <div style="text-align:center;margin-bottom:24px;">
        <img
          src="${safeLogoUrl}"
          alt="Avillo"
          style="max-width:220px;height:auto;display:inline-block;filter:drop-shadow(0 0 24px rgba(244,210,106,0.65));"
        />
      </div>

      <!-- Card body -->
      <div style="background:#020617;border-radius:18px;padding:24px 20px;border:1px solid rgba(148,163,184,0.35);">
        <p style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9ca3af;margin:0 0 8px;">
          Welcome to Avillo
        </p>

        <h1 style="font-size:18px;font-weight:600;color:#e5e7eb;margin:0 0 16px;">
          Welcome to Avillo, ${firstName}.
        </h1>

        <p style="font-size:13px;line-height:1.6;color:#d1d5db;margin:0 0 12px;">
          We're really glad you're here. You’re early to what we’re building with Avillo — an AI operating system for real estate designed to remove busywork and give you back your time.
        </p>

        <p style="font-size:13px;line-height:1.6;color:#d1d5db;margin:0 0 12px;">
          Because you're part of the private beta, your feedback has a direct impact on Avillo’s future. We’re shaping this platform <strong>with you</strong>, not just for you — and your ideas genuinely help us build a better experience for every agent who joins after you.
        </p>

        <p style="font-size:13px;line-height:1.6;color:#d1d5db;margin:0 0 16px;">
          You can sign in anytime at:
          <br />
          <a href="http://${safeAppUrl}" style="color:#f4d26a;text-decoration:none;" target="_blank" rel="noopener">${safeAppUrl}</a>
        </p>

        <p style="font-size:13px;line-height:1.6;color:#d1d5db;margin:0 0 4px;">
          If you ever have questions, ideas, or feedback — even small things — just reply to this email or reach us at
          <a href="mailto:support@avillo.io" style="color:#f4d26a;text-decoration:none;">support@avillo.io</a>.
          We truly value your input, and we read every message.
        </p>

        <p style="font-size:13px;line-height:1.6;color:#d1d5db;margin:18px 0 0;">
          — The Avillo team
        </p>
      </div>
    </div>
  </div>
  `;
}
