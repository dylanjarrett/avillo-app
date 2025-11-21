// AvilloOS Email Composer
export default function EmailComposer() {
  return (
    <div className="space-y-3 p-6 bg-card border border-border rounded-xl shadow-md">
      <input
        className="w-full p-3 bg-input text-foreground border border-border rounded-lg"
        placeholder="Recipient"
      />
      <input
        className="w-full p-3 bg-input text-foreground border border-border rounded-lg"
        placeholder="Subject"
      />
      <textarea
        className="w-full p-3 h-40 bg-input text-foreground border border-border rounded-lg"
        placeholder="Write your message..."
      />
      <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:scale-[1.03] transition-all">
        Send Email
      </button>
    </div>
  );
}
