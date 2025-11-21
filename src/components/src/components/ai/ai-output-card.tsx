// AvilloOS AI Output Card
export default function AIOutputCard({ title, content }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-md space-y-3">
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <p className="text-muted-foreground whitespace-pre-line">{content}</p>
    </div>
  );
}
