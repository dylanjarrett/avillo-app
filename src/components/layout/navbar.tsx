// src/components/layout/navbar.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

function getInitials(nameOrEmail?: string | null) {
  if (!nameOrEmail) return "DJ"; // fallback
  const value = nameOrEmail.trim();
  if (!value) return "DJ";

  if (value.includes(" ")) {
    const parts = value.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    const combo = (first + last).toUpperCase();
    return combo || "DJ";
  }

  if (value.includes("@")) {
    return value[0].toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

export default function Navbar() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const initials = getInitials(session?.user?.name || session?.user?.email || "DJ");

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#1c2836] bg-gradient-to-r from-[#040814] via-[#050b18] to-[#040814] shadow-[0_10px_40px_rgba(0,0,0,0.7)]">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-10">
        {/* LEFT – BRAND */}
        <Link href="/dashboard" className="flex items-center gap-4">
          <div className="relative h-16 w-16 sm:h-20 sm:w-20">
            <Image
              src="/avillo-logo-cream.png"
              alt="Avillo logo"
              width={80}
              height={80}
              sizes="80px"
              priority
              className="h-full w-full object-contain drop-shadow-[0_0_35px_rgba(252,243,211,0.35)]"
            />
          </div>

          <div className="hidden flex-col leading-tight text-left sm:flex">
            <span className="text-[0.68rem] font-medium tracking-[0.28em] text-[#f7f0d8] uppercase">
              AI tools for real estate
            </span>
            <span className="mt-1 text-[0.7rem] text-[#9ca9c3]">
              Workflows, listings, and CRM in one command center
            </span>
          </div>
        </Link>

        {/* RIGHT – STATUS + USER */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            className="hidden rounded-full border border-[#273247] bg-[#0b1220] px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-[#f7f0d8] shadow-[0_0_20px_rgba(0,0,0,0.6)] sm:inline-flex"
          >
            Private beta
          </button>

          {/* USER DROPDOWN */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#273247] bg-[#0f1729] text-xs font-semibold tracking-wide text-[#f7f0d8] shadow-[0_0_25px_rgba(0,0,0,0.7)] hover:bg-[#162037] transition"
            >
              {initials}
            </button>

            {/* Animated dropdown */}
            <div
              className={`absolute right-0 mt-3 w-48 origin-top-right rounded-2xl border border-[#273247] bg-[#050815]/95 py-2 shadow-[0_0_36px_rgba(0,0,0,0.85)] backdrop-blur transition-all duration-150 ease-out transform ${
                open
                  ? "pointer-events-auto opacity-100 scale-100 translate-y-0"
                  : "pointer-events-none opacity-0 scale-95 -translate-y-1"
              }`}
            >
              {/* Minimal header */}
              <div className="px-4 pb-1 pt-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#6f7a93]">
                  Workspace
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[#cfd7ea]">
                  {session?.user?.email || "Signed in to Avillo"}
                </p>
              </div>

              <div className="my-2 h-px bg-[rgba(148,163,184,0.22)]" />

              <Link
                href="/billing"
                onClick={() => setOpen(false)}
                className="block px-4 py-1.5 text-[13px] text-[#f7f0d8] hover:bg-[#101729] hover:text-[#fefce8]"
              >
                Billing
              </Link>

              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="block px-4 py-1.5 text-[13px] text-[#f7f0d8] hover:bg-[#101729] hover:text-[#fefce8]"
              >
                Account
              </Link>

              <a
                href="mailto:support@avillo.io"
                onClick={() => setOpen(false)}
                className="block px-4 py-1.5 text-[13px] text-[#f7f0d8] hover:bg-[#101729] hover:text-[#fefce8]"
              >
                Help &amp; support
              </a>

              <div className="my-2 h-px bg-[rgba(148,163,184,0.22)]" />

              <button
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/login" });
                }}
                className="block w-full px-4 py-1.5 text-left text-[13px] text-[#fca5a5] hover:bg-[#101729]"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}