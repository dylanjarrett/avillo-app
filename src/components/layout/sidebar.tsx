"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TOOL_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/crm", label: "CRM" },
];

const ACCOUNT_ITEMS = [
  { href: "/billing", label: "Billing" },
  { href: "/account", label: "Account" },
];

export default function Sidebar() {
  const pathname = usePathname();

  function renderNavItem(item: { href: string; label: string }) {
    const isActive =
      item.href === "/dashboard"
        ? pathname === "/dashboard" || pathname === "/"
        : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`
          group relative flex items-center rounded-xl px-3 py-2.5 text-sm transition-all duration-200
          ${
            isActive
              ? "bg-[#0d1625] text-[#f7f2e9] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
              : "text-[#c0c9de]/80 hover:text-[#f7f2e9] hover:bg-[#0b1322]"
          }
        `}
      >
        {/* Left accent bar */}
        <span
          className={`
            mr-2 h-7 w-0.5 rounded-full bg-[#f7f2e9] transition-all duration-200
            ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"}
          `}
        />

        <span className="flex-1 font-medium">{item.label}</span>

        {/* glowing active dot */}
        {isActive && (
          <span className="h-1.5 w-1.5 rounded-full bg-[#f7f2e9]/90 shadow-[0_0_8px_rgba(247,242,233,0.9)]" />
        )}
      </Link>
    );
  }

  return (
    <aside
      className="
        flex h-full w-64 flex-col border-r border-[#1d2940]/70
        bg-[#050b16]/80 backdrop-blur-xl
      "
    >
      {/* Top spacer to align with navbar */}
      <div className="h-16 shrink-0" />

      {/* TOOLS SECTION */}
      <div className="px-6 pb-3 text-[0.7rem] font-semibold tracking-[0.24em] text-[#a3b0d0]/70">
        TOOLS
      </div>

      <nav className="flex flex-col gap-1 px-3 pb-6">
        {TOOL_ITEMS.map(renderNavItem)}
      </nav>

      {/* Divider Line */}
      <div className="mx-6 my-2 h-px bg-[#1a2435]/60" />

      {/* ACCOUNT SECTION */}
      <div className="px-6 pb-3 text-[0.7rem] font-semibold tracking-[0.24em] text-[#a3b0d0]/70">
        ADMIN
      </div>

      <nav className="flex flex-col gap-1 px-3 pb-6">
        {ACCOUNT_ITEMS.map(renderNavItem)}
      </nav>

      {/* FOOTER */}
      <div className="mt-auto px-6 pb-6 text-[0.7rem] text-[#8f9bb8]/70">
        Private beta · <span className="text-[#f7f2e9]">Single-seat preview</span>
      </div>
    </aside>
  );
}