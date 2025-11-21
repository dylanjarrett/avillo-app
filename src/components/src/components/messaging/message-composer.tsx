// AvilloOS Message Composer
export default function MessageComposer() {
  return (
    <div className="flex gap-3 p-3 bg-input border border-border rounded-xl">
      <input
        className="flex-1 bg-transparent outline-none text-foreground"
        placeholder="Type your message..."
      />
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:scale-[1.03] transition-all">
        Send
      </button>
    </div>
  );
}
