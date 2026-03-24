"use client";

import { useCallback, useEffect, useState } from "react";

type BotStatus = {
  configured: boolean;
  startEnabled: boolean;
  running: boolean;
  pid: number | null;
  logPath: string | null;
  hosted?: boolean;
};

export default function BotLauncher() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/status", { credentials: "same-origin" });
      if (res.ok) {
        const data = (await res.json()) as BotStatus;
        setStatus(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  async function start() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/bot/start", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message ?? "Started.");
        await refresh();
      } else {
        setError(data.message ?? "Start failed.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/bot/stop", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message ?? "Stopped.");
        await refresh();
      } else {
        setError(data.message ?? "Stop failed.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!status) {
    return (
      <p className="text-sm text-[var(--dim)]">Loading bot status...</p>
    );
  }

  if (status.hosted) {
    return (
      <div className="text-sm text-[var(--dim)] space-y-2">
        <p>
          Bot process management is not available on cloud deployments (Vercel).
          Run the Python bot on your own server — it writes to the same Supabase
          database, so the dashboard will reflect its activity automatically.
        </p>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="text-sm text-[var(--dim)] space-y-2">
        <p>
          <strong className="text-[var(--yellow)]">WEATHER_BOT_DIR</strong> is not set in the
          dashboard <code className="text-[var(--text)]">.env.local</code>. Add the absolute path
          to your <code className="text-[var(--text)]">weather_bot</code> folder, then restart{" "}
          <code className="text-[var(--text)]">npm run dev</code>.
        </p>
      </div>
    );
  }

  if (!status.startEnabled) {
    return (
      <div className="text-sm text-[var(--dim)] space-y-2">
        <p>
          Bot start from the dashboard is disabled. Set{" "}
          <code className="text-[var(--text)]">ENABLE_DASHBOARD_BOT_START=true</code> in{" "}
          <code className="text-[var(--text)]">.env.local</code> and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 text-sm font-medium ${
            status.running ? "text-[var(--green)]" : "text-[var(--dim)]"
          }`}
        >
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              status.running ? "bg-[var(--green)] animate-pulse" : "bg-[var(--dim)]"
            }`}
          />
          {status.running ? `Running (PID ${status.pid})` : "Not running"}
        </span>

        <button
          type="button"
          onClick={start}
          disabled={loading || status.running}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--green)] text-black disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "..." : "Start bot"}
        </button>

        <button
          type="button"
          onClick={stop}
          disabled={loading || !status.running}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Stop bot
        </button>
      </div>

      {status.logPath && (
        <p className="text-xs text-[var(--dim)]">
          Log file: <code className="text-[var(--text)]">{status.logPath}</code>
        </p>
      )}

      {message && <p className="text-sm text-[var(--green)]">{message}</p>}
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <p className="text-xs text-[var(--dim)]">
        Runs <code className="text-[var(--text)]">python main.py</code> in{" "}
        <code className="text-[var(--text)]">WEATHER_BOT_DIR</code>. Use only when the dashboard
        runs on the same machine as the bot. Pause/resume trading still uses Supabase settings.
      </p>
    </div>
  );
}
