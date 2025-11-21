// AvilloOS Notification Center
export default function NotificationCenter() {
  const notifications = [
    { id: 1, message: "Your AI Listing Report is ready." },
    { id: 2, message: "New market data available." },
  ];
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-md space-y-3">
      <h2 className="text-xl font-semibold text-foreground mb-3">Notifications</h2>
      {notifications.map(n => (
        <div key={n.id} className="p-3 rounded-lg bg-input text-foreground border border-border">
          {n.message}
        </div>
      ))}
    </div>
  );
}
