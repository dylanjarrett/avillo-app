// AvilloOS Page Header
export default function PageHeader({ title, description }) {
  return (
    <div className="mb-8">
      <h1 className="text-4xl font-bold text-foreground">{title}</h1>
      {description && (
        <p className="text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
}
