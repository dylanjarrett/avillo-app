// AvilloOS Item List
export default function ItemList() {
  const items = ["Task One", "Task Two", "Task Three"];

  return (
    <ul className="space-y-2">
      {items.map((i, idx) => (
        <li key={idx} className="p-3 rounded-lg bg-card border border-border text-foreground">
          {i}
        </li>
      ))}
    </ul>
  );
}
