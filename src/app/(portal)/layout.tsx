"use client";

import React, { useState } from "react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import { TourProvider } from "@/components/tour/tour-provider";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <TourProvider>
      <Navbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

      <div
        className="
          relative
          w-full
          min-h-[calc(100vh-5rem)]
          lg:grid lg:grid-cols-[260px_minmax(0,1fr)]
        "
      >
        {/* Sidebar column */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-10 lg:py-10">
          <div
            className="
              mx-auto
              w-full
              max-w-6xl
              xl:max-w-7xl
              2xl:max-w-[88rem]
              space-y-8
            "
          >
            {children}
          </div>
        </main>
      </div>
    </TourProvider>
  );
}