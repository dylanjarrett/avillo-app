//app/(portal)/comms/page.tsx
"use client";

import PageHeader from "@/components/layout/page-header";
import CommsPage from "@/components/comms/comms-shell";

export default function Comms() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Comms"
        title="Conversations"
        subtitle="Text and call — fast, private, organized."
      />

      <CommsPage />
    </div>
  );
}