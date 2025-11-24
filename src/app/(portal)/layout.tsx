"use client";

import { SessionProvider } from "next-auth/react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)]">
        {/* Top Nav */}
        <Navbar />

        {/* Sidebar + Content */}
        <div className="flex flex-1">
          <Sidebar />

          <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
            <div className="max-w-6xl mx-auto">{children}</div>
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}