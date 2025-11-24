// src/app/(portal)/billing/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/layout/page-header";

type BillingPeriod = "monthly" | "annual";

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>("monthly");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-slate-400">
        Loading billing…
      </div>
    );
  }

  if (!session) return null;

  const firstName =
    session.user?.name?.split(" ")[0] ??
    session.user?.email?.split("@")[0] ??
    "there";

  // --- Pricing model (can tweak later) ---
  const pricing = {
    founding: {
      monthly: "$0",
      annual: "$0",
    },
    pro: {
      monthly: "$79",
      annual: "$790", // ~2 months free
    },
  };

  const isAnnual = billingPeriod === "annual";

  // --- Stripe checkout handler (Pro plan) ---
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

      window.location.href = data.url as string;
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Unable to start checkout right now. Please try again.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Shared Avillo header */}
      <PageHeader
        eyebrow="Billing & plans"
        title={`Hey ${firstName}, here’s your Avillo plan.`}
        subtitle="Review your current plan, track your usage, and upgrade when you're ready for deeper automation across your listings, clients, and CRM."
        actions={
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[var(--brand-text)] hover:bg-white/10"
            >
              Back to dashboard
            </Link>
            <a
              href="mailto:sales@avillo.io"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-[var(--brand-text)] hover:bg-white/5"
            >
              Contact Sales
            </a>
          </div>
        }
      />

      {/* Top: current plan + usage overview */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)]">
        {/* Current plan card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5 shadow-[0_18px_45px_rgba(0,0,0,0.55)]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Current plan
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--brand-text)]">
                  Founding Agent (Beta)
                </h2>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-300">
                You’re in the early access cohort shaping Avillo into the AI
                operating system for real estate. Your rate is locked for this
                beta phase.
              </p>
            </div>

            <div className="text-right text-xs">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Effective rate
              </p>
              <p className="mt-1 text-xl font-semibold text-[var(--brand-text)]">
                {pricing.founding[billingPeriod]}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {billingPeriod === "monthly"
                  ? "Founding phase · billed monthly"
                  : "Founding phase · annual equivalent"}
              </p>
              <a
                href="mailto:billing@avillo.io"
                className="mt-3 inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-medium text-[var(--brand-text)] hover:bg-white/10"
              >
                Contact Billing
              </a>
            </div>
          </div>

          <div className="mt-5 grid gap-4 text-[11px] text-slate-200 md:grid-cols-3">
            <PlanFeatureGroup
              title="Listing Engine"
              items={[
                "AI listing copy tuned for MLS",
                "Feature bullets + short descriptions",
                "Open house + talking point prompts",
              ]}
            />
            <PlanFeatureGroup
              title="Designed for launch"
              items={[
                "Perfect for your first Avillo workflows",
                "Built for solo agents getting started with AI",
                "Keeps billing simple during beta",
              ]}
            />
            <PlanFeatureGroup
              title="Founder perks"
              items={[
                "Locked founding-agent pricing",
                "Priority feedback channel",
                "Early access to new modules",
              ]}
            />
          </div>
        </div>

        {/* Usage overview */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] px-6 py-5 shadow-[0_18px_45px_rgba(0,0,0,0.6)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            Usage overview
          </p>
          <p className="mt-2 text-xs text-slate-300">
            These numbers will update automatically as you run Listing,
            Seller, and Buyer engines and start saving results to your CRM.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Workflows generated"
              value="0"
              helper="AI packs created this billing period."
            />
            <MetricCard
              label="Est. hours saved"
              value="0.0"
              helper="Based on ~30 minutes saved per workflow."
            />
            <MetricCard
              label="Value created"
              value="$0"
              helper="Assuming an $85/hr effective agent rate."
            />
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-slate-100">
            <p className="font-semibold">Getting started tip</p>
            <p className="mt-1 text-slate-200">
              Start with a live or upcoming listing. Drop your property
              notes into the Listing Engine, generate the full pack, then
              paste directly into your MLS, email, and social templates.
            </p>
          </div>
        </div>
      </section>

      {/* Plans + toggle */}
      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Plans
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--brand-text)]">
              Scale from your first AI listing to a fully automated command
              center.
            </h2>
            <p className="mt-1 max-w-xl text-xs text-slate-300">
              Start on the Founding Agent plan with the Listing Engine. When
              you’re ready, upgrade to Avillo Pro to unlock Buyer & Seller
              engines, CRM history, and deeper workflow automation.
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
                    : "text-slate-200"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod("annual")}
                className={`rounded-full px-3 py-1.5 transition ${
                  billingPeriod === "annual"
                    ? "bg-white text-slate-900 shadow-[0_0_20px_rgba(52,211,153,0.55)]"
                    : "text-slate-200"
                }`}
              >
                Annual{" "}
                <span className="ml-1 text-[10px] font-semibold text-emerald-400">
                  Save ~2 months
                </span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              {isAnnual
                ? "Billed yearly · best for agents committed to Avillo long-term."
                : "Billed month-to-month · change or cancel before public launch."}
            </p>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Founding Agent plan */}
          <PlanCard
            label="Current plan"
            name="Founding Agent"
            badge="Beta cohort"
            highlight="Perfect for getting started with the Listing Engine."
            price={pricing.founding[billingPeriod]}
            period={billingPeriod}
            bulletGroups={[
              {
                title: "You get",
                items: [
                  "Listing Engine for MLS + social-ready copy",
                  "Feature bullets, short descriptions, and open house notes",
                  "Basic session history for recent listing packs",
                ],
              },
              {
                title: "Ideal for",
                items: [
                  "Solo agents experimenting with AI workflows",
                  "Preparing listing copy faster without changing your process",
                ],
              },
            ]}
            ctaLabel="Your current plan"
            ctaVariant="outline"
            ctaDisabled
          />

          {/* Avillo Pro plan */}
          <PlanCard
            label="Upgrade"
            name="Avillo Pro"
            badge="Most popular (preview)"
            highlight="Unlock the full Avillo Intelligence suite and CRM."
            price={pricing.pro[billingPeriod]}
            period={billingPeriod}
            bulletGroups={[
              {
                title: "All Intelligence engines",
                items: [
                  "Listing Engine · MLS, social, email, talking points",
                  "Seller Engine · prep, objections, follow-ups, pricing scripts",
                  "Buyer Engine · tours, offers, nurture sequences, recaps",
                ],
              },
              {
                title: "CRM & history",
                items: [
                  "Save AI outputs directly into Avillo CRM",
                  "Searchable history of past packs & campaigns",
                  "Stronger pipeline insights across listings and clients",
                ],
              },
            ]}
            ctaLabel={
              billingPeriod === "monthly"
                ? "Upgrade to Avillo Pro – monthly"
                : "Upgrade to Avillo Pro – annual"
            }
            ctaVariant="primary"
            ctaOnClick={() => handleCheckout("pro", billingPeriod)}
            ctaDisabled={isCheckingOut}
          />
        </div>
      </section>

      {/* Support + data footer */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5 text-xs text-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Billing & data
          </p>
          <h3 className="mt-2 text-sm font-semibold text-[var(--brand-text)]">
            Simple billing. Clear rules around your data.
          </h3>
          <div className="mt-4 space-y-3">
            <p className="text-[11px] text-slate-300">
              When we move out of beta, you’ll get clear notice and a chance
              to lock in founding-agent pricing. Billing runs through Stripe,
              and you’ll be able to download invoices and receipts directly
              from this page.
            </p>
            <p className="text-[11px] text-slate-300">
              Your prompts, outputs, and client data are used only to power
              your Avillo workspace. We don’t sell your data, and we don’t
              use your content to train public models.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-[11px]">
            <a
              href="mailto:billing@avillo.io"
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 hover:bg-white/10"
            >
              Billing questions · billing@avillo.io
            </a>
            <a
              href="mailto:support@avillo.io"
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 hover:bg-white/10"
            >
              Support · support@avillo.io
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 px-6 py-5 text-xs text-emerald-50 shadow-[0_0_32px_rgba(16,185,129,0.45)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Built for real estate teams
          </p>
          <h3 className="mt-2 text-sm font-semibold text-white">
            Ready to roll Avillo out to a team or brokerage?
          </h3>
          <p className="mt-2 text-[11px] text-emerald-100">
            If you’re planning to use Avillo across a team, brokerage, or
            multi-office group, we can help you think through roles, CRM
            structure, and onboarding. Enterprise pricing includes dedicated
            success and custom rollout support.
          </p>
          <a
            href="mailto:hello@avillo.io"
            className="mt-4 inline-flex items-center justify-center rounded-full border border-emerald-200/60 bg-emerald-500/10 px-4 py-1.5 text-[11px] font-semibold text-emerald-50 hover:bg-emerald-500/20"
          >
            Talk about team / enterprise · hello@avillo.io
          </a>
        </div>
      </section>
    </div>
  );
}

