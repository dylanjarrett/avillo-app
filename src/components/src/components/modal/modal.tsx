// AvilloOS Modal Component
export default function Modal({ title, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-xl">
        <h2 className="text-2xl font-semibold text-foreground mb-4">{title}</h2>
        <div>{children}</div>
      </div>
    </div>
  );
}
