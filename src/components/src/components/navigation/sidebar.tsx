// AvilloOS Sidebar Placeholder
export default function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-[#0d121d] text-[#f5f1e8] p-6">
      <nav className="space-y-4">
        <a className="block hover:text-primary">Dashboard</a>
        <a className="block hover:text-primary">Intelligence</a>
        <a className="block hover:text-primary">Billing</a>
      </nav>
    </aside>
  );
}
