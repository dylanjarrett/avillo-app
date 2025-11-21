// AvilloOS Onboarding Progress
export default function OnboardingProgress({ current, total }) {
  return (
    <div className="w-full bg-input border border-border rounded-lg h-3">
      <div
        className="bg-primary h-3 rounded-lg transition-all"
        style={{ width: `${(current / total) * 100}%` }}
      ></div>
    </div>
  );
}
