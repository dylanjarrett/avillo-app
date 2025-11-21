// AvilloOS Property Card
export default function PropertyCard({ address, price }) {
  return (
    <div className="p-4 bg-card border border-border rounded-xl shadow-md space-y-1">
      <h3 className="text-xl font-semibold text-foreground">{address}</h3>
      <p className="text-muted-foreground text-sm">${price}</p>
    </div>
  );
}
