
"use client";

import { useState } from "react";
import PageHeader from "@/components/layout/page-header";

type BillingPeriod = "monthly" | "annual";

export default function BillingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const isAnnual = billingPeriod === "annual";

  async function startCheckout() {
    if (checkoutLoading) return;
    try {
      setCheckoutLoading(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", period: billingPeriod }),
      });

      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      alert(data?.error ?? "Unable to start checkout.");
    } catch (err) {
      console.error("Checkout error", err);
      alert("Unable to start checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function openBillingPortal() {
    if (portalLoading) return;
    try {
      setPortalLoading(true);

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      });

      const data = await res.json();
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="BILLING"
        title="Choose your Avillo plan"
        subtitle="Upgrade your plan to unlock more automation, intelligence, and CRM capabilities."
      />

      {/* Current plan / status */}
      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Current plan
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-50">
              Founding Agent
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                Active
              </span>
            </p>
            <p className="mt-1 text-[11px] text-slate-400/90">
              You’re part of the early access cohort. Upgrading to Avillo Pro
              adds all intelligence engines and CRM.
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
              disabled={portalLoading}
              className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 transition disabled:cursor-not-allowed disabled:opacity-70"
            >
              {portalLoading ? "Opening billing portal…" : "Manage billing"}
            </button>
          </div>
        </div>
      </div>

      {/* Billing period toggle */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-slate-300/90">
          Toggle between monthly and yearly. Yearly plans save 2 months.
        </p>

        <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/80 p-1 text-[11px] font-semibold text-slate-300 shadow-[0_0_24px_rgba(15,23,42,0.85)]">
          <button
            type="button"
            onClick={() => setBillingPeriod("monthly")}
            className={
              "rounded-full px-3 py-1 transition " +
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
            className={
              "rounded-full px-3 py-1 transition " +
              (billingPeriod === "annual"
                ? "bg-amber-100 text-slate-900 shadow-[0_0_22px_rgba(251,191,36,0.75)]"
                : "text-slate-400")
            }
          >
            Yearly{" "}
            <span className="ml-1 text-[9px] uppercase tracking-wide">
              Save 2 months
            </span>
          </button>
        </div>
      </div>

      {/* Pricing grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Founding Agent */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(253,230,138,0.15),transparent_55%)]" />

          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-100/90">
            Founding Agent
          </p>

          <p className="mt-3 text-3xl font-semibold text-slate-50">
            {isAnnual ? (
              <>
                $290<span className="text-base font-normal opacity-70">/yr</span>
              </>
            ) : (
              <>
                $29<span className="text-base font-normal opacity-70">/mo</span>
              </>
            )}
          </p>
          <p className="text-xs text-slate-400">
            {isAnnual
              ? "Billed annually — save 2 months"
              : "Billed monthly — cancel anytime"}
          </p>

          <ul className="mt-5 space-y-2 text-xs text-slate-200/90">
            <li>• Access to the Listing Engine</li>
            <li>• Saved search history</li>
          </ul>

          <button
            disabled
            className="mt-6 w-full rounded-full border border-slate-600 bg-slate-800/50 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed"
          >
            Included in early access
          </button>
        </div>

        {/* Avillo Pro */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-200/40 bg-slate-950/90 px-6 py-6 shadow-[0_0_55px_rgba(251,191,36,0.35)]">
          <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.25),transparent_60%)]" />

          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-200">
            Avillo Pro
          </p>

          <p className="mt-3 text-3xl font-semibold text-amber-100">
            {isAnnual ? (
              <>
                $790<span className="text-base font-normal opacity-75">/yr</span>
              </>
            ) : (
              <>
                $79<span className="text-base font-normal opacity-75">/mo</span>
              </>
            )}
          </p>
          <p className="text-xs text-slate-300">
            {isAnnual
              ? "Billed annually — save 2 months"
              : "Billed monthly — cancel anytime"}
          </p>

          <ul className="mt-5 space-y-2 text-xs text-amber-50">
            <li>• Access to all intelligence engines</li>
            <li>• CRM & contact management</li>
            <li>• Buyer / Seller / Listing Engines</li>
          </ul>

          <button
            onClick={startCheckout}
            disabled={checkoutLoading}
            className="mt-6 w-full rounded-full border border-amber-200/70 bg-amber-50/10 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-50/20 transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            {checkoutLoading
              ? "Starting checkout…"
              : isAnnual
              ? "Subscribe Yearly (save 2 months)"
              : "Subscribe Monthly"}
          </button>
        </div>

        {/* Enterprise */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_bottom_left,rgba(248,250,252,0.12),transparent_55%)]" />

          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-300">
            Enterprise
          </p>

          <p className="mt-3 text-3xl font-semibold text-slate-50">Custom</p>
          <p className="text-xs text-slate-400">Contact sales for pricing</p>

          <ul className="mt-5 space-y-2 text-xs text-slate-200/90">
            <li>• Designed for brokerages & real estate teams</li>
            <li>• Centralized CRM, agent oversight & permissions</li>
            <li>• Team reporting, lead routing & custom workflows</li>
            <li>• Priority onboarding and dedicated support</li>
          </ul>

          <a
            href="mailto:sales@avillo.io"
            className="mt-6 block w-full rounded-full border border-slate-600 bg-slate-900/60 py-2 text-center text-xs font-semibold text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100 transition"
          >
            Contact Sales
          </a>
        </div>
      </div>

      {/* FAQ Card (unchanged) */}
      <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
          Billing FAQ
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-50">
              Can I switch between monthly and yearly?
            </p>
            <p className="mt-1 text-slate-400/90">
              Yes. You can upgrade from monthly to yearly at any time. Your next
              billing cycle will reflect the new plan.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">
              What happens if I cancel?
            </p>
            <p className="mt-1 text-slate-400/90">
              You’ll keep access until the end of your current billing period.
              Your workspace and data remain safely stored.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">
              Is the Founding Agent plan going away?
            </p>
            <p className="mt-1 text-slate-400/90">
              Founding Agents lock in early access pricing during the beta. You
              can upgrade to Avillo Pro at any time.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">
              How do Enterprise plans work?
            </p>
            <p className="mt-1 text-slate-400/90">
              Enterprise is tailored for broker/owner and team leads. Pricing is
              based on agent count, integrations, and support level. Reach out
              to{" "}
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
