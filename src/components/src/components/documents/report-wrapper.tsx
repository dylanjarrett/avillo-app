// AvilloOS Report Wrapper
export default function ReportWrapper({ title, children }) {
  return (
    <div className="p-6 bg-card border border-border rounded-xl shadow-lg space-y-4">
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}
