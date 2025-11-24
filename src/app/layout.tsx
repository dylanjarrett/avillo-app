// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
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
      {/* Body styling is handled mostly by globals.css (Avillo tokens) */}
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}