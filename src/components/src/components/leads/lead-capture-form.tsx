// AvilloOS Lead Capture Form
export default function LeadCaptureForm() {
  return (
    <div className="p-6 bg-card border border-border rounded-xl shadow-md space-y-3">
      <h2 className="text-2xl font-semibold text-foreground">New Lead</h2>
      <input className="w-full p-3 bg-input border border-border rounded-lg text-foreground" placeholder="Full Name" />
      <input className="w-full p-3 bg-input border border-border rounded-lg text-foreground" placeholder="Email" />
      <input className="w-full p-3 bg-input border border-border rounded-lg text-foreground" placeholder="Phone" />
      <textarea className="w-full p-3 bg-input border border-border rounded-lg text-foreground" placeholder="Notes" />
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:scale-[1.03] transition-all">
        Add Lead
      </button>
    </div>
  );
}
