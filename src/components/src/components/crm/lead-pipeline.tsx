// AvilloOS Lead Pipeline
export default function LeadPipeline() {
  const stages = ["New Lead", "Contacted", "Active Client", "Pending", "Closed"];
  return (
    <div className="grid grid-cols-5 gap-4">
      {stages.map((s, idx) => (
        <div key={idx} className="p-4 bg-card border border-border rounded-xl text-center shadow-sm">
          <h4 className="text-foreground font-semibold">{s}</h4>
        </div>
      ))}
    </div>
  );
}
