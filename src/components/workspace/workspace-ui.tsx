//components/workspace/workspace-ui.tsx
"use client";

import React, { PropsWithChildren, useEffect } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function RoleBadge({ role }: { role: "OWNER" | "ADMIN" | "AGENT" }) {
  const tone =
    role === "OWNER"
      ? "border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.18)]"
      : role === "ADMIN"
        ? "border-slate-300/40 bg-slate-900/60 text-slate-50 shadow-[0_0_30px_rgba(248,250,252,0.10)]"
        : "border-slate-600 bg-slate-900/60 text-slate-300";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-wide",
        tone
      )}
    >
      {role}
    </span>
  );
}

export function PillButton({
  children,
  onClick,
  disabled,
  intent = "primary",
  size = "sm",
  type = "button",
  title,
}: PropsWithChildren<{
  onClick?: () => void;
  disabled?: boolean;
  intent?: "primary" | "neutral" | "danger";
  size?: "sm" | "md";
  type?: "button" | "submit";
  title?: string;
}>) {
  const base =
    "inline-flex items-center justify-center rounded-full font-semibold transition border";

  const sizing =
    size === "md" ? "px-4 py-2 text-xs" : "px-3 py-1.5 text-[11px]";

  const styles = (() => {
    if (disabled) {
      return "border-slate-600 bg-slate-900/60 text-slate-500 cursor-default";
    }
    if (intent === "danger") {
      return "border-rose-300/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15 hover:border-rose-200/50 shadow-[0_0_24px_rgba(244,63,94,0.14)]";
    }
    if (intent === "neutral") {
      return "border-slate-600 bg-slate-900/70 text-slate-200 hover:border-amber-100/70 hover:bg-amber-50/10 hover:text-amber-100";
    }
    return "border-amber-100/70 bg-amber-50/10 text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.18)] hover:bg-amber-50/20";
  })();

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={cx(base, sizing, styles)}
    >
      {children}
    </button>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  helper,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  helper?: string;
  error?: string | null;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-200/90">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cx(
          "mt-1 w-full rounded-xl border bg-slate-900/70 px-3 py-2 text-xs outline-none ring-0",
          disabled
            ? "cursor-not-allowed border-slate-700 bg-slate-900/50 text-slate-400"
            : "border-slate-600 text-slate-50 focus:border-amber-100/70 focus:ring-2 focus:ring-amber-100/40"
        )}
      />
      {error ? (
        <p className="mt-1 text-[11px] text-rose-300">{error}</p>
      ) : helper ? (
        <p className="mt-1 text-[11px] text-slate-400/90">{helper}</p>
      ) : null}
    </div>
  );
}

export function CardShell({
  title,
  subtitle,
  right,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}>) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)] opacity-40 blur-3xl" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/80 uppercase">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-2 text-xs text-slate-200/90">{subtitle}</p>
          ) : null}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
}>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/90 shadow-[0_0_60px_rgba(15,23,42,0.95)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.14),transparent_55%)] opacity-50 blur-3xl" />
        <div className="px-6 py-5">
          <p className="text-sm font-semibold text-slate-50">{title}</p>
          {description ? (
            <p className="mt-1 text-xs text-slate-300/90">{description}</p>
          ) : null}
          <div className="mt-4">{children}</div>
        </div>
        {footer ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
