// AvilloOS Password Form
export default function PasswordForm() {
  return (
    <form className="space-y-4 bg-card p-6 rounded-xl border border-border shadow-md">
      <h2 className="text-xl font-semibold text-foreground mb-4">Change Password</h2>
      <input className="w-full bg-input border border-border rounded-lg p-2 text-foreground" placeholder="Current Password" type="password" />
      <input className="w-full bg-input border border-border rounded-lg p-2 text-foreground" placeholder="New Password" type="password" />
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:scale-[1.02] transition-all">Update</button>
    </form>
  );
}
