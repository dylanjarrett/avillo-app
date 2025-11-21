// AvilloOS Profile Form
export default function ProfileForm() {
  return (
    <form className="space-y-4 bg-card p-6 rounded-xl border border-border shadow-md">
      <h2 className="text-2xl font-semibold text-foreground mb-4">Profile Settings</h2>
      <input className="w-full bg-input border border-border rounded-lg p-2 text-foreground" placeholder="Full Name" />
      <input className="w-full bg-input border border-border rounded-lg p-2 text-foreground" placeholder="Email Address" />
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:scale-[1.02] transition-all">Save</button>
    </form>
  );
}
