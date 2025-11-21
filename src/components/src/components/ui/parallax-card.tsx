// AvilloOS Parallax Card
export default function ParallaxCard({ children }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card shadow-lg transition-transform duration-500 hover:-translate-y-1 hover:shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/0 opacity-20 pointer-events-none"></div>
      <div className="p-8">{children}</div>
    </div>
  );
}
