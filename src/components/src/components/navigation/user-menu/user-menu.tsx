// AvilloOS User Menu Dropdown
export default function UserMenu() {
  const items = ["Profile", "Settings", "Billing", "Logout"];

  return (
    <div className="relative inline-block text-left">
      <button className="px-4 py-2 bg-card border border-border rounded-lg text-foreground hover:scale-[1.02] transition-all">
        Account
      </button>
      <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl p-2 space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="p-2 rounded-lg text-foreground hover:bg-muted cursor-pointer"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
