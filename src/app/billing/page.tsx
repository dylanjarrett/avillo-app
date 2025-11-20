// src/app/billing/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type BillingPeriod = "monthly" | "annual";

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>("monthly");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Loading state while NextAuth checks session
  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading billing…
        </div>
      </AppShell>
    );
  }

  // If redirecting away
  if (!session) return null;

  const firstName =
    session.user?.name?.split(" ")[0] ??
    session.user?.email?.split("@")[0] ??
    "there";

  // ---- Pricing model (adjust later as needed) ----
  const pricing = {
    founding: {
      monthly: "$0",
      annual: "$0",
    },
    pro: {
      monthly: "$79",
      annual: "$790", // effectively ~2 months free
    },
    enterprise: {
      monthly: "Let’s talk",
      annual: "Let’s talk",
    },
  };

  const isAnnual = billingPeriod === "annual";

  // ---- Stripe checkout handler (Pro plan only for now) ----
  async function handleCheckout(plan: "pro", period: BillingPeriod) {
    try {
      setIsCheckingOut(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, period }),
      });

      const data = await res.json();

      if (!res.ok || !data?.url) {
        console.error("Checkout error:", data);
        alert("Something went wrong starting checkout. Please try again.");
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url as string;
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Unable to start checkout right now. Please try again.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-8 pb-16">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#9CA3AF]">
              Billing &amp; plans
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              Hey {firstName}, here&apos;s your Veris plan.
            </h1>
            <p className="mt-2 max-w-xl text-xs text-[#AAB4C0]">
              Manage your subscription, review usage, and upgrade when
              you&apos;re ready to put more of your business on autopilot.
            </p>
            <p className="mt-1 text-[11px] text-[#6B7280]">
              Early access cohort • Priority roadmap input • Locked
              founding-agent rate during beta
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium text-slate-100 transition hover:border-[#4D9FFF] hover:bg-[#111827]"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              className="rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0]"
            >
              Contact sales
            </button>
          </div>
        </header>

        {/* Current plan + usage summary */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)]">
          {/* Current plan */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-6 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9CA3AF]">
                  Current plan
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    Founding Agent (Beta)
                  </h2>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                    Active
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#AAB4C0]">
                  You&apos;re part of the early access group while we tune
                  Veris with top agents. Pricing for your cohort will be
                  locked in before public launch.
                </p>
              </div>

              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9CA3AF]">
                  Monthly rate
                </p>
                <div className="mt-2 text-xl font-semibold">
                  {pricing.founding[billingPeriod]}
                </div>
                <p className="mt-1 text-[11px] text-[#AAB4C0]">
                  {billingPeriod === "monthly"
                    ? "During beta • Billed monthly"
                    : "During beta • Annual equivalent"}
                </p>
                <button
                  type="button"
                  className="mt-3 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[11px] font-medium text-slate-100 transition hover:border-[#4D9FFF] hover:bg-[#111827]"
                >
                  Manage billing · Coming soon
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-6 text-[11px] text-[#D1D5DB] md:grid-cols-3">
              <div>
                <p className="mb-1 font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Included today
                </p>
                <ul className="space-y-1">
                  <li>• Listing Intelligence packs</li>
                  <li>• Seller Studio workflows</li>
                  <li>• Private agent preview features</li>
                </ul>
              </div>
              <div>
                <p className="mb-1 font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Coming to your plan
                </p>
                <ul className="space-y-1">
                  <li>• Buyer Studio automations</li>
                  <li>• CRM &amp; MLS integrations</li>
                  <li>• Advanced analytics dashboard</li>
                </ul>
              </div>
              <div>
                <p className="mb-1 font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                  Your founder benefits
                </p>
                <ul className="space-y-1">
                  <li>• Priority roadmap influence</li>
                  <li>• Locked “Founding agent” pricing</li>
                  <li>• Early access to new tools</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Usage summary */}
          <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.35)_0,_#050814_55%)] p-6 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9CA3AF]">
              Usage summary
            </p>
            <p className="mt-2 text-xs text-[#AAB4C0]">
              These numbers will start updating automatically as you run
              Listing Intelligence and Seller Studio workflows.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <UsageMetric
                label="AI workflows run"
                value="0"
                helper="Listing + seller flows generated in Veris."
              />
              <UsageMetric
                label="Hours saved"
                value="0.0"
                helper="Based on an estimated ~30 minutes saved per workflow."
              />
              <UsageMetric
                label="Estimated value"
                value="$0"
                helper="Using a baseline $85/hour effective agent rate."
              />
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-[#E5E7EB]">
              <p className="font-medium">Tip:</p>
              <p className="mt-1">
                Start with a listing you&apos;re preparing to take live.
                Paste the full property description into Listing
                Intelligence and Veris will handle MLS copy, bullets,
                social posts, and talking points.
              </p>
            </div>
          </div>
        </section>

        {/* Plans + toggle */}
        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#9CA3AF]">
                Plans
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Choose the level of automation that fits your business.
              </h2>
              <p className="mt-1 max-w-xl text-xs text-[#AAB4C0]">
                Veris is designed so a solo agent can get leverage on day
                one, and so a top team or brokerage can standardize
                world-class messaging across every listing and client
                touchpoint.
              </p>
            </div>

            {/* Billing toggle */}
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="inline-flex rounded-full bg-white/5 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setBillingPeriod("monthly")}
                  className={`rounded-full px-3 py-1.5 transition ${
                    billingPeriod === "monthly"
                      ? "bg-white text-slate-900 shadow-[0_0_16px_rgba(255,255,255,0.35)]"
                      : "text-[#E5E7EB]"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod("annual")}
                  className={`rounded-full px-3 py-1.5 transition ${
                    billingPeriod === "annual"
                      ? "bg-white text-slate-900 shadow-[0_0_16px_rgba(52,211,153,0.5)]"
                      : "text-[#E5E7EB]"
                  }`}
                >
                  Annual{" "}
                  <span className="ml-1 text-[10px] font-semibold text-emerald-400">
                    Save ~2 months
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-[#9CA3AF]">
                {isAnnual
                  ? "Billed yearly · Best value for agents committed to Veris."
                  : "Billed month-to-month · Change or cancel before public launch."}
              </p>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Founding Agent */}
            <PlanCard
              label="Current"
              highlight="You’re on this plan"
              name="Founding Agent"
              tagline="Start building your listing playbook together."
              price={pricing.founding[billingPeriod]}
              period={billingPeriod}
              bulletGroups={[
                {
                  title: "Includes",
                  items: [
                    "Listing Intelligence for MLS + social copy",
                    "Seller Studio pre-listing drip + listing presentation",
                    "Objection Lab talk tracks + follow-ups",
                    "Access to beta features before public release",
                  ],
                },
              ]}
              ctaLabel="Your current plan"
              ctaVariant="outline"
              ctaDisabled
            />

            {/* Veris Pro (Stripe checkout wired) */}
            <PlanCard
              label="Coming soon"
              highlight="Best for high-volume solo agents"
              name="Veris Pro"
              tagline="Unlock a “second brain” for every client."
              price={pricing.pro[billingPeriod]}
              period={billingPeriod}
              badge="Most popular (preview)"
              bulletGroups={[
                {
                  title: "Everything in Founding Agent, plus:",
                  items: [
                    "Buyer Studio tours, offers, follow-ups",
                    "Saved playbooks + reusable templates",
                    "Team seats and shared workspaces",
                    "CRM & MLS integrations",
                    "Priority support + roadmap input",
                  ],
                },
              ]}
              ctaLabel={
                billingPeriod === "monthly"
                  ? "Subscribe to Pro – Monthly"
                  : "Subscribe to Pro – Annual"
              }
              ctaVariant="primary"
              ctaOnClick={() => handleCheckout("pro", billingPeriod)}
              ctaDisabled={isCheckingOut}
            />

            {/* Enterprise / Teams */}
            <PlanCard
              label="Brokerages & teams"
              highlight="For team leads, managers, and broker-owners"
              name="Enterprise"
              tagline="Roll Veris out across your entire organization."
              price={pricing.enterprise[billingPeriod]}
              period={billingPeriod}
              badge="New"
              bulletGroups={[
                {
                  title: "Designed for real estate teams:",
                  items: [
                    "Centralized playbooks and messaging guardrails",
                    "Team-wide reporting and analytics",
                    "Single sign-on and compliance controls",
                    "Custom onboarding and training",
                    "Dedicated success manager",
                  ],
                },
              ]}
              ctaLabel="Talk to sales"
              ctaVariant="outline-strong"
              ctaDisabled
            />
          </div>
        </section>

        {/* Billing & data FAQ */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-6 text-xs text-[#D1D5DB] shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">
              Billing &amp; data
            </p>
            <h3 className="mt-2 text-sm font-semibold">
              Straightforward billing. Clear rules around your data.
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-[#E5E7EB]">
                  How will billing work after beta?
                </p>
                <p className="mt-1 text-[11px] text-[#AAB4C0]">
                  When we move out of beta, you&apos;ll get clear notice and
                  a chance to lock in founding-agent pricing. Billing will
                  run through a secure provider (Stripe) and you&apos;ll be
                  able to update cards, invoices, and receipts from this
                  page.
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[#E5E7EB]">
                  What happens to my data?
                </p>
                <p className="mt-1 text-[11px] text-[#AAB4C0]">
                  Your prompts, outputs, and client data are only used to
                  power your workspace. We don&apos;t sell your data, and we
                  don&apos;t use your content to train public models.
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[#E5E7EB]">
                  Can I cancel before launch?
                </p>
                <p className="mt-1 text-[11px] text-[#AAB4C0]">
                  Absolutely. During beta you&apos;re free to come and go —
                  we&apos;re focused on earning a permanent place in your
                  workflow, not locking you in.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.4)_0,_#020617_55%)] p-6 text-xs text-[#D1FAE5] shadow-[0_0_30px_rgba(16,185,129,0.4)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6EE7B7]">
              Built for real estate teams
            </p>
            <h3 className="mt-2 text-sm font-semibold text-white">
              A tool your broker, team lead, and clients can trust.
            </h3>
            <p className="mt-2 text-[11px] text-[#A7F3D0]">
              Veris is built for regulated, relationship-driven
              businesses. Every workflow is designed around how top
              agents already operate — we&apos;re just taking the writing
              and admin off your plate.
            </p>
            <ul className="mt-4 space-y-2 text-[11px] text-[#D1FAE5]">
              <li>
                • Transparent billing and easy receipts for your
                accountant
              </li>
              <li>• Clear data boundaries and export options</li>
              <li>• Opinionated, compliant copy tuned for real estate</li>
            </ul>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/* ---- Small helpers ---- */

type UsageMetricProps = {
  label: string;
  value: string;
  helper: string;
};

function UsageMetric({ label, value, helper }: UsageMetricProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9CA3AF]">
        {label}
      </p>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <p className="mt-1 text-[11px] text-[#AAB4C0]">{helper}</p>
    </div>
  );
}

type BulletGroup = {
  title: string;
  items: string[];
};

type PlanCardProps = {
  label: string;
  highlight?: string;
  name: string;
  tagline: string;
  price: string;
  period: BillingPeriod;
  badge?: string;
  bulletGroups: BulletGroup[];
  ctaLabel: string;
  ctaVariant: "primary" | "outline" | "outline-strong";
  ctaOnClick?: () => void;
  ctaDisabled?: boolean;
};

function PlanCard({
  label,
  highlight,
  name,
  tagline,
  price,
  period,
  badge,
  bulletGroups,
  ctaLabel,
  ctaVariant,
  ctaOnClick,
  ctaDisabled,
}: PlanCardProps) {
  const isContact = price.toLowerCase().includes("talk");

  const baseClasses =
    "w-full rounded-full px-4 py-2 text-[11px] font-semibold transition";
  const ctaClasses =
    ctaVariant === "primary"
      ? `${baseClasses} bg-[#22C55E] text-slate-900 shadow-[0_0_20px_rgba(34,197,94,0.6)] hover:bg-[#16A34A]`
      : ctaVariant === "outline-strong"
      ? `${baseClasses} border border-[#4D9FFF] text-[#E5E7EB] hover:bg-[#0B1120]`
      : `${baseClasses} border border-white/25 text-[#E5E7EB] hover:border-[#4D9FFF] hover:bg-[#020617]`;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.96)] p-6 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-[#9CA3AF]">
          <span className="uppercase tracking-[0.18em]">{label}</span>
          {badge && (
            <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/80">
              {badge}
            </span>
          )}
        </div>

        <h3 className="text-base font-semibold text-white">{name}</h3>
        <p className="mt-1 text-xs text-[#AAB4C0]">{tagline}</p>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white">{price}</span>
          {!isContact && (
            <span className="text-[11px] text-[#9CA3AF]">
              {period === "monthly"
                ? "/agent per month"
                : "/agent per year · billed annually"}
            </span>
          )}
        </div>

        {highlight && (
          <p className="mt-2 text-[11px] text-[#AAB4C0]">{highlight}</p>
        )}

        <div className="mt-4 space-y-4 text-[11px] text-[#D1D5DB]">
          {bulletGroups.map((group, idx) => (
            <div key={idx}>
              <p className="mb-1 font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                {group.title}
              </p>
              <ul className="space-y-1">
                {group.items.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={ctaOnClick}
          disabled={ctaDisabled || !ctaOnClick}
          className={`${ctaClasses} ${
            ctaDisabled || !ctaOnClick
              ? "cursor-not-allowed opacity-50"
              : ""
          }`}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
