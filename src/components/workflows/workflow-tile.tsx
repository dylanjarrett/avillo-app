import React from "react";

// Generic safe placeholder component for unfinished UI pieces

export default function PlaceholderBlock(props: any) {
  return (
    <div className="rounded-xl border border-dashed border-slate-600/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-300/80">
      <div className="font-medium mb-1">Placeholder component</div>
      <p className="text-[0.7rem] leading-relaxed">
        This section of AvilloOS hasn&apos;t been wired up yet. Replace this
        placeholder with real UI when the feature is ready.
      </p>
    </div>
  );
}

