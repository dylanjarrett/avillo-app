// src/components/dashboard/stat-card.tsx
import { Card } from "@/components/ui/card";

type Props = {
  label: string;
  value: string | number;
  helper?: string;
};

export default function StatCard({ label, value, helper }: Props) {
  return (
    <Card className="space-y-1">
      <div className="text-[0.7rem] uppercase tracking-wide text-[var(--brand-text-muted)]">
        {label}
      </div>
      <div className="text-2xl md:text-3xl font-semibold text-[var(--brand-text)]">
        {value}
      </div>
      {helper && (
        <div className="text-[0.75rem] text-[var(--brand-text-muted)]">
          {helper}
        </div>
      )}
    </Card>
  );
}

