// AvilloOS Property Image Gallery
export default function PropertyGallery() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={idx}
          className="h-32 bg-input border border-border rounded-lg"
        ></div>
      ))}
    </div>
  );
}
