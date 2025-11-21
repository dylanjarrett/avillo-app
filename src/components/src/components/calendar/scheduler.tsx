// AvilloOS Scheduler
export default function Scheduler() {
  return (
    <div className="space-y-4 bg-card p-6 border border-border rounded-xl shadow-md">
      <h2 className="text-xl font-semibold text-foreground mb-2">Create Event</h2>
      <input className="w-full p-2 bg-input border border-border rounded-lg text-foreground" placeholder="Event Title" />
      <input className="w-full p-2 bg-input border border-border rounded-lg text-foreground" placeholder="Date" type="date" />
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:scale-[1.03] transition-all">
        Add Event
      </button>
    </div>
  );
}
