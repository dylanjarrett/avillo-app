// src/components/ui/textarea.tsx
import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm text-[var(--brand-text)] placeholder:text-[var(--brand-text-muted)] outline-none focus:border-[var(--brand-accent)] min-h-[120px] " +
        className
      }
    />
  );
}
