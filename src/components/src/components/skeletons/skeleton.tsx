// AvilloOS Skeleton Loader
export default function Skeleton({ height = "20px" }) {
  return (
    <div
      className="animate-pulse bg-muted rounded-md"
      style={{ height }}
    />
  );
}
