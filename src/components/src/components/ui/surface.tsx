// AvilloOS Surface Component
export default function Surface({ children, level = 1 }) {
  const shadows = {
    0: "shadow-none",
    1: "shadow-sm",
    2: "shadow-md",
    3: "shadow-lg",
    4: "shadow-xl",
  };
  return (
    <div className={`rounded-xl bg-card border border-border p-4 ${shadows[level]}`}>
      {children}
    </div>
  );
}
