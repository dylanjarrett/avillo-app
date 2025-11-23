// src/app/intelligence/page.tsx
"use client";

import React, { useState } from "react";
import PageHeader from "@/components/layout/page-header";
import ListingEngine from "@/components/intelligence/engines/ListingEngine";
import SellerEngine from "@/components/intelligence/engines/SellerEngine";
import BuyerEngine from "@/components/intelligence/engines/BuyerEngine";
import OutputCanvas from "@/components/intelligence/OutputCanvas";
import CRMHistory from "@/components/intelligence/CRMHistory";

type EngineId = "listing" | "seller" | "buyer";

export default function IntelligencePage() {
  const [activeEngine, setActiveEngine] = useState<EngineId>("listing");
  const [output, setOutput] = useState<string>(""); // <-- string only
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="INTELLIGENCE"
        title="Avillo AI Command Center"
        subtitle="Transform raw notes into listing packs, seller sequences, buyer briefs and CRM-ready intelligence."
      />

      {/* Engine switcher */}
      <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/80 p-1 text-xs">
        {(["listing", "seller", "buyer"] as EngineId[]).map((engine) => {
          const label =
            engine === "listing"
              ? "Listing Engine"
              : engine === "seller"
              ? "Seller Engine"
              : "Buyer Engine";

          const isActive = activeEngine === engine;

          return (
            <button
              key={engine}
              type="button"
              onClick={() => {
                setActiveEngine(engine);
                setOutput(""); // clear when switching engines
              }}
              className={[
                "px-4 py-1.5 rounded-full transition-all",
                isActive
                  ? "bg-amber-100 text-slate-900 font-medium shadow"
                  : "text-slate-300 hover:bg-slate-800",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Two-column: engine input + output */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <div>
          {activeEngine === "listing" && (
            <ListingEngine
              loading={loading}
              setLoading={setLoading}
              setOutput={setOutput}
            />
          )}
          {activeEngine === "seller" && (
            <SellerEngine
              loading={loading}
              setLoading={setLoading}
              setOutput={setOutput}
            />
          )}
          {activeEngine === "buyer" && (
            <BuyerEngine
              loading={loading}
              setLoading={setLoading}
              setOutput={setOutput}
            />
          )}
        </div>

        <OutputCanvas loading={loading} output={output} />
      </div>

      {/* CRM history below */}
      <CRMHistory />
    </div>
  );
}