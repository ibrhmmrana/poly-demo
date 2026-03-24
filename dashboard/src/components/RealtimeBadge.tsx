"use client";

export default function RealtimeBadge({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          connected ? "bg-[var(--green)] animate-pulse" : "bg-[var(--red)]"
        }`}
      />
      <span className="text-[var(--dim)]">
        {connected ? "Live" : "Connecting..."}
      </span>
    </div>
  );
}
