"use client";

interface Props {
  mode: string;
  lastScanAt: string | null;
  scansToday: number;
  connected: boolean;
}

export default function StatusBar({ mode, lastScanAt, scansToday, connected }: Props) {
  const ago = lastScanAt
    ? formatAgo(new Date(lastScanAt))
    : "never";

  return (
    <div className="flex items-center justify-between bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-4">
        <span
          className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
            mode === "live"
              ? "bg-[var(--green)] text-black"
              : "bg-[var(--yellow)] text-black"
          }`}
        >
          {mode}
        </span>
        <span className="text-sm text-[var(--dim)]">
          Last scan: <span className="text-[var(--text)]">{ago}</span>
        </span>
        <span className="text-sm text-[var(--dim)]">
          Today: <span className="text-[var(--text)]">{scansToday}</span> scans
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-[var(--green)] animate-pulse" : "bg-[var(--dim)]"
          }`}
        />
        <span className="text-xs text-[var(--dim)]">
          {connected ? "Live" : "Offline"}
        </span>
      </div>
    </div>
  );
}

function formatAgo(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
