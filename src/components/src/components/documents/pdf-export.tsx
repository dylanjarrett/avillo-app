// AvilloOS PDF Export Placeholder
export default function PDFExport({ content }) {
  return (
    <div className="p-4 bg-card border border-border rounded-xl text-foreground">
      <p className="mb-2">PDF Export Module</p>
      <pre className="text-muted-foreground text-sm whitespace-pre-wrap">{content}</pre>
    </div>
  );
}
