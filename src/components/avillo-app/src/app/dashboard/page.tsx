// src/app/dashboard/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // While NextAuth is checking the session
  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center text-sm text-slate-400">
          Loading your dashboard…
        </div>
      </AppShell>
    );
  }

  // If we’re redirecting away
  if (!session) {
    return null;
  }

  const firstName =
    session.user?.name?.split(" ")[0] ??
    session.user?.email?.split("@")[0] ??
    "Agent";

  // For now these are placeholders; later we can wire to real stats.
  const stats = {
    workflows: 0,
    hoursSaved: 0,
    estimatedValue: 0,
  };

  // Placeholder for a unified recent feed (will be wired up in a later phase)
  const recentActivity: Array<{
    id: number;
    type: "listing" | "seller" | "objection";
    title: string;
    meta: string;
    createdAt: string;
  }> = [];

  return (
    <AppShell>
      {/* TOP HEADER */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Welcome back
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            Hey {firstName}, here&apos;s your business at a glance.
          </h1>
          <p className="mt-1 max-w-xl text-xs text-slate-400">
            Avillo turns your notes, listings, and conversations into ready-to-use
            marketing and scripts so you can stay in front of clients—not your keyboard.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0]"
          >
            New Listing Pack
          </Link>
          <Link
            href="/account"
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-100 transition hover:border-[#4D9FFF] hover:bg-[#11182A]"
          >
            Account Settings
          </Link>
        </div>
      </header>

      {/* KPI STRIP – ONLY THREE METRICS */}
      <section className="mt-8 grid gap-5 md:grid-cols-3">
        {/* AI WORKFLOWS RUN */}
        <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.96)] p-5 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            AI Workflows Run
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {stats.workflows}
          </h2>
          <p className="mt-2 text-xs text-slate-300">
          </p>
        </div>

        {/* HOURS SAVED */}
        <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.96)] p-5 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Hours Saved
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {stats.hoursSaved.toFixed(1)}
          </h2>
          <p className="mt-2 text-xs text-slate-300">
            Est. 30 mins saved per workflow.
          </p>
        </div>

        {/* ESTIMATED VALUE */}
        <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.96)] p-5 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Estimated Value
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            ${stats.estimatedValue.toFixed(0)}
          </h2>
          <p className="mt-2 text-xs text-slate-300">
            Based on a $65/hr effective rate.
          </p>
        </div>
      </section>

      {/* TODAY'S BRIEFING + NEXT BEST ACTIONS */}
      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        {/* TODAY'S BRIEFING */}
        <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.92)] p-6 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Today&apos;s Briefing
          </p>
          <h3 className="mt-2 text-base font-semibold text-white">
            Get your first workflow running.
          </h3>
          <p className="mt-3 text-xs leading-relaxed text-slate-300">
            Start with a listing you&apos;re preparing to take live. Paste the full
            property description into Listing Intelligence and Avillo will handle
            MLS copy, bullets, social posts, and talking points.
          </p>

          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-[#1A73E8] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_18px_rgba(26,115,232,0.55)] transition hover:bg-[#1557B0]"
          >
            Generate your first Listing Pack →
          </Link>
        </div>

        {/* NEXT BEST ACTIONS */}
        <div className="rounded-2xl border border-white/10 bg-[rgba(10,12,20,0.92)] p-6 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Next Best Actions
          </p>

          <ul className="mt-3 space-y-3 text-xs text-slate-300">
            <li>• Prep your next listing with Listing Intelligence.</li>
            <li>• Warm up a cold seller lead with a 3-part email sequence.</li>
            <li>• Turn a tough pricing or commission conversation into an objection script.</li>
          </ul>

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Most Used Tool
            </p>
            <p className="mt-2 text-xs text-slate-300">
              Once you begin running workflows, we&apos;ll highlight which tool is
              creating the most leverage in your business.
            </p>
          </div>
        </div>
      </section>

      {/* UNIFIED RECENT ACTIVITY */}
      <section className="mt-10 rounded-2xl border border-white/10 bg-[rgba(7,10,20,0.9)] p-6 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
          Recent Activity
        </p>

        {recentActivity.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">
            No recent activity yet. As you generate listing packs, seller workflows,
            and objection scripts, they&apos;ll appear here with property details so
            you can quickly revisit and re-run them.
          </p>
        ) : (
          <ul className="mt-4 space-y-3 text-xs text-slate-200">
            {recentActivity.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between rounded-xl border border-white/10 bg-[#0c1122] p-4"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    {item.type === "listing"
                      ? "Listing Pack"
                      : item.type === "seller"
                      ? "Seller Studio"
                      : "Objection Work"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{item.meta}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {item.createdAt}
                  </p>
                </div>

                <Link
                  href="/"
                  className="ml-4 rounded-full bg-[#1A73E8] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#1557B0]"
                >
                  Reopen
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
