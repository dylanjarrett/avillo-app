// AvilloOS Empty State
export default function EmptyState({ title, description }) {
  return (
    <div className="p-10 text-center bg-card border border-border rounded-xl shadow-md space-y-3">
      <h2 className="text-2xl font-bold text-foreground">{title}</h2>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
