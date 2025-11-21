// AvilloOS Lead Pipeline View
export default function LeadPipeline() {
  const stages = ["New", "Contacted", "Qualified", "Showing", "Closed"];
  return (
    <div className="grid grid-cols-5 gap-4">
      {stages.map((s, idx) => (
        <div key={idx} className="p-4 bg-card border border-border rounded-xl text-center text-foreground shadow-md">
          {s}
        </div>
      ))}
    </div>
  );
}
