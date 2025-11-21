// AvilloOS Welcome Screen
export default function WelcomeScreen() {
  return (
    <div className="p-10 bg-card border border-border rounded-2xl text-center space-y-4 shadow-lg">
      <h1 className="text-4xl font-bold text-foreground">Welcome to Avillo</h1>
      <p className="text-muted-foreground text-lg">
        Let’s set up your workspace and get you producing elite-level results.
      </p>
    </div>
  );
}
