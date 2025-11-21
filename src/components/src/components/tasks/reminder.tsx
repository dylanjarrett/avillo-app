// AvilloOS Reminder Card
export default function Reminder({ message, due }) {
  return (
    <div className="p-4 bg-card border border-border rounded-xl shadow-md space-y-1">
      <h3 className="text-lg font-semibold text-foreground">{message}</h3>
      <p className="text-muted-foreground text-sm">Due: {due}</p>
    </div>
  );
}
