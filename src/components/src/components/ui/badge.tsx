// AvilloOS Badge Component
export default function Badge({ children, variant = "default" }) {
  const styles = {
    default: "bg-primary text-primary-foreground",
    subtle: "bg-muted text-muted-foreground",
  };
  return <span className={`px-2 py-1 rounded-md text-sm ${styles[variant]}`}>{children}</span>;
}
