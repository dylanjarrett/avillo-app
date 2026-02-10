//app/(portal)/comms/page.tsx
"use client";

import PageHeader from "@/components/layout/page-header";
import CommsPage from "@/components/comms/comms-shell";

export default function Comms() {
  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Comms"
        title="Messaging & calling"
        subtitle="Conversations — fast, private, and organized."
      />

      <CommsPage />
    </div>
  );
}