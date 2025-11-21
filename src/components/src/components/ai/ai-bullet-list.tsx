// AvilloOS AI Bullet List
export default function AIBulletList({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li
          key={idx}
          className="p-3 bg-input border border-border rounded-lg text-foreground shadow-sm"
        >
          • {item}
        </li>
      ))}
    </ul>
  );
}
