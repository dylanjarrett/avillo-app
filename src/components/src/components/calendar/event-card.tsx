// AvilloOS Calendar Event Card
export default function EventCard({ title, time }) {
  return (
    <div className="p-3 bg-input border border-border rounded-xl shadow-sm">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="text-muted-foreground text-sm">{time}</p>
    </div>
  );
}
