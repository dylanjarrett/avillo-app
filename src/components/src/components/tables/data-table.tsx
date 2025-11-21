// AvilloOS Data Table
export default function DataTable() {
  const sample = [
    { id: 1, title: "Listing Prep", status: "Complete" },
    { id: 2, title: "Buyer Packet", status: "In Progress" },
  ];

  return (
    <table className="w-full bg-card border border-border rounded-xl overflow-hidden">
      <thead className="bg-[#151b2a] text-foreground">
        <tr>
          <th className="p-3 text-left">ID</th>
          <th className="p-3 text-left">Workflow</th>
          <th className="p-3 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {sample.map((row) => (
          <tr key={row.id} className="border-t border-border">
            <td className="p-3">{row.id}</td>
            <td className="p-3">{row.title}</td>
            <td className="p-3 text-muted-foreground">{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
