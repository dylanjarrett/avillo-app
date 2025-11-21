// src/components/activity/activity-feed.tsx
import { Card } from "@/components/ui/card";

type ActivityItem = {
  id: number;
  title: string;
  detail: string;
  time: string;
};

const mockActivity: ActivityItem[] = [
  {
    id: 1,
    title: "Listing pack generated",
    detail: "1234 Ocean View Dr · MLS copy + social posts ready.",
    time: "2 hours ago",
  },
  {
    id: 2,
    title: "Follow-up sequence sent",
    detail: "3-touch email flow sent to 5 warm seller leads.",
    time: "Yesterday",
  },
  {
    id: 3,
    title: "Buyer brief created",
    detail: "AI buyer summary for the Martin family.",
    time: "2 days ago",
  },
];

export default function ActivityFeed() {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--brand-text)]">
          Recent activity
        </h2>
        <p className="text-xs text-[var(--brand-text-muted)]">
          A quick look at what AvilloOS has done for you.
        </p>
      </div>

      <div className="space-y-3">
        {mockActivity.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-4 rounded-lg bg-[var(--brand-bg)]/40 px-3 py-2"
          >
            <div>
              <div className="text-xs font-medium text-[var(--brand-text)]">
                {item.title}
              </div>
              <div className="text-[0.7rem] text-[var(--brand-text-muted)]">
                {item.detail}
              </div>
            </div>
            <span className="text-[0.7rem] text-[var(--brand-text-muted)] whitespace-nowrap">
              {item.time}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
