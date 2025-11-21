// src/components/layout/page-header.tsx

import React from "react";

interface PageHeaderProps {
  /** Small label above the title, e.g. "Welcome back" or "CRM" */
  eyebrow?: string;
  /** Main page title, e.g. "Your AvilloOS command center" */
  title: string;
  /** Optional supporting copy under the title */
  subtitle?: string;
  /** Optional right-side actions (buttons, filters, etc.) */
  actions?: React.ReactNode;
  /** Optional children if you want to add extra custom content under the header row */
  children?: React.ReactNode;
}

/**
 * Shared page header used across AvilloOS.
 * Gives each page a consistent hero row with optional actions.
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <section className="mb-8 space-y-4">
      {/* Top row: title + actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          {eyebrow && (
            <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-white/55 uppercase">
              {eyebrow}
            </p>
          )}

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
            {title}
          </h1>

          {subtitle && (
            <p className="text-sm text-white/70 max-w-xl">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-3 md:gap-4">
            {actions}
          </div>
        )}
      </div>

      {/* Optional extra content under the header (filters, tabs, etc.) */}
      {children && <div>{children}</div>}
    </section>
  );
}