"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TOOL_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/people", label: "People" },
  { href: "/listings", label: "Listings" },
  { href: "/autopilot", label: "Autopilot" },
];

const ACCOUNT_ITEMS = [
  { href: "/billing", label: "Billing" },
  { href: "/account", label: "Account" },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

function tourIdForHref(href: string) {
  switch (href) {
    case "/dashboard":
      return "tour-nav-dashboard";
    case "/intelligence":
      return "tour-nav-intelligence";
    case "/people":
      return "tour-nav-people";
    case "/listings":
      return "tour-nav-listings";
    case "/autopilot":
      return "tour-nav-autopilot";
    default:
      return undefined;
  }
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  function renderNavItem(item: { href: string; label: string }) {
    const isActive =
      item.href === "/dashboard"
        ? pathname === "/dashboard" || pathname === "/"
        : pathname.startsWith(item.href);

    const tourId = tourIdForHref(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        id={tourId}
        className={`
          group relative flex items-center rounded-xl px-3 py-2.5 text-sm transition-all duration-200
          ${
            isActive
              ? "bg-[#0d1625] text-[#f7f2e9] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
              : "text-[#c0c9de]/80 hover:text-[#f7f2e9] hover:bg-[#0b1322]"
          }
        `}
        onClick={onClose}
      >
        <span
          className={`
            mr-2 h-7 w-0.5 rounded-full bg-[#f7f2e9] transition-all duration-200
            ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"}
          `}
        />

        <span className="flex-1 font-medium">{item.label}</span>

        {isActive && (
          <span className="h-1.5 w-1.5 rounded-full bg-[#f7f2e9]/90 shadow-[0_0_8px_rgba(247,242,233,0.9)]" />
        )}
      </Link>
    );
  }

  function SidebarInner() {
    return (
      <div className="flex h-full flex-col bg-[#050b16]/80 backdrop-blur-xl pb-6">
        <div className="px-6 pt-4 pb-2 text-[0.7rem] font-semibold tracking-[0.24em] text-[#a3b0d0]/70">
          TOOLS
        </div>

        <nav className="flex flex-col gap-1 px-3 pb-4">{TOOL_ITEMS.map(renderNavItem)}</nav>

        <div className="mx-6 my-2 h-px bg-[#1a2435]/60" />

        <div className="px-6 pb-2 text-[0.7rem] font-semibold tracking-[0.24em] text-[#a3b0d0]/70">
          ADMIN
        </div>

        <nav className="flex flex-col gap-1 px-3 pb-4">{ACCOUNT_ITEMS.map(renderNavItem)}</nav>

        <div className="mt-auto px-6 text-[0.7rem] text-[#8f9bb8]/70">
          Private beta · <span className="text-[#f7f2e9]">Single-seat preview</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 border-r border-[#1d2940]/70 lg:block">
        <div
          className="
            fixed
            left-0
            top-20
            h-[calc(100vh-5rem)]
            w-64
            bg-[#050b16]/80
            backdrop-blur-xl
          "
        >
          <SidebarInner />
        </div>
      </aside>

      {/* Mobile slide-in drawer */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-64 border-r border-[#1d2940]/70
          transform transition-transform duration-200 ease-out
          lg:hidden
          ${open ? "translate-x-0" : "-translate-x-full"}
          bg-[#050b16]/95 backdrop-blur-xl
        `}
      >
        <div className="flex items-center justify-between border-b border-[#1d2940]/70 px-4 py-3">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[#a3b0d0]/80">
            Menu
          </span>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#273247] bg-[#0f1729] px-2 py-1 text-[0.7rem] text-[#f7f2e9] transition hover:bg-[#162037]"
          >
            Close
          </button>
        </div>

        <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[#1d2940] scrollbar-track-transparent">
          <SidebarInner />
        </div>
      </div>
    </>
  );
}
