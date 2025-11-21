// AvilloOS Calendar Grid
export default function CalendarGrid() {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 text-center text-muted-foreground">
        {days.map((d, idx) => <div key={idx}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({length: 30}).map((_, i) => (
          <div key={i} className="h-16 bg-card border border-border rounded-lg flex items-center justify-center text-foreground hover:bg-muted cursor-pointer">
            {i+1}
          </div>
        ))}
      </div>
    </div>
  );
}
