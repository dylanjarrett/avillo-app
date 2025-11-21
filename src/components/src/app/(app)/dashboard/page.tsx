// AvilloOS Assembled Dashboard Page
import StatBlock from '@/components/stats/stat-block';
import ActivityFeed from '@/components/activity/activity-feed';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        <StatBlock label="Active Clients" value="12" />
        <StatBlock label="Pending Deals" value="4" />
        <StatBlock label="AI Reports" value="26" />
      </div>
      <ActivityFeed />
    </div>
  );
}
