import PageHeader from "@/components/layout/page-header";
import StatBlock from "@/components/stats/stat-block";
import ActivityFeed from "@/components/activity/activity-feed";
import DataTable from "@/components/tables/data-table";
import TaskList from "@/components/tasks/task-list";
import NotificationCenter from "@/components/notifications/notification-center";

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="High-level view of your pipeline, activity, and AI output."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatBlock label="Active Clients" value="12" />
        <StatBlock label="Pending Deals" value="4" />
        <StatBlock label="AI Reports" value="26" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ActivityFeed />
          <DataTable />
        </div>
        <div className="space-y-6">
          <NotificationCenter />
          <TaskList />
        </div>
      </div>
    </div>
  );
}
