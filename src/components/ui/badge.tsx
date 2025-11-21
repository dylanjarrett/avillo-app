// src/components/ui/badge.tsx
import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-[2px] text-[0.7rem] font-medium text-[var(--brand-text-muted)]">
      {children}
    </span>
  );
}
