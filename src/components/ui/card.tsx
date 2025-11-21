// src/components/ui/card.tsx
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={
        "rounded-xl border border-[var(--brand-border-subtle)] bg-[rgba(15,23,42,0.95)] px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.85)] " +
        "ring-1 ring-black/40 " +
        className
      }
    >
      {children}
    </div>
  );
}
