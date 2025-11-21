// AvilloOS Lead Card
export default function LeadCard({ name, status }) {
  return (
    <div className="p-4 bg-input border border-border rounded-xl text-foreground shadow-sm">
      <h3 className="font-semibold">{name}</h3>
      <p className="text-muted-foreground text-sm">{status}</p>
    </div>
  );
}
