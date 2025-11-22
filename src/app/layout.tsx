// src/app/layout.tsx
import "../app/globals.css";
import type { Metadata } from "next";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import React from "react";

export const metadata: Metadata = {
  title: "AvilloOS",
  description: "Your AI operating system for real estate.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] antialiased">
        {/* Top nav */}
        <Navbar />

        {/* Shell: sidebar + main content */}
        <div className="flex flex-1">
          <Sidebar />

          <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
            <div className="max-w-6xl mx-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}