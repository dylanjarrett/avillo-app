// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import React from "react";
import Providers from "./providers"; // Session provider stays here

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AvilloOS",
  description: "Your AI operating system for real estate.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#040814] text-slate-50 antialiased">
        {/* Auth pages layout */}
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