/* ---------- Small helper components ---------- */

type FeatureGroupProps = {
  title: string;
  items: string[];
};

function PlanFeatureGroup({ title, items }: FeatureGroupProps) {
  return (
    <div className="space-y-1">
      <p className="mb-1 font-semibold uppercase tracking-[0.16em] text-slate-400">
        {title}
      </p>
      <ul className="space-y-1 text-slate-200">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
};

function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <div className="mt-2 text-xl font-semibold text-[var(--brand-text)]">
        {value}
      </div>
      <p className="mt-1 text-[11px] text-slate-300">{helper}</p>
    </div>
  );
}

type BulletGroup = {
  title: string;
  items: string[];
};

type PlanCardProps = {
  label: string;
  name: string;
  badge?: string;
  highlight?: string;
  price: string;
  period: BillingPeriod;
  bulletGroups: BulletGroup[];
  ctaLabel: string;
  ctaVariant: "primary" | "outline";
  ctaOnClick?: () => void;
  ctaDisabled?: boolean;
};

function PlanCard({
  label,
  name,
  badge,
  highlight,
  price,
  period,
  bulletGroups,
  ctaLabel,
  ctaVariant,
  ctaOnClick,
  ctaDisabled,
}: PlanCardProps) {
  const baseBtn =
    "w-full rounded-full px-4 py-2 text-[11px] font-semibold transition";
  const primaryBtn =
    baseBtn +
    " bg-emerald-400 text-slate-900 shadow-[0_0_24px_rgba(52,211,153,0.7)] hover:bg-emerald-300";
  const outlineBtn =
    baseBtn +
    " border border-white/25 text-[var(--brand-text)] hover:border-white hover:bg-white/10";

  const isContact = price.toLowerCase().includes("talk");

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5 shadow-[0_18px_45px_rgba(0,0,0,0.55)]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="uppercase tracking-[0.18em]">{label}</span>
          {badge && (
            <span className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-100">
              {badge}
            </span>
          )}
        </div>

        <h3 className="text-base font-semibold text-[var(--brand-text)]">
          {name}
        </h3>
        {highlight && (
          <p className="mt-1 text-[11px] text-slate-300">{highlight}</p>
        )}

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-[var(--brand-text)]">
            {price}
          </span>
          {!isContact && (
            <span className="text-[11px] text-slate-400">
              {period === "monthly"
                ? "/agent per month"
                : "/agent per year · billed annually"}
            </span>
          )}
        </div>

        <div className="mt-4 space-y-4 text-[11px] text-slate-200">
          {bulletGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-1 font-semibold uppercase tracking-[0.16em] text-slate-400">
                {group.title}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item}>• {item}</li>
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
          className={
            ctaVariant === "primary"
              ? primaryBtn +
                (ctaDisabled || !ctaOnClick ? " cursor-not-allowed opacity-60" : "")
              : outlineBtn +
                (ctaDisabled || !ctaOnClick ? " cursor-not-allowed opacity-60" : "")
          }
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}