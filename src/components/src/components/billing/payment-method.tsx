// AvilloOS Payment Method Display
export default function PaymentMethod() {
  return (
    <div className="p-4 bg-card border border-border rounded-xl shadow-md space-y-2">
      <h3 className="text-lg font-semibold text-foreground">Payment Method</h3>
      <p className="text-muted-foreground text-sm">Visa •••• 4242</p>
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:scale-[1.03] transition-all">
        Update Card
      </button>
    </div>
  );
}
