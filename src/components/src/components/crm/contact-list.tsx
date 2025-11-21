// AvilloOS Contact List
export default function ContactList({ contacts }) {
  return (
    <div className="space-y-4">
      {contacts.map((c, idx) => (
        <div key={idx} className="p-4 bg-input rounded-lg border border-border text-foreground shadow-sm">
          <div className="font-medium">{c.name}</div>
          <div className="text-muted-foreground text-sm">{c.email}</div>
        </div>
      ))}
    </div>
  );
}
