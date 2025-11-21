import React from "react";
import PageHeader from "@/components/layout/page-header";

function IntelligenceTile({
  label,
  badge,
  children,
}: {
  label: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.85)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-amber-100/50">
      <div className="absolute inset-0 -z-10 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-40 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.16),transparent_55%)]" />
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-100/80 uppercase">
            {label}
          </p>
          <div className="text-xs leading-relaxed text-slate-200/85">
            {children}
          </div>
        </div>
        {badge && (
          <span className="mt-0.5 inline-flex items-center rounded-full border border-amber-100/40 bg-amber-50/5 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-100">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

export default function IntelligencePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="INTELLIGENCE"
        title="Listing Intelligence & Studios"
        subtitle="Turn raw notes into ready-to-use listing copy, social posts, emails, and talking points for both buyers and sellers."
      />

      {/* Core engine / seller / buyer */}
      <div className="grid gap-5 lg:grid-cols-3">
        <IntelligenceTile label="Core engine" badge="Active workflow">
          MLS description, bullets, social captions, email copy, and talking
          points from a single set of property details.
        </IntelligenceTile>

        <IntelligenceTile label="Seller Studio" badge="In beta">
          Pre-listing, presentation language, and objection handling tuned for
          listing appointments and price talks.
        </IntelligenceTile>

        <IntelligenceTile label="Buyer Studio" badge="Coming soon">
          Tours, offers, and follow-up summaries that highlight key features,
          deal terms, and nurture messages for your best buyers.
        </IntelligenceTile>
      </div>

      {/* Input + preview */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Input card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)]" />
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            Listing intelligence input
          </p>
          <h2 className="mt-2 text-sm font-medium text-slate-50">
            Paste your full property notes: address, beds/baths, upgrades,
            finishes, neighborhood context, and anything you’d say in a listing
            appointment.
          </h2>
          <label className="mt-4 block text-[11px] font-semibold text-slate-200/85">
            Property details
          </label>
          <textarea
            className="mt-2 h-44 w-full resize-none rounded-xl border border-slate-600 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-amber-100/70 focus:bg-slate-900 focus:ring-2 focus:ring-amber-100/40"
            placeholder="Ex: 1234 Ocean View Dr · 3 bed · 2.5 bath · remodeled kitchen with quartz counters, wide-plank flooring, vaulted ceilings, and ocean views from the primary suite. Walkable to parks, coffee, and waterfront trail…"
          />
          <div className="mt-3 flex items-center justify-between gap-4 text-[11px] text-slate-300/85">
            <p>
              Once wired to your AI backend, this will send a structured request
              and return a full listing pack tuned to your market.
            </p>
            <button className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-1.5 font-semibold text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] transition hover:bg-amber-50/20 hover:border-amber-100">
              Generate listing pack
            </button>
          </div>
        </div>

        {/* Output preview */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/70 to-slate-950 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-50 blur-3xl bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)]" />
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            Output preview
          </p>
          <p className="mt-2 text-xs text-slate-200/90">
            This is a static preview. When the API is wired, this panel will
            show the actual generated copy for each channel.
          </p>

          <div className="mt-4 space-y-4 text-xs text-slate-100/90">
            <div>
              <p className="font-semibold text-amber-100/80">MLS description</p>
              <p className="mt-1 leading-relaxed text-slate-200/90">
                Modern coastal home with open-concept living room, remodeled
                kitchen, and an oversized deck overlooking the ocean. Natural
                light, wide-plank flooring, and vaulted ceilings make every
                space feel bright and airy…
              </p>
            </div>

            <div>
              <p className="font-semibold text-amber-100/80">
                Short-form bullets
              </p>
              <ul className="mt-1 space-y-0.5 text-slate-200/90">
                <li>• 3 bed · 2.5 bath with upgraded kitchen and walk-in pantry</li>
                <li>• Light-filled primary suite with ocean views and deck</li>
                <li>
                  • Minutes to shoreline trail, coffee shops, and schools
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-amber-100/80">Social caption</p>
              <p className="mt-1 leading-relaxed text-slate-200/90">
                Just listed 🌊 Modern coastal living in the heart of Edgewood —
                vaulted ceilings, remodeled kitchen, and an indoor-outdoor flow
                that’s built for gatherings. DM “OCEAN VIEW” for details or a
                private tour.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}