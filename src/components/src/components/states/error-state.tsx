// AvilloOS Error State
export default function ErrorState({ message }) {
  return (
    <div className="p-10 text-center bg-card border border-border rounded-xl shadow-md space-y-3">
      <h2 className="text-2xl font-bold text-foreground">Something went wrong</h2>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
