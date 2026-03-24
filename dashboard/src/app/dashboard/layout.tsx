import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Activity", icon: "◎" },
  { href: "/dashboard/trades", label: "Trades", icon: "⇄" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 bg-[var(--bg2)] border-r border-[var(--border)] flex flex-col">
        <div className="px-5 py-5 border-b border-[var(--border)]">
          <h1 className="text-lg font-semibold text-[var(--text)]">Weather Bot</h1>
          <p className="text-xs text-[var(--dim)] mt-0.5">Trading Dashboard</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-5 py-2.5 text-sm text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-[var(--border)] text-xs text-[var(--dim)]">
          Polymarket Weather Bot
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
