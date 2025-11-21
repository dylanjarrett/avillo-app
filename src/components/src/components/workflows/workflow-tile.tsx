// AvilloOS Workflow Tile
export default function WorkflowTile({ title, description }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer">
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
