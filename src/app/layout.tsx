// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";

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
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
          {/* Top navigation bar */}
          <Navbar />

          {/* App shell: sidebar + main content */}
          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
              <div className="max-w-6xl mx-auto">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}