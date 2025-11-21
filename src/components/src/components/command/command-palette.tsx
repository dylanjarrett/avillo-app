// AvilloOS Command Palette
export default function CommandPalette() {
  const commands = [
    "Create Listing Description",
    "Generate Buyer Packet",
    "View Dashboard",
    "Open Settings",
  ];

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border border-border rounded-2xl shadow-xl p-6 space-y-3">
      <input
        className="w-full p-3 rounded-lg bg-input border border-border text-foreground"
        placeholder="Type a command..."
      />
      <div className="space-y-2">
        {commands.map((c, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg bg-input border border-border text-foreground hover:bg-muted cursor-pointer"
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
