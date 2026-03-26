// components/ui/password-input.tsx
"use client";

import React, { useState } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
      />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 6.3A8.8 8.8 0 0 1 12 6c5.5 0 9 6 9 6a13.3 13.3 0 0 1-3.2 4.1M6.7 6.7A13.2 13.2 0 0 0 3 12s3.5 6 9 6c1.2 0 2.3-.2 3.3-.6"
      />
    </svg>
  );
}

export type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

export default function PasswordInput({
  className,
  disabled,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cx(className, "w-full pr-10")}
      />

      <button
        type="button"
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--avillo-cream-muted)] transition hover:text-[var(--avillo-cream)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {visible ? <EyeOffIcon className="h-3 w-3" /> : <EyeIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}