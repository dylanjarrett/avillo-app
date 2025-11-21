// AvilloOS Stat Block
export default function StatBlock({ label, value }) {
  return (
    <div className="rounded-xl bg-card border border-border p-4 shadow-sm text-center">
      <div className="text-3xl font-bold text-foreground mb-2">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
