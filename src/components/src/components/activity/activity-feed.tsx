// AvilloOS Activity Feed
export default function ActivityFeed() {
  const activities = [
    { id: 1, event: "Generated CMA for 123 Main St." },
    { id: 2, event: "Created Buyer Packet." },
    { id: 3, event: "Updated Profile Settings." },
  ];
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-md space-y-3">
      <h2 className="text-xl font-semibold text-foreground mb-4">Recent Activity</h2>
      {activities.map(a => (
        <div key={a.id} className="p-3 bg-input border border-border rounded-lg text-foreground">
          {a.event}
        </div>
      ))}
    </div>
  );
}
