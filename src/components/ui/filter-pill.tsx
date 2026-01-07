"use client";

type BadgeColor = "new" | "warm" | "hot" | "past";
type PillVariant = "modeClient" | "modePartner" | "filter" | "default";

type FilterPillProps = {
  label: string;
  count?: number;
  active?: boolean;
  badgeColor?: BadgeColor; // optional – only use for stage filters
  variant?: PillVariant;   // NEW – visual intent for non-stage pills
  onClick: () => void;
};

function activeClasses(badgeColor?: BadgeColor, variant: PillVariant = "default"): string {
  // Stage pills (unchanged)
  switch (badgeColor) {
    case "new":
      return "border-sky-300/80 bg-sky-500/10 text-sky-100";
    case "warm":
      return "border-amber-200/80 bg-amber-400/10 text-amber-100";
    case "hot":
      return "border-rose-300/80 bg-rose-500/10 text-rose-100";
    case "past":
      return "border-slate-500/80 bg-slate-800/60 text-slate-200";
  }

  // Non-stage pills
  switch (variant) {
    case "modeClient":
      return "border-amber-100/85 bg-amber-50/15 text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.35)]";
    case "modePartner":
      return "border-violet-200/70 bg-violet-500/10 text-violet-100 shadow-[0_0_18px_rgba(139,92,246,0.22)]";
    case "filter":
      // calmer “selected” state for All/Buyers/Sellers
      return "border-slate-300/25 bg-slate-50/5 text-slate-50 shadow-[0_0_14px_rgba(248,250,252,0.16)]";
    default:
      // fallback (keeps your existing vibe for misc pills elsewhere)
      return "border-amber-100/80 bg-amber-50/15 text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.35)]";
  }
}

function inactiveClasses(variant: PillVariant = "default"): string {
  switch (variant) {
    case "modeClient":
      return "border-slate-700/80 text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50";
    case "modePartner":
      return "border-slate-700/80 text-[var(--avillo-cream-muted)] hover:border-violet-200/70 hover:text-violet-100";
    case "filter":
      return "border-slate-700/80 text-[var(--avillo-cream-muted)] hover:border-slate-400/50 hover:text-slate-50";
    default:
      return "border-slate-700/80 text-[var(--avillo-cream-muted)] hover:border-amber-100/60 hover:text-amber-50";
  }
}

export function FilterPill({
  label,
  count,
  active,
  badgeColor,
  variant = "default",
  onClick,
}: FilterPillProps) {
  const isStage = !!badgeColor;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors " +
        (active
          ? activeClasses(badgeColor, variant)
          : inactiveClasses(isStage ? "default" : variant))
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