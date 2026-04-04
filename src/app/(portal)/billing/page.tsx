// src/app/(portal)/billing/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import PageHeader from "@/components/layout/page-header";

type BillingPeriod = "monthly" | "annual";
type CheckoutPlan = "starter" | "pro" | "founding_pro" | "enterprise";

type BillingStatusResponse = {
  workspace?: {
    id: string;
    type: string;

    accessLevel: string;
    plan: "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE" | string;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;

    seatLimit: number | null;
    includedSeats: number | null;
    seatsUsed: number;

    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;

    flags?: {
      isEnterprise: boolean;
      isTrialingBase: boolean;
      stripeSource: "db" | "stripe";
      syncAt: string | null;
    };

    trial?: {
      isTrialingBase: boolean;
      endsAt: string | null;
      note?: string;
    };

    seats?: {
      includedSeats: number;
      seatLimit: number;
      extraSeats: number;
      seatsUsed: number;
    };
  };
  error?: string;
};

function formatDate(raw?: string | null) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function clampInt(n: unknown, min: number, max: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update: refreshSession } = useSession();

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [ws, setWs] = useState<BillingStatusResponse["workspace"] | null>(null);

  const [checkoutLoading, setCheckoutLoading] = useState<CheckoutPlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Enterprise slider reflects desired seatLimit (total seats, not extra seats)
  const [enterpriseSeatLimit, setEnterpriseSeatLimit] = useState<number>(5);

  const [seatSaving, setSeatSaving] = useState(false);
  const [seatSaveError, setSeatSaveError] = useState<string | null>(null);
  const [seatSaveSuccess, setSeatSaveSuccess] = useState<string | null>(null);

  const verifyRanRef = useRef(false);

  const isAnnual = billingPeriod === "annual";

  // Treat "Enterprise" as true if plan says so OR the status endpoint flags it as enterprise.
  const isEnterprise = useMemo(() => {
    if (!ws) return false;
    if (ws.plan === "ENTERPRISE") return true;
    if (ws.flags?.isEnterprise) return true;
    return false;
  }, [ws]);

  const isTrialing = useMemo(() => {
    return !!ws?.trial?.isTrialingBase;
  }, [ws?.trial?.isTrialingBase]);

  async function fetchBillingStatus(opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    try {
      if (!silent) {
        setStatusLoading(true);
        setStatusError(null);
      }

      // Bust any intermediate caching/proxies
      const res = await fetch(`/api/billing/status?t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await res.json().catch(() => ({}))) as BillingStatusResponse;

      if (!res.ok) {
        setWs(null); // prevent stale plan rendering
        setStatusError(data?.error || "Unable to load billing status.");
        return null;
      }

      const next = data.workspace ?? null;
      setWs(next);

      // Only force-sync the slider from server truth when:
      // - we are enterprise, OR
      // - we don't have a local user-chosen seat limit yet (initial load)
      if (next?.seats?.seatLimit) {
        const serverLimit = Math.max(5, Number(next.seats.seatLimit));
        if (next.flags?.isEnterprise || next.plan === "ENTERPRISE") {
          setEnterpriseSeatLimit(serverLimit);
        } else {
          // Keep slider sane if user has never touched it
          setEnterpriseSeatLimit((prev) => (prev ? prev : serverLimit));
        }
      } else if (next?.plan === "ENTERPRISE") {
        const limit = Math.max(5, Number(next.seatLimit ?? 5));
        setEnterpriseSeatLimit(limit);
      }

      return next;
    } finally {
      if (!silent) setStatusLoading(false);
    }
  }

  useEffect(() => {
    void refreshSession?.();
    void fetchBillingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verify after Stripe redirect (stay on billing; poll status until sync)
  useEffect(() => {
    const status = searchParams.get("status");
    if (status !== "success") return;
    if (verifying) return;
    if (verifyRanRef.current) return;

    const sessionId = (searchParams.get("session_id") || "").trim();

    verifyRanRef.current = true;

    (async () => {
      try {
        setVerifying(true);
        setVerifyError(null);

        if (!sessionId) throw new Error("Missing session_id from Stripe return URL.");

        const res = await fetch("/api/stripe/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Unable to verify subscription.");

        await refreshSession?.();

        // Poll billing status so UI doesn’t flash stale DB values while webhooks catch up.
        // Stop early once Stripe/DB agree on having a subscription id and a non-empty plan.
        for (let i = 0; i < 10; i++) {
          const next = await fetchBillingStatus({ silent: true });

          const hasSub = !!next?.stripeSubscriptionId;
          const hasPlan = !!next?.plan;
          if (hasSub && hasPlan) break;

          await new Promise((r) => setTimeout(r, 350));
        }

        // Stay on billing, remove Stripe params from URL.
        router.replace("/billing");
        router.refresh();
      } catch (e: any) {
        console.error("[billing] verify error:", e);
        setVerifyError(e?.message || "Verification failed.");
      } finally {
        setVerifying(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Display pricing only
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

  const seats = useMemo(() => {
    // Server truth (if enterprise) otherwise default enterprise assumptions for preview
    const serverIncluded = Number(ws?.seats?.includedSeats ?? ws?.includedSeats ?? 5);
    const included = Math.max(5, serverIncluded);

    // UI slider is total seatLimit; clamp for safety
    const limit = Math.max(included, clampInt(enterpriseSeatLimit || included, included, 500));
    const extra = Math.max(0, limit - included);

    const baseMonthly = 1000;
    const seatMonthly = 100;
    const monthlyTotal = baseMonthly + extra * seatMonthly;

    return {
      includedSeats: included,
      seatLimit: limit,
      extraSeats: extra,
      seatsUsed: Number(ws?.seats?.seatsUsed ?? ws?.seatsUsed ?? 0),
      baseMonthly,
      seatMonthly,
      monthlyTotal,
    };
  }, [
    enterpriseSeatLimit,
    ws?.includedSeats,
    ws?.seatLimit,
    ws?.seats?.includedSeats,
    ws?.seats?.seatsUsed,
    ws?.seatsUsed,
  ]);

  const currentPlanLabel = useMemo(() => {
    const p = ws?.plan;
    if (!p) return "Early Access";
    if (p === "FOUNDING_PRO") return "Founding Pro";
    if (p === "ENTERPRISE") return "Enterprise";
    if (p === "PRO") return "Avillo Pro";
    if (p === "STARTER") return "Starter";
    return String(p);
  }, [ws?.plan]);

  const currentPlanStatus = useMemo(() => {
    if (!ws) return "Unavailable";

    if (ws.accessLevel === "BETA") return "Beta";
    if (ws.accessLevel === "EXPIRED") return "Inactive";

    const s = ws.subscriptionStatus;
    if (!s || s === "NONE") return "No subscription";
    if (s === "TRIALING") return "Trialing";
    if (s === "ACTIVE") return "Active";
    if (s === "PAST_DUE") return "Past due";
    if (s === "CANCELED") return "Canceled";

    return String(s);
  }, [ws]);

  const trialEndsLabel = formatDate(ws?.trial?.endsAt ?? ws?.trialEndsAt);
  const showTrialBanner = !!ws?.trial?.isTrialingBase && !!trialEndsLabel;

  async function startCheckout(plan: CheckoutPlan) {
    if (checkoutLoading || verifying) return;

    try {
      setCheckoutLoading(plan);

      const payload: any = { plan, period: billingPeriod };

      // Enterprise: monthly-only + pass seatLimit from slider
      if (plan === "enterprise") {
        payload.period = "monthly";
        payload.seatLimit = seats.seatLimit;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }

      if (res.status === 409 && data?.redirectToPortal) {
        await openBillingPortal();
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

  async function updateEnterpriseSeats() {
    if (seatSaving || verifying) return;

    setSeatSaveError(null);
    setSeatSaveSuccess(null);

    try {
      setSeatSaving(true);

      const res = await fetch("/api/billing/enterprise/seats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatLimit: seats.seatLimit }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Unable to update seats.");

      // Immediately trust the server’s returned seatLimit if present
      if (typeof data?.seatLimit === "number") {
        setEnterpriseSeatLimit(Math.max(5, Number(data.seatLimit)));
      }

      await fetchBillingStatus();
      await refreshSession?.();
      router.refresh();

      // Copy is trial-aware + bulletproof
      if (isTrialing) {
        setSeatSaveSuccess("Seats updated. During your 14-day free trial, added seats are $0.");
      } else if (data?.chargedNow) {
        setSeatSaveSuccess("Seats increased — prorated difference charged immediately.");
      } else if (data?.isDecrease) {
        setSeatSaveSuccess(
          "Seats decreased and took effect immediately. Your next bill will reflect the lower seat count."
        );
      } else {
        setSeatSaveSuccess("Seats updated.");
      }
    } catch (e: any) {
      setSeatSaveError(e?.message || "Unable to update seats.");
    } finally {
      setSeatSaving(false);
    }
  }

  const enterpriseDisabledReason = useMemo(() => {
    if (billingPeriod === "annual") return "Enterprise is currently monthly-only.";
    return null;
  }, [billingPeriod]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="BILLING"
        title="Choose your Avillo plan"
        subtitle="Starter is built for the essentials. Pro is built for leverage. Enterprise is built for teams."
      />

      {statusLoading && (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-3 text-xs text-slate-300 shadow-[0_0_24px_rgba(15,23,42,0.55)]">
          Loading billing status…
        </div>
      )}

      {statusError && !statusLoading && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-xs text-red-200 shadow-[0_0_24px_rgba(248,113,113,0.18)]">
          {statusError}
        </div>
      )}

      {verifying && (
        <div className="rounded-2xl border border-amber-200/30 bg-amber-100/10 px-5 py-3 text-xs text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.18)]">
          Finalizing your subscription…
        </div>
      )}

      {verifyError && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-xs text-red-200 shadow-[0_0_24px_rgba(248,113,113,0.18)]">
          {verifyError}
        </div>
      )}

      {/* Current plan */}
      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">Current plan</p>

            <p className="mt-1 text-sm font-semibold text-slate-50">
              {currentPlanLabel}
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                {currentPlanStatus}
              </span>
            </p>

            {showTrialBanner ? (
              <p className="mt-1 text-[11px] text-slate-400/90">
                Free trial ends <span className="font-semibold text-slate-200">{trialEndsLabel}</span>.{" "}
                {ws?.trial?.note ? (
                  <span className="text-slate-400/90">{ws.trial.note}</span>
                ) : (
                  <span className="text-slate-400/90">
                    Everything is $0 until then — your base plan and (if applicable) Enterprise seats.
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400/90">
                All paid plans include a <span className="font-semibold text-slate-200">14-day free trial</span> —
                including Enterprise base and additional seats.
              </p>
            )}
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
              disabled={portalLoading || verifying || !ws?.stripeCustomerId}
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
              Yearly <span className="block text-[9px] uppercase tracking-wide sm:inline">~ Save 2 months</span>
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
            14-day free trial included.
          </div>

          <ul className="mt-5 space-y-2 text-xs text-slate-200/90">
            <li>• People (CRM) + Listings + Intelligence engines</li>
            <li>• Manual workflow management</li>
            <li>• Zora AI assistant (limited)</li>
            <li>• Buyer/seller ⇆ listing relationships</li>
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

        {/* Pro */}
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
            14-day free trial included.
          </div>

          <ul className="mt-5 space-y-2 text-xs text-amber-50">
            <li>• Autopilot (SMS & task automation)</li>
            <li>• Built-in SMS and calling</li>
            <li>• Full Zora AI assistant</li>
            <li>• Continuous access to new capabilities</li>
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

          <p className="mt-3 text-[11px] text-slate-300/80">Pro is designed for leverage — less admin, more closings.</p>
        </div>

        {/* Founding Pro */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/80 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(253,230,138,0.18),transparent_55%)]" />

          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-100/90">Founding Pro</p>
            <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              Limited
            </span>
          </div>

          <p className="mt-3 text-3xl font-semibold text-slate-50">
            ${display.founding_pro.amount}
            <span className="text-base font-normal opacity-70">{display.founding_pro.suffix}</span>
          </p>

          <p className="text-xs text-slate-400">{display.founding_pro.caption}</p>

          <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300/90">
            Limited availability. 14-day free trial included.
          </div>

          <ul className="mt-5 space-y-2 text-xs text-slate-200/90">
            <li>• Everything in Pro</li>
            <li>• Founding pricing</li>
            <li>• Priority roadmap influence</li>
            <li>• Limited availability</li>
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

          <p className="mt-3 text-[11px] text-slate-400/80">Founding Pro is available for a limited time.</p>
        </div>
      </div>

      {/* Enterprise */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl opacity-40 bg-[radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.12),transparent_60%)]" />

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-200">Enterprise</p>
              <span className="inline-flex items-center rounded-full border border-amber-200/40 bg-amber-100/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                Teams
              </span>
            </div>

            <p className="mt-2 text-lg font-semibold text-slate-50">
              ${seats.monthlyTotal.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-slate-300/80">/mo</span>
            </p>

            <p className="mt-1 text-slate-400/90">
              Base is <span className="font-semibold text-slate-100">${seats.baseMonthly.toLocaleString()}/mo</span>{" "}
              and includes <span className="font-semibold text-slate-100">{seats.includedSeats}</span> seats. Additional
              seats are <span className="font-semibold text-slate-100">${seats.seatMonthly}/seat/mo</span>.
            </p>

            <ul className="mt-4 space-y-2 text-[11px] text-slate-200/90">
              <li>• Team communication (Hub)</li>
              <li>• Assign tasks to keep your team aligned</li>
              <li>• Roles, permissions, and full control</li>
              <li>• Business phone numbers for every agent</li>
              <li>• Shared partner network across your workspace</li>
              <li>• Effortless seat-based billing</li>
            </ul>
          </div>

          <div className="w-full md:w-[420px]">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-300">Seats</p>
                  <p className="mt-1 text-sm font-semibold text-slate-50">
                    {seats.seatLimit}{" "}
                    <span className="text-[11px] font-normal text-slate-400">({seats.extraSeats} add-on seats)</span>
                    {typeof seats.seatsUsed === "number" && (
                      <span className="ml-2 text-[11px] font-normal text-slate-400">• Used: {seats.seatsUsed}</span>
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-300">Total</p>
                  <p className="mt-1 text-sm font-semibold text-amber-100">${seats.monthlyTotal.toLocaleString()}/mo</p>
                </div>
              </div>

              <div className="mt-4">
                <input
                  type="range"
                  min={5}
                  max={500}
                  value={seats.seatLimit}
                  onChange={(e) => setEnterpriseSeatLimit(parseInt(e.target.value, 10))}
                  disabled={verifying || billingPeriod === "annual"}
                  className="w-full accent-amber-200"
                />
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span>5</span>
                  <span>500</span>
                </div>

                {enterpriseDisabledReason && (
                  <p className="mt-3 text-[11px] text-amber-100/80">
                    {enterpriseDisabledReason} Switch to Monthly to enable Enterprise checkout.
                  </p>
                )}
              </div>

              {seatSaveError && <p className="mt-3 text-[11px] text-red-200/90">{seatSaveError}</p>}
              {seatSaveSuccess && <p className="mt-3 text-[11px] text-emerald-200/90">{seatSaveSuccess}</p>}

              {isEnterprise ? (
                <button
                  type="button"
                  onClick={updateEnterpriseSeats}
                  disabled={seatSaving || verifying || billingPeriod === "annual"}
                  className={
                    "mt-5 w-full rounded-full border py-2 text-xs font-semibold transition " +
                    "border-slate-600 bg-slate-900/60 text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100" +
                    " disabled:cursor-not-allowed disabled:opacity-70"
                  }
                >
                  {seatSaving ? "Updating seats…" : "Update seats"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startCheckout("enterprise")}
                  disabled={checkoutLoading !== null || verifying || billingPeriod === "annual"}
                  className={
                    "mt-5 w-full rounded-full border py-2 text-xs font-semibold transition " +
                    (billingPeriod === "annual"
                      ? "border-slate-700 bg-slate-900/50 text-slate-500 cursor-not-allowed"
                      : "border-amber-200/70 bg-amber-50/10 text-amber-100 hover:bg-amber-50/20") +
                    " disabled:cursor-not-allowed disabled:opacity-70"
                  }
                >
                  {checkoutLoading === "enterprise" ? "Starting checkout…" : "Start Enterprise (Monthly)"}
                </button>
              )}

              <p className="mt-3 text-[11px] text-slate-400/90">
                {isEnterprise ? (
                  isTrialing ? (
                    "You’re in a 14-day free trial — base and add-on seats are $0 until the trial ends."
                  ) : (
                    "Seat increases take effect immediately and are prorated after trial. Seat decreases also take effect immediately and lower future billing. No credit is issued for unused time in the current cycle."
                  )
                ) : (
                  "Enterprise includes a 14-day free trial — base and add-on seats are $0 during the trial. After trial, seat increases take effect immediately and prorate automatically. Seat decreases also take effect immediately and lower future billing."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-6 text-xs text-slate-200/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">Billing FAQ</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-50">Can I switch between monthly and yearly?</p>
            <p className="mt-1 text-slate-400/90">Yes. You can manage plan changes from the billing portal.</p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">What happens if I cancel?</p>
            <p className="mt-1 text-slate-400/90">You’ll keep access through the end of your billing period.</p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">How does the 14-day free trial work?</p>
            <p className="mt-1 text-slate-400/90">
              Every paid plan starts with a 14-day free trial. For Enterprise, the base subscription and any added seats
              are $0 during the trial.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-50">How do Enterprise seats work?</p>
            <p className="mt-1 text-slate-400/90">
              Enterprise includes 5 seats. You can adjust seats anytime. During the 14-day free trial, added seats are
              free. After trial, seat increases are prorated and charged immediately. Seat decreases also take effect
              immediately and lower future billing, with no credit issued for unused time in the current cycle.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}