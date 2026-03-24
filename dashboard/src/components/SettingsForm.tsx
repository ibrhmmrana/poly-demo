"use client";

import { useState, useTransition } from "react";
import { updateBotSetting } from "@/app/dashboard/settings/actions";

interface SettingsFormProps {
  initialSettings: Record<string, string>;
}

type ProviderTest = {
  ok: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
};

type DiagnosticsResponse = {
  ok: boolean;
  okCount: number;
  total: number;
  testedAt: string;
  tests: {
    gamma: ProviderTest;
    clob: ProviderTest;
    openMeteo: ProviderTest;
    noaa: ProviderTest;
  };
};

export default function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [confirmLive, setConfirmLive] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagResult, setDiagResult] = useState<DiagnosticsResponse | null>(null);

  function save(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      await updateBotSetting(key, value);
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    });
  }

  const mode = settings.mode ?? "paper";
  const paused = settings.bot_paused === "true";

  function handleModeToggle() {
    if (mode === "paper") {
      setConfirmLive(true);
    } else {
      save("mode", "paper");
    }
  }

  function confirmGoLive() {
    save("mode", "live");
    setConfirmLive(false);
  }

  async function runDiagnostics() {
    try {
      setDiagLoading(true);
      setDiagError(null);
      const res = await fetch("/api/diagnostics/providers", { cache: "no-store" });
      const payload = (await res.json()) as DiagnosticsResponse | { error: string };
      if (!res.ok || !("tests" in payload)) {
        throw new Error("error" in payload ? payload.error : "Diagnostics failed");
      }
      setDiagResult(payload);
    } catch (error) {
      setDiagError(error instanceof Error ? error.message : "Diagnostics request failed");
      setDiagResult(null);
    } finally {
      setDiagLoading(false);
    }
  }

  const apiKeyHint = process.env.NEXT_PUBLIC_BOT_API_KEY_HINT ?? "••••••";

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <Section title="Trading Mode">
        <div className="flex items-center gap-4">
          <button
            onClick={handleModeToggle}
            className={`relative w-14 h-7 rounded-full transition ${
              mode === "live" ? "bg-[var(--green)]" : "bg-[var(--dim)]"
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
                mode === "live" ? "translate-x-7" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="font-semibold text-lg">
            {mode === "live" ? (
              <span className="text-[var(--green)]">LIVE</span>
            ) : (
              <span className="text-[var(--yellow)]">PAPER</span>
            )}
          </span>
          {saved === "mode" && <Saved />}
        </div>
        <p className="text-xs text-[var(--dim)] mt-2">
          {mode === "live"
            ? "Real orders are being placed on Polymarket"
            : "Simulated trading — no real orders"}
        </p>
      </Section>

      {/* Confirm modal */}
      {confirmLive && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-[var(--red)] mb-2">Switch to Live Mode?</h3>
            <p className="text-sm text-[var(--dim)] mb-5">
              This will place real orders on Polymarket using your wallet. Make sure
              your private key and risk thresholds are configured.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLive(false)}
                className="flex-1 bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] rounded-lg py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmGoLive}
                className="flex-1 bg-[var(--red)] text-white rounded-lg py-2 text-sm font-medium"
              >
                Confirm Live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause */}
      <Section title="Bot Control">
        <div className="flex items-center gap-4">
          <button
            onClick={() => save("bot_paused", paused ? "false" : "true")}
            className={`px-5 py-2 rounded-lg font-medium text-sm transition ${
              paused
                ? "bg-[var(--green)] text-black"
                : "bg-[var(--red)] text-white"
            }`}
          >
            {paused ? "Resume Bot" : "Pause Bot"}
          </button>
          <span className="text-sm text-[var(--dim)]">
            {paused ? "Bot is paused — scans still run but no trades" : "Bot is active"}
          </span>
          {saved === "bot_paused" && <Saved />}
        </div>
      </Section>

      {/* Risk */}
      <Section title="Risk Parameters">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ThresholdInput label="Min Edge %" settingKey="min_edge_pct" value={settings.min_edge_pct ?? "15"} min={5} max={50} step={1} suffix="%" onChange={save} isSaved={saved === "min_edge_pct"} />
          <ThresholdInput label="Max Position USD" settingKey="max_position_usd" value={settings.max_position_usd ?? "10"} min={1} max={100} step={1} suffix="$" onChange={save} isSaved={saved === "max_position_usd"} />
          <ThresholdInput label="Kelly Fraction" settingKey="kelly_fraction" value={settings.kelly_fraction ?? "0.25"} min={0.05} max={1} step={0.05} suffix="x" onChange={save} isSaved={saved === "kelly_fraction"} />
          <ThresholdInput label="Daily Loss Limit USD" settingKey="daily_loss_limit_usd" value={settings.daily_loss_limit_usd ?? "-20"} min={-200} max={0} step={5} suffix="$" onChange={save} isSaved={saved === "daily_loss_limit_usd"} />
          <ThresholdInput label="Min Trade USD" settingKey="min_trade_usd" value={settings.min_trade_usd ?? "0.75"} min={0.1} max={10} step={0.1} suffix="$" onChange={save} isSaved={saved === "min_trade_usd"} />
          <ThresholdInput label="Max Spread" settingKey="max_spread" value={settings.max_spread ?? "0.35"} min={0.05} max={0.9} step={0.01} suffix="" onChange={save} isSaved={saved === "max_spread"} />
          <ThresholdInput label="Top Edges Considered" settingKey="top_edges_considered" value={settings.top_edges_considered ?? "12"} min={1} max={40} step={1} suffix="" onChange={save} isSaved={saved === "top_edges_considered"} />
          <ThresholdInput label="Max Trades / Scan" settingKey="max_trades_per_scan" value={settings.max_trades_per_scan ?? "5"} min={1} max={20} step={1} suffix="" onChange={save} isSaved={saved === "max_trades_per_scan"} />
          <ThresholdInput label="Max Trades / City" settingKey="max_trades_per_city" value={settings.max_trades_per_city ?? "2"} min={1} max={10} step={1} suffix="" onChange={save} isSaved={saved === "max_trades_per_city"} />
        </div>
      </Section>

      {/* Integration */}
      <Section title="API Integration (n8n / Cron)">
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-[var(--dim)] mb-1">Endpoint</p>
            <code className="text-[var(--text)] bg-[var(--bg3)] px-3 py-1.5 rounded block">
              POST /api/bot/run
            </code>
          </div>
          <div>
            <p className="text-[var(--dim)] mb-1">Header</p>
            <code className="text-[var(--text)] bg-[var(--bg3)] px-3 py-1.5 rounded block">
              x-api-key: {apiKeyHint}
            </code>
          </div>
          <p className="text-xs text-[var(--dim)]">
            Create a workflow in n8n (or any cron service) that sends a POST request
            to the endpoint above at your desired frequency. Each call runs one full
            scan cycle: market discovery, forecast, edge detection, and trade execution.
          </p>
        </div>
      </Section>

      <Section title="API Diagnostics">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={runDiagnostics}
              disabled={diagLoading}
              className="px-4 py-2 rounded-lg bg-[var(--blue)] text-black text-sm font-semibold disabled:opacity-60"
            >
              {diagLoading ? "Running..." : "Run Provider Diagnostics"}
            </button>
            {diagResult && (
              <span
                className={`text-xs font-semibold ${
                  diagResult.ok ? "text-[var(--green)]" : "text-[var(--yellow)]"
                }`}
              >
                {diagResult.okCount}/{diagResult.total} checks passed
              </span>
            )}
          </div>

          {diagError && <p className="text-xs text-[var(--red)]">{diagError}</p>}

          {diagResult && (
            <div className="space-y-2">
              <ProviderRow label="Polymarket Gamma" result={diagResult.tests.gamma} />
              <ProviderRow label="Polymarket CLOB" result={diagResult.tests.clob} />
              <ProviderRow label="Open-Meteo" result={diagResult.tests.openMeteo} />
              <ProviderRow label="NOAA (weather.gov)" result={diagResult.tests.noaa} />
              <p className="text-xs text-[var(--dim)]">
                Last checked: {new Date(diagResult.testedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </Section>

      {isPending && (
        <p className="text-xs text-[var(--dim)] animate-pulse">Saving...</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-sm text-[var(--dim)] mb-4 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function ThresholdInput({
  label, settingKey, value, min, max, step, suffix, onChange, isSaved,
}: {
  label: string; settingKey: string; value: string;
  min: number; max: number; step: number; suffix: string;
  onChange: (key: string, value: string) => void; isSaved: boolean;
}) {
  const numVal = parseFloat(value) || 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm text-[var(--text)]">{label}</label>
        <div className="flex items-center gap-1">
          <span className="text-sm font-mono text-[var(--blue)]">
            {suffix === "$" ? `$${numVal}` : `${numVal}${suffix}`}
          </span>
          {isSaved && <Saved />}
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={numVal}
        onChange={(e) => onChange(settingKey, e.target.value)}
        className="w-full accent-[var(--blue)]"
      />
      <div className="flex justify-between text-xs text-[var(--dim)] mt-1">
        <span>{suffix === "$" ? `$${min}` : `${min}${suffix}`}</span>
        <span>{suffix === "$" ? `$${max}` : `${max}${suffix}`}</span>
      </div>
    </div>
  );
}

function Saved() {
  return <span className="text-xs text-[var(--green)] ml-2 animate-pulse">saved</span>;
}

function ProviderRow({ label, result }: { label: string; result: ProviderTest }) {
  return (
    <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
      <div>
        <p className="text-sm text-[var(--text)]">{label}</p>
        <p className="text-xs text-[var(--dim)]">{result.message}</p>
      </div>
      <div className="text-right">
        <p className={`text-xs font-semibold ${result.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {result.ok ? "OK" : "FAIL"}
        </p>
        <p className="text-xs text-[var(--dim)]">{result.latencyMs} ms</p>
      </div>
    </div>
  );
}
