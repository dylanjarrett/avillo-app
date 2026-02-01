//components/ui/tabPills.tsx
export const AVILLO_TAB_PILL_BASE =
  "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition";

export const AVILLO_TAB_PILL_ACTIVE =
  "border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_18px_rgba(248,250,252,0.18)]";

export const AVILLO_TAB_PILL_INACTIVE =
  "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50";

export function avilloTabPillClass(active: boolean) {
  return `${AVILLO_TAB_PILL_BASE} ${active ? AVILLO_TAB_PILL_ACTIVE : AVILLO_TAB_PILL_INACTIVE}`;
}