// AvilloOS Chat Window
export default function ChatWindow() {
  const messages = [
    { from: "client", text: "Can we see the property tomorrow?" },
    { from: "agent", text: "Absolutely, what time works best?" }
  ];

  return (
    <div className="p-6 bg-card border border-border rounded-xl space-y-3 h-[400px] overflow-y-auto">
      {messages.map((m, idx) => (
        <div key={idx} className={m.from === "agent" ? "text-right" : "text-left"}>
          <span className="inline-block px-3 py-2 bg-input border border-border rounded-lg text-foreground">
            {m.text}
          </span>
        </div>
      ))}
    </div>
  );
}
