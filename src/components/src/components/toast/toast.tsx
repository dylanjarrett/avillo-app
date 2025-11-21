// AvilloOS Toast Notification
export default function Toast({ message }) {
  return (
    <div className="fixed bottom-6 right-6 bg-card border border-border p-4 rounded-xl shadow-lg text-foreground">
      {message}
    </div>
  );
}
