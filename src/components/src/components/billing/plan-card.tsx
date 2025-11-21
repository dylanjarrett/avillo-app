// AvilloOS Plan Card
export default function PlanCard({ name, price, features }) {
  return (
    <div className="p-6 bg-card border border-border rounded-xl shadow-md space-y-3">
      <h2 className="text-2xl font-semibold text-foreground">{name}</h2>
      <p className="text-muted-foreground text-lg">${price}/mo</p>
      <ul className="space-y-1 text-muted-foreground text-sm">
        {features.map((f, idx) => (
          <li key={idx}>• {f}</li>
        ))}
      </ul>
      <button className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:scale-[1.03] transition-all">
        Select Plan
      </button>
    </div>
  );
}
