// AvilloOS Task Item
export default function TaskItem({ title, done }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl shadow-sm">
      <input type="checkbox" defaultChecked={done} />
      <span className={done ? "line-through text-muted-foreground" : "text-foreground"}>
        {title}
      </span>
    </div>
  );
}
