// AvilloOS Global Search Bar
export default function GlobalSearch() {
  return (
    <div className="w-full max-w-xl p-3 rounded-xl bg-input border border-border text-foreground shadow-sm">
      <input
        className="w-full bg-transparent outline-none"
        placeholder="Search listings, clients, tasks..."
      />
    </div>
  );
}
