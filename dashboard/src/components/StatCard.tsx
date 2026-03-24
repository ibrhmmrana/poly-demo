interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "neutral";
}

export default function StatCard({ label, value, sub, color = "neutral" }: StatCardProps) {
  const colorClass =
    color === "green"
      ? "text-[var(--green)]"
      : color === "red"
        ? "text-[var(--red)]"
        : "text-[var(--text)]";

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--dim)]">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--dim)] mt-1">{sub}</div>}
    </div>
  );
}
