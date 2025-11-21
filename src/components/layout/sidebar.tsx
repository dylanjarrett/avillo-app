"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/crm", label: "CRM" },
  { href: "/billing", label: "Billing" },
  { href: "/account", label: "Account" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="
        flex
        h-full
        w-64
        flex-col
        border-r
        border-[#1d2940]/70
        bg-[#050b16]  /* deep navy */
       /80
        backdrop-blur-xl
      "
    >
      {/* Top spacer so the sidebar lines up nicely under the navbar */}
      <div className="h-16 shrink-0" />

      {/* Section label */}
      <div className="px-6 pb-3 text-[0.7rem] font-semibold tracking-[0.24em] text-[#a3b0d0]/70">
        MAIN
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1 px-3 pb-6">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard" || pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group relative flex items-center rounded-xl px-3 py-2.5 text-sm
                transition-all duration-200
                ${
                  isActive
                    ? // ACTIVE STATE – off-navy pill + cream text
                      "bg-[#101a2b] text-[#f7f2e9] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                    : // INACTIVE – subtle, still clickable
                      "text-[#c0c9de]/80 hover:text-[#f7f2e9] hover:bg-[#0b1322]"
                }
              `}
            >
              {/* Left accent bar on hover/active */}
              <span
                className={`
                  mr-2 h-7 w-0.5 rounded-full bg-[#f7f2e9]
                  transition-all duration-200
                  ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"}
                `}
              />

              <span className="flex-1 font-medium">{item.label}</span>

              {/* Tiny dot for active item – feels SaaS-y */}
              {isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#f7f2e9]/90 shadow-[0_0_8px_rgba(247,242,233,0.9)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer helper text (matches your “private beta / single-seat preview” vibe) */}
      <div className="px-6 pb-6 text-[0.7rem] text-[#8f9bb8]/70">
        Private beta · <span className="text-[#f7f2e9]">Single-seat preview</span>
      </div>
    </aside>
  );
}