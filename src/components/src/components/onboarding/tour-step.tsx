// AvilloOS Tour Step
export default function TourStep({ title, description }) {
  return (
    <div className="p-6 bg-input border border-border rounded-xl shadow-md space-y-2">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
