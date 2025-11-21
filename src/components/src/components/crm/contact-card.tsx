// AvilloOS Contact Card
export default function ContactCard({ name, email, phone }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-md space-y-2">
      <h3 className="text-lg font-semibold text-foreground">{name}</h3>
      <p className="text-muted-foreground text-sm">{email}</p>
      <p className="text-muted-foreground text-sm">{phone}</p>
    </div>
  );
}
