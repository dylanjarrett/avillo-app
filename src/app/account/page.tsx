import React from "react";
import PageHeader from "@/components/layout/page-header";

export default function AccountPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ACCOUNT"
        title="Account settings"
        subtitle="Update your profile, brokerage details, and login preferences. This is where you’ll also manage team access once Avillo supports multiple seats."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Profile form (static for now) */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)]" />
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            Profile
          </p>
          <p className="mt-2 text-xs text-slate-200/90">
            These details help personalize your outputs and future team features
            inside Avillo.
          </p>

          <div className="mt-4 space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-200/90">
                Full name
              </label>
              <input
                type="text"
                defaultValue="Dylan Jarrett"
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-200/90">
                Email
              </label>
              <input
                type="email"
                defaultValue="you@example.com"
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
              />
              <p className="mt-1 text-[11px] text-slate-400/90">
                Login email is managed by your auth provider. Email changes may
                require verification.
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-200/90">
                Brokerage / team
              </label>
              <input
                type="text"
                placeholder="Your brokerage name"
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-200/90">
                Market / primary area
              </label>
              <input
                type="text"
                defaultValue="Ex: Phoenix, AZ · East Valley"
                className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
              />
            </div>
          </div>

          <button
            type="button"
            className="mt-5 inline-flex items-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-1.5 text-xs font-semibold text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20"
          >
            Save profile (coming soon)
          </button>
        </div>

        {/* Auth & security */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.18),transparent_55%)]" />
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Login & security
            </p>
            <div className="mt-3 space-y-3 text-xs text-slate-200/90">
              <div>
                <p className="font-semibold text-slate-50">Email + OAuth</p>
                <p className="mt-1 text-slate-300/90">
                  You’re currently logged in with your email provider. In the
                  future, you’ll be able to connect Google, Apple, and more.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-50">Sessions</p>
                <p className="mt-1 text-slate-300/90">
                  Session management (sign out of other devices, revoke access)
                  will appear here later.
                </p>
              </div>
              <div>
                <p className="font-semibold text-rose-200">Danger zone</p>
                <p className="mt-1 text-slate-300/90">
                  In the future, this will let you pause or permanently erase
                  your Avillo account and remove stored data.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 text-xs text-slate-300/90 shadow-[0_0_35px_rgba(15,23,42,0.85)]">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
              Private beta
            </p>
            <p className="mt-2">
              You’re currently in a{" "}
              <span className="font-semibold text-amber-100">
                single-seat preview
              </span>
              . As we roll out team features, this screen will expand to show
              seat invites, roles, and workspace-level settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
