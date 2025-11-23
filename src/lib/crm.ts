// src/lib/crm.ts

export interface CRMRecord {
  id: string;
  processed: string;
  type: string;
  createdAt: string;
}

export async function saveToCRM(payload: {
  raw?: string;
  processed: string;
  type?: string;
}): Promise<void> {
  const res = await fetch("/api/crm/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("saveToCRM error", await res.text());
    throw new Error("Failed to save to CRM");
  }
}

export async function fetchRecentAI(limit = 10): Promise<CRMRecord[]> {
  const res = await fetch(`/api/crm/recent?limit=${encodeURIComponent(limit)}`);

  if (!res.ok) {
    console.error("fetchRecentAI error", await res.text());
    return [];
  }

  const data = await res.json();
  return (data.records || []) as CRMRecord[];
}
