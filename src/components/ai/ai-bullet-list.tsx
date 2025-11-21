// src/components/ai/ai-bullet-list.tsx

type AIBulletListProps = {
  items?: string[];
  title?: string;
};

export default function AIBulletList({
  items,
  title = "AI-generated highlights",
}: AIBulletListProps) {
  const list =
    items && items.length
      ? items
      : [
          "Move-in ready with modern updates and natural light throughout.",
          "Ideal for busy professionals or families who value walkability.",
          "Priced competitively for the neighborhood and condition.",
        ];

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-card)] p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--brand-text)]">
          {title}
        </h2>
        <p className="text-xs text-[var(--brand-text-muted)]">
          Use these as talking points in emails, showings, or your listing
          description.
        </p>
      </div>

      <ul className="space-y-2 text-sm text-[var(--brand-text)]">
        {list.map((item, idx) => (
          <li key={idx} className="flex gap-2">
            <span className="mt-[5px] h-[6px] w-[6px] rounded-full bg-[var(--brand-accent)]" />
            <span className="text-[var(--brand-text)]">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
