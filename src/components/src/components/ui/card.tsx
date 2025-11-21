// AvilloOS Card Component
export default function Card({ children }) {
  return (
    <div className="rounded-xl bg-card border border-border p-6 shadow-sm transition-transform duration-300 hover:shadow-xl hover:-translate-y-0.5">
      {children}
    </div>
  );
}
