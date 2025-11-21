// src/components/ui/button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost";
}

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium px-4 py-2 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--brand-bg)]";

  const variants: Record<string, string> = {
    primary:
      "bg-[var(--brand-accent)] text-white hover:bg-[var(--brand-accent)]/90",
    outline:
      "border border-[var(--brand-border)] text-[var(--brand-text)] hover:bg-[var(--brand-bg)]",
    ghost:
      "text-[var(--brand-text-muted)] hover:text-[var(--brand-text)] hover:bg-[var(--brand-bg)]",
  };

  return (
    <button
      {...props}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
