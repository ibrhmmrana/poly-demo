/**
 * Spawn / track the Python weather bot from the Next.js server (local use).
 * Server-only — do not import from client components.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const PID_FILENAME = "dashboard_bot.pid";
const LOG_FILENAME = "bot_dashboard.log";

export function getBotPaths() {
  const botDir = (process.env.WEATHER_BOT_DIR ?? "").trim();
  const pythonExe = (process.env.PYTHON_EXECUTABLE ?? "python").trim() || "python";
  const dataDir = botDir ? path.join(botDir, "data") : "";
  const pidPath = dataDir ? path.join(dataDir, PID_FILENAME) : "";
  const logPath = dataDir ? path.join(dataDir, LOG_FILENAME) : "";
  return { botDir, pythonExe, dataDir, pidPath, logPath };
}

export function isDashboardBotStartEnabled(): boolean {
  const v = (process.env.ENABLE_DASHBOARD_BOT_START ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function readPid(pidPath: string): number | null {
  try {
    const raw = fs.readFileSync(pidPath, "utf8").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writePid(pidPath: string, pid: number) {
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  fs.writeFileSync(pidPath, String(pid), "utf8");
}

function clearPid(pidPath: string) {
  try {
    fs.unlinkSync(pidPath);
  } catch {
    /* ignore */
  }
}

/** Best-effort: process still exists (Node works on Windows for same-session PIDs). */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type BotStatus = {
  configured: boolean;
  startEnabled: boolean;
  running: boolean;
  pid: number | null;
  logPath: string | null;
};

export function getBotStatus(): BotStatus {
  const { botDir, pidPath, logPath } = getBotPaths();
  const startEnabled = isDashboardBotStartEnabled();

  if (!botDir || !pidPath) {
    return {
      configured: false,
      startEnabled,
      running: false,
      pid: null,
      logPath: null,
    };
  }

  const pid = readPid(pidPath);
  if (pid !== null && !isProcessAlive(pid)) {
    clearPid(pidPath);
  }

  const finalPid = readPid(pidPath);
  const running = finalPid !== null && isProcessAlive(finalPid);

  return {
    configured: true,
    startEnabled,
    running,
    pid: running ? finalPid : null,
    logPath: fs.existsSync(botDir) ? logPath : null,
  };
}

export type StartResult =
  | { ok: true; pid: number; message: string }
  | { ok: false; message: string };

export function startBotProcess(): StartResult {
  if (!isDashboardBotStartEnabled()) {
    return {
      ok: false,
      message:
        "Dashboard bot start is disabled. Set ENABLE_DASHBOARD_BOT_START=true in dashboard .env.local.",
    };
  }

  const { botDir, pythonExe, pidPath, logPath } = getBotPaths();

  if (!botDir) {
    return {
      ok: false,
      message: "WEATHER_BOT_DIR is not set in dashboard .env.local (absolute path to weather_bot).",
    };
  }

  const mainPy = path.join(botDir, "main.py");
  if (!fs.existsSync(mainPy)) {
    return { ok: false, message: `main.py not found under ${botDir}` };
  }

  const status = getBotStatus();
  if (status.running && status.pid) {
    return { ok: false, message: `Bot already running (PID ${status.pid}).` };
  }

  fs.mkdirSync(path.dirname(pidPath), { recursive: true });

  let outFd: number;
  let errFd: number;
  try {
    outFd = fs.openSync(logPath, "a");
    errFd = fs.openSync(logPath, "a");
  } catch {
    return { ok: false, message: `Cannot open log file: ${logPath}` };
  }

  const stamp = new Date().toISOString();
  fs.writeSync(outFd, `\n\n--- dashboard start ${stamp} ---\n`);

  try {
    const child = spawn(pythonExe, ["main.py"], {
      cwd: botDir,
      detached: true,
      stdio: ["ignore", outFd, errFd],
      windowsHide: true,
      env: { ...process.env },
    });

    child.unref();
    fs.closeSync(outFd);
    fs.closeSync(errFd);

    if (!child.pid) {
      return { ok: false, message: "Failed to spawn process (no PID)." };
    }

    writePid(pidPath, child.pid);
    return {
      ok: true,
      pid: child.pid,
      message: `Started bot (PID ${child.pid}). Logs: ${LOG_FILENAME}`,
    };
  } catch (e) {
    try {
      fs.closeSync(outFd);
    } catch {
      /* ignore */
    }
    try {
      fs.closeSync(errFd);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Spawn failed: ${msg}` };
  }
}

export type StopResult = { ok: true; message: string } | { ok: false; message: string };

export function stopBotProcess(): StopResult {
  const { pidPath } = getBotPaths();
  if (!pidPath) {
    return { ok: false, message: "WEATHER_BOT_DIR not set." };
  }

  const pid = readPid(pidPath);
  if (pid === null) {
    return { ok: false, message: "No bot PID on file (not started from dashboard)." };
  }

  if (!isProcessAlive(pid)) {
    clearPid(pidPath);
    return { ok: false, message: "Process was not running (cleared stale PID)." };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `Could not stop PID ${pid}: ${msg}` };
    }
  }

  clearPid(pidPath);
  return { ok: true, message: `Stop signal sent to PID ${pid}.` };
}
