// AvilloOS Email Preview Card
export default function EmailPreview({ subject, snippet }) {
  return (
    <div className="p-4 bg-card border border-border rounded-xl shadow-md space-y-1">
      <h3 className="text-lg font-semibold text-foreground">{subject}</h3>
      <p className="text-muted-foreground text-sm">{snippet}</p>
    </div>
  );
}
