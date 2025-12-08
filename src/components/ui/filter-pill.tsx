// src/components/ui/filter-pill.tsx
"use client";

type BadgeColor = "new" | "warm" | "hot" | "past";

type FilterPillProps = {
  label: string;
  count?: number;
  active?: boolean;
  badgeColor?: BadgeColor; // optional – only use for stage filters
  onClick: () => void;
};

function activeClasses(badgeColor?: BadgeColor): string {
  switch (badgeColor) {
    case "new":
      return "border-sky-300/80 bg-sky-500/10 text-sky-100";
    case "warm":
      return "border-amber-200/80 bg-amber-400/10 text-amber-100";
    case "hot":
      return "border-rose-300/80 bg-rose-500/10 text-rose-100";
    case "past":
      return "border-slate-500/80 bg-slate-800/60 text-slate-200";
    default:
      // default amber style for non-stage filters (buyers/sellers, active/paused, etc.)
      return "border-amber-100/80 bg-amber-50/15 text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.35)]";
  }
}

export function FilterPill({
  label,
  count,
  active,
  badgeColor,
  onClick,
}: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors " +
        (active
          ? activeClasses(badgeColor)
          : "border-slate-700/80 text-[var(--avillo-cream-muted)] hover:border-amber-100/60 hover:text-amber-50")
      }
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="rounded-full bg-black/40 px-1.5 text-[10px]">
          {count}
        </span>
      )}
    </button>
  );
}