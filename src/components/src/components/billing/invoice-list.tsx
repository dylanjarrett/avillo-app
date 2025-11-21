// AvilloOS Invoice List
export default function InvoiceList() {
  const invoices = [
    { id: "INV-001", amount: "$49.00", date: "2025-01-01" },
    { id: "INV-002", amount: "$49.00", date: "2025-02-01" }
  ];
  return (
    <div className="space-y-3">
      {invoices.map((inv, idx) => (
        <div key={idx} className="p-4 bg-input border border-border rounded-lg text-foreground">
          <p className="font-semibold">{inv.id}</p>
          <p className="text-muted-foreground text-sm">{inv.amount} • {inv.date}</p>
        </div>
      ))}
    </div>
  );
}
