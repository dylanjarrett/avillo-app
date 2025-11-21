// src/components/ui/input.tsx
import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm text-[var(--brand-text)] placeholder:text-[var(--brand-text-muted)] outline-none focus:border-[var(--brand-accent)] " +
        className
      }
    />
  );
}
