"use client";

import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#1c2836] bg-gradient-to-r from-[#040814] via-[#050b18] to-[#040814] shadow-[0_10px_40px_rgba(0,0,0,0.7)]">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-10">

        {/* LEFT – BRAND */}
        <Link href="/dashboard" className="flex items-center gap-4">
          {/* BIG, CRISP LOGO */}
          <div className="relative h-16 w-16 sm:h-20 sm:w-20">
            <Image
              src="/avillo-logo-cream.png"  // make sure this exact file exists in /public
              alt="Avillo logo"
              width={80}      // logical size (for quality)
              height={80}
              sizes="80px"
              priority
              className="h-full w-full object-contain drop-shadow-[0_0_35px_rgba(252,243,211,0.35)]"
            />
          </div>

          {/* TAGLINE ONLY (no “Avillo” text label) */}
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

          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#273247] bg-[#0f1729] text-xs font-semibold tracking-wide text-[#f7f0d8] shadow-[0_0_25px_rgba(0,0,0,0.7)]">
            DJ
          </div>
        </div>
      </div>
    </header>
  );
}
