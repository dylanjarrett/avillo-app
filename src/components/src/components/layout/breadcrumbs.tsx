// AvilloOS Breadcrumbs
export default function Breadcrumbs({ items }) {
  return (
    <nav className="text-sm text-muted-foreground mb-4">
      {items.map((item, idx) => (
        <span key={idx}>
          {item}
          {idx < items.length - 1 && " / "}
        </span>
      ))}
    </nav>
  );
}
