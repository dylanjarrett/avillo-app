// AvilloOS Parallax Hero
export default function ParallaxHero() {
  return (
    <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center will-change-transform animate-parallax"></div>
      <h1 className="relative z-10 text-6xl font-semibold text-foreground drop-shadow-xl">
        Avillo: The AI Operating System for Real Estate
      </h1>
    </section>
  );
}
