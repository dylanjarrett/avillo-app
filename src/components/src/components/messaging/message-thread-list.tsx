// AvilloOS Message Thread List
export default function MessageThreadList() {
  const threads = [
    { name: "John Carter", last: "Can we schedule a showing?" },
    { name: "Sarah Liu", last: "Thanks for the updated CMA!" }
  ];

  return (
    <div className="space-y-3">
      {threads.map((t, idx) => (
        <div key={idx} className="p-4 bg-card border border-border rounded-xl hover:bg-muted cursor-pointer">
          <h3 className="text-foreground font-semibold">{t.name}</h3>
          <p className="text-muted-foreground text-sm">{t.last}</p>
        </div>
      ))}
    </div>
  );
}
