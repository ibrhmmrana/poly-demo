"use client";

import { useState, useTransition } from "react";
import { updateBotSetting } from "@/app/dashboard/settings/actions";
import BotLauncher from "@/components/BotLauncher";

interface SettingsFormProps {
  initialSettings: Record<string, string>;
}

export default function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [confirmLive, setConfirmLive] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

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

      {/* Start/stop process on this machine */}
      <Section title="Run bot (this PC)">
        <BotLauncher />
      </Section>

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
            {paused ? "Bot is paused — scanning continues but no trades" : "Bot is running"}
          </span>
          {saved === "bot_paused" && <Saved />}
        </div>
      </Section>

      {/* Threshold sliders */}
      <Section title="Risk Parameters">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ThresholdInput
            label="Min Edge %"
            settingKey="min_edge_pct"
            value={settings.min_edge_pct ?? "15"}
            min={5}
            max={50}
            step={1}
            suffix="%"
            onChange={save}
            isSaved={saved === "min_edge_pct"}
          />
          <ThresholdInput
            label="Max Position USD"
            settingKey="max_position_usd"
            value={settings.max_position_usd ?? "10"}
            min={1}
            max={100}
            step={1}
            suffix="$"
            onChange={save}
            isSaved={saved === "max_position_usd"}
          />
          <ThresholdInput
            label="Kelly Fraction"
            settingKey="kelly_fraction"
            value={settings.kelly_fraction ?? "0.25"}
            min={0.05}
            max={1}
            step={0.05}
            suffix="x"
            onChange={save}
            isSaved={saved === "kelly_fraction"}
          />
          <ThresholdInput
            label="Daily Loss Limit USD"
            settingKey="daily_loss_limit_usd"
            value={settings.daily_loss_limit_usd ?? "-20"}
            min={-200}
            max={0}
            step={5}
            suffix="$"
            onChange={save}
            isSaved={saved === "daily_loss_limit_usd"}
          />
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
  label,
  settingKey,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  isSaved,
}: {
  label: string;
  settingKey: string;
  value: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (key: string, value: string) => void;
  isSaved: boolean;
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
        type="range"
        min={min}
        max={max}
        step={step}
        value={numVal}
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
  return (
    <span className="text-xs text-[var(--green)] ml-2 animate-pulse">saved</span>
  );
}
