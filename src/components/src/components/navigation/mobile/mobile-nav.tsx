// AvilloOS Mobile Navigation
export default function MobileNav() {
  const links = ["Dashboard", "Intelligence", "Billing", "Account"];

  return (
    <div className="md:hidden p-4 bg-card border-b border-border">
      <button className="p-2 bg-input border border-border rounded-lg text-foreground">
        ☰
      </button>
      <div className="mt-4 space-y-2">
        {links.map((l, idx) => (
          <div
            key={idx}
            className="p-3 bg-input border border-border rounded-lg text-foreground hover:bg-muted"
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
