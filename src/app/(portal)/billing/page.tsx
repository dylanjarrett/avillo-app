// src/app/(portal)/billing/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import PageHeader from "@/components/layout/page-header";

type BillingPeriod = "monthly" | "annual";
type CheckoutPlan = "starter" | "pro" | "founding_pro";

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update: refreshSession } = useSession();

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<CheckoutPlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Post-checkout verifier state
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const isAnnual = billingPeriod === "annual";

  // Prices (display only) — actual Stripe price IDs live server-side in /api/stripe/checkout
  const display = useMemo(() => {
    return {
      starter: {
        amount: isAnnual ? 490 : 49,
        suffix: isAnnual ? "/yr" : "/mo",
        caption: isAnnual ? "Billed annually — save 2 months" : "Billed monthly — cancel anytime",
      },
      pro: {
        amount: isAnnual ? 1290 : 129,
        suffix: isAnnual ? "/yr" : "/mo",
        caption: isAnnual ? "Billed annually — save 2 months" : "Billed monthly — cancel anytime",
      },
      founding_pro: {
        amount: isAnnual ? 990 : 99,
        suffix: isAnnual ? "/yr" : "/mo",
        caption: isAnnual ? "Billed annually — save 2 months" : "Billed monthly — cancel anytime",
      },
    };
  }, [isAnnual]);

  /**
   * ✅ After Stripe redirects back to:
   * /billing?status=success&session_id=cs_...
   * we must POST that sessionId to:
   * /api/stripe/checkout/verify
   */
  useEffect(() => {
    const status = searchParams.get("status");
    if (status !== "success") return;
    if (verifying) return;

    const sessionId = (searchParams.get("session_id") || "").trim();

    (async () => {
      try {
        setVerifying(true);
        setVerifyError(null);

        if (!sessionId) {
          throw new Error("Missing session_id from Stripe return URL.");
        }

        const res = await fetch("/api/stripe/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Unable to verify subscription.");
        }

        // Refresh NextAuth session/JWT so middleware reads new accessLevel/plan/status
        await refreshSession?.();

        // Give the browser one microtask to flush the updated cookie
        await new Promise((r) => setTimeout(r, 50));

        // 🚀 Redirect into the app
        router.replace("/dashboard");

        // Optional: if you want to auto-enter the app:
        // router.push("/dashboard");
      } catch (e: any) {
        console.error("[billing] verify error:", e);
        setVerifyError(e?.message || "Verification failed.");
      } finally {
        setVerifying(false);
      }
    })();
    // Intentionally depends on the searchParams object; it updates when URL changes.
  }, [searchParams, router, refreshSession, verifying]);

  async function startCheckout(plan: CheckoutPlan) {
    if (checkoutLoading || verifying) return;

    try {
      setCheckoutLoading(plan);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, period: billingPeriod }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }

      alert(data?.error ?? "Unable to start checkout.");
    } catch (err) {
      console.error("Checkout error", err);
      alert("Unable to start checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function openBillingPortal() {
    if (portalLoading || verifying) return;

    try {
      setPortalLoading(true);

      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }

      alert(data?.error ?? "Unable to open billing portal.");
    } catch (err) {
      console.error("Billing portal error", err);
      alert("Unable to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  /**
   * NOTE:
   * When you want to show real current plan/status, read it from your /api/account/me.
   * For now we keep the UI static.
   */
  const currentPlanLabel = "Early Access";
  const currentPlanStatus = "Active";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="BILLING"
        title="Choose your Avillo plan"
        subtitle="Starter is built for control. Pro is built for leverage — automate follow-ups and reuse AI prompts with listing/contact context."
      />

      {/* ✅ Post-checkout verification banner */}
      {verifying && (
        <div className="rounded-2xl border border-amber-200/30 bg-amber-100/10 px-5 py-3 text-xs text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.18)]">
          Finalizing your subscription… hang tight.
        </div>
      )}

      {verifyError && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-xs text-red-200 shadow-[0_0_24px_rgba(248,113,113,0.18)]">
          {verifyError}
        </div>
      )}

      {/* Current plan / status */}
      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Current plan
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-50">
              {currentPlanLabel}
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                {currentPlanStatus}
              </span>
            </p>

            <p className="mt-1 text-[11px] text-slate-400/90">
              Paid plans include a <span className="font-semibold text-slate-200">30-day trial</span>.{" "}
              Upgrade anytime to unlock Autopilot workflows, branching logic, and saved AI prompts with
              listing/contact context.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 text-[11px] md:items-end">
            <p className="text-slate-400/90">
              Need help with billing?{" "}
              <a
                href="mailto:billing@avillo.io"
                className="font-semibold text-amber-100 underline-offset-2 hover:underline"
              >
                billing@avillo.io
              </a>
            </p>

            <button
              type="button"
              onClick={openBillingPortal}
              disabled={portalLoading || verifying}
              className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {portalLoading ? "Opening billing portal…" : "Manage billing"}
            </button>
          </div>
        </div>
      </div>

      {/* Billing period toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-300/90">Toggle between monthly and yearly. Yearly plans save 2 months.</p>

        <div className="w-full sm:w-auto">
          <div className="flex w-full rounded-full border border-slate-700 bg-slate-950/80 p-1 text-[11px] font-semibold text-slate-300 shadow-[0_0_24px_rgba(15,23,42,0.85)]">
            <button
              type="button"
              onClick={() => setBillingPeriod("monthly")}
              disabled={verifying}
              className={
                "flex-1 rounded-full px-3 py-1.5 transition " +
                (billingPeriod === "monthly"
                  ? "bg-slate-800 text-amber-100 shadow-[0_0_18px_rgba(148,163,184,0.7)]"
                  : "text-slate-400")
              }
            >
              Monthly
            </button>

            <button
              type="button"
              onClick={() => setBillingPeriod("annual")}
              disabled={verifying}
              className={
                "flex-1 rounded-full px-3 py-1.5 text-center transition " +
                (billingPeriod === "annual"
                  ? "bg-amber-100 text-slate-900 shadow-[0_0_22px_rgba(251,191,36,0.75)]"
                  : "text-slate-400")
              }
            >
              Yearly{" "}
              <span className="block text-[9px] uppercase tracking-wide sm:inline">
                ~ Save 2 months
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pricing grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Starter */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(248,250,252,0.10),transparent_55%)]" />

          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-200">Starter</p>

          <p className="mt-3 text-3xl font-semibold text-slate-50">
            ${display.starter.amount}
            <span className="text-base font-normal opacity-70">{display.starter.suffix}</span>
          </p>

          <p className="text-xs text-slate-400">{display.starter.caption}</p>

          <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300/90">
            Includes a 30-day trial on upgrade.
          </div>

          <ul className="mt-5 space-y-2 text-xs text-slate-200/90">
            <li>• People (CRM) + Listings + Intelligence Engines</li>
            <li>• Create & save manual tasks and notes</li>
            <li>• AI runs on-demand (limited)</li>
            <li>• Manage buyer/seller ⇆ listing relationships</li>
          </ul>

          <button
            onClick={() => startCheckout("starter")}
            disabled={checkoutLoading !== null || verifying}
            className="mt-6 w-full rounded-full border border-slate-600 bg-slate-900/60 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {checkoutLoading === "starter"
              ? "Starting checkout…"
              : isAnnual
              ? "Start Starter (Yearly)"
              : "Start Starter (Monthly)"}
          </button>
        </div>

        {/* Pro (Featured) */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-200/40 bg-slate-950/90 px-6 py-6 shadow-[0_0_55px_rgba(251,191,36,0.35)]">
          <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.25),transparent_60%)]" />

          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-200">Avillo Pro</p>

            <span className="inline-flex items-center rounded-full border border-amber-200/50 bg-amber-100/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
              Recommended
            </span>
          </div>

          <p className="mt-3 text-3xl font-semibold text-amber-100">
            ${display.pro.amount}
            <span className="text-base font-normal opacity-75">{display.pro.suffix}</span>
          </p>

          <p className="text-xs text-slate-300">{display.pro.caption}</p>

          <div className="mt-3 rounded-xl border border-amber-200/30 bg-amber-100/10 px-3 py-2 text-[11px] text-amber-50/90">
            30-day Pro trial included. Unlock Autopilot + saved prompts with listing/contact context.
          </div>

          <ul className="mt-5 space-y-2 text-xs text-amber-50">
            <li>• Autopilot (SMS, email & task automation)</li>
            <li>• Expanded AI usage + priority processing</li>
            <li>• Save AI engine prompts for reuse and iteration</li>
            <li>• Attach AI context to a listing or contact</li>
          </ul>

          <button
            onClick={() => startCheckout("pro")}
            disabled={checkoutLoading !== null || verifying}
            className="mt-6 w-full rounded-full border border-amber-200/70 bg-amber-50/10 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {checkoutLoading === "pro"
              ? "Starting checkout…"
              : isAnnual
              ? "Start Pro (Yearly)"
              : "Start Pro (Monthly)"}
          </button>

          <p className="mt-3 text-[11px] text-slate-300/80">
            Pro is designed for leverage — less admin, more revenue time.
          </p>
        </div>

        {/* Founding Pro */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(253,230,138,0.18),transparent_55%)]" />

          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-100/90">Founding Pro</p>

            <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              Locked for life
            </span>
          </div>

          <p className="mt-3 text-3xl font-semibold text-slate-50">
            ${display.founding_pro.amount}
            <span className="text-base font-normal opacity-70">{display.founding_pro.suffix}</span>
          </p>

          <p className="text-xs text-slate-400">{display.founding_pro.caption}</p>

          <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300/90">
            Limited availability during early adoption. Includes a 30-day trial.
          </div>

          <ul className="mt-5 space-y-2 text-xs text-slate-200/90">
            <li>• Everything in Pro</li>
            <li>• Founding pricing locked for life</li>
            <li>• Early access cohort badge</li>
            <li>• Priority roadmap influence</li>
          </ul>

          <button
            onClick={() => startCheckout("founding_pro")}
            disabled={checkoutLoading !== null || verifying}
            className="mt-6 w-full rounded-full border border-amber-100/40 bg-slate-900/60 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-100/70 hover:bg-amber-50/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {checkoutLoading === "founding_pro"
              ? "Starting checkout…"
              : isAnnual
              ? "Claim Founding Pro (Yearly)"
              : "Claim Founding Pro (Monthly)"}
          </button>

          <p className="mt-3 text-[11px] text-slate-400/80">
            Founding Pro will be removed once early adoption is established.
          </p>
        </div>
      </div>

      {/* Enterprise */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_bottom_left,rgba(248,250,252,0.12),transparent_55%)]" />

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-300">Enterprise</p>
            <p className="mt-2 text-lg font-semibold text-slate-50">Custom pricing</p>
            <p className="mt-1 text-slate-400/90">
              Built for brokerages and larger teams: permissions, reporting, lead routing, and custom workflows.
            </p>

            <ul className="mt-4 space-y-2 text-[11px] text-slate-200/90">
              <li>• Centralized CRM + agent oversight</li>
              <li>• Lead routing, reporting, and governance</li>
              <li>• Priority onboarding and dedicated support</li>
            </ul>
          </div>

          <a
            href="mailto:sales@avillo.io"
            className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-900/60 px-5 py-2 text-center text-xs font-semibold text-slate-200 transition hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100"
          >
            Contact Sales
          </a>
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">Billing FAQ</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-50">Can I switch between monthly and yearly?</p>
            <p className="mt-1 text-slate-400/90">
              Yes. You can switch any time. Your next billing cycle will reflect the new period.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">What happens if I cancel?</p>
            <p className="mt-1 text-slate-400/90">
              You’ll keep access through the end of your billing period. Your workspace and data remain stored.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">How does the 30-day trial work?</p>
            <p className="mt-1 text-slate-400/90">
              Paid plans include a 30-day trial period. You can cancel any time before the trial ends.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">How do Enterprise plans work?</p>
            <p className="mt-1 text-slate-400/90">
              Enterprise pricing is based on agent count, integrations, and onboarding/support needs. Email{" "}
              <a
                href="mailto:sales@avillo.io"
                className="font-semibold text-amber-100 underline-offset-2 hover:underline"
              >
                sales@avillo.io
              </a>{" "}
              for details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
