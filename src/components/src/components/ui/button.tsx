// AvilloOS Button Component
export default function Button({ children, variant = "primary" }) {
  const base = "px-4 py-2 rounded-lg font-medium transition-all duration-200";
  const styles = {
    primary: "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.97]",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "bg-transparent hover:bg-foreground/5",
  };
  return <button className={`${base} ${styles[variant]}`}>{children}</button>;
}
