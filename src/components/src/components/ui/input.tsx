// AvilloOS Input Component
export default function Input(props) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
    />
  );
}
