// src/app/(portal)/layout.tsx
"use client";

import React, { useState } from "react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Navbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />

      <div
        className="
          relative
          mx-auto
          max-w-7xl
          min-h-[calc(100vh-5rem)]
          lg:grid lg:grid-cols-[260px_minmax(0,1fr)]
        "
      >
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </>
  );
}
