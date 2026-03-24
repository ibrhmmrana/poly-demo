# Polymarket Weather Trading Bot

Automated bot that trades temperature prediction markets on Polymarket by comparing official weather forecasts (NOAA NWS, Open-Meteo) against market prices.

## How It Works

1. **Scans** Polymarket for active "Highest temperature in [City] on [Date]?" markets
2. **Fetches** hourly forecasts from NWS (US cities) and Open-Meteo (London)
3. **Builds** a probability distribution across temperature brackets using the forecast + uncertainty model
4. **Compares** forecast probabilities to market prices via real-time WebSocket feed
5. **Sizes** trades using fractional Kelly criterion with VWAP and liquidity checks
6. **Executes** in paper mode (simulated) or live mode (real orders)

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Copy and edit config
copy .env.example .env
# Edit .env with your settings (paper mode requires no keys)

# Run in paper mode
python main.py
```

## Configuration

Edit `.env` to set:

- `MODE=paper` or `MODE=live`
- `MIN_EDGE_PERCENT` — minimum edge to trade (default: 15%)
- `MAX_POSITION_USD` — max per-position size (default: $10)
- `KELLY_FRACTION` — Kelly multiplier (default: 0.25 = quarter Kelly)

For live trading, set `POLYMARKET_PRIVATE_KEY` to your **wallet private key** as **64 hex characters** (optional `0x` prefix). This is **not** a Polymarket website password or API passphrase.

### Verify your setup (no orders placed)

```bash
python health_check.py
```

This loads `.env`, checks the database, Gamma API, NWS forecast sample, WebSocket, CLOB auth (if `MODE=live`), and Telegram (if configured).

### Web dashboard

```bash
python dashboard.py
```

Open `http://localhost:8050` (stop duplicate old processes if the port is stuck).

### Next.js dashboard (Supabase)

The repo root `dashboard/` app can **start this bot on the same PC**: set `WEATHER_BOT_DIR` to this folder, `ENABLE_DASHBOARD_BOT_START=true`, and use **Settings → Run bot (this PC)**. Output is appended to `data/bot_dashboard.log`. Pause/live mode still come from Supabase `bot_settings`.

## Supported Cities

| City    | Source    | Station | Unit |
|---------|-----------|---------|------|
| NYC     | NWS       | KLGA    | F    |
| Chicago | NWS       | KORD    | F    |
| Dallas  | NWS       | KDAL    | F    |
| Miami   | NWS       | KMIA    | F    |
| Seattle | NWS       | KSEA    | F    |
| Atlanta | NWS       | KATL    | F    |
| London  | Open-Meteo| EGLC    | C    |

## Project Structure

```
weather_bot/
  config/settings.py     — Configuration from .env
  config/cities.py       — City definitions (lat/lon, stations)
  core/scanner.py        — Market discovery via Gamma API
  core/forecast.py       — Weather data + probability distributions
  core/edge.py           — Edge detection (forecast vs market)
  core/risk.py           — Kelly sizing + risk guards
  execution/trader.py    — Paper and live trade execution
  execution/orderbook.py — Order book parsing + VWAP
  data/models.py         — Data classes
  data/database.py       — SQLite persistence
  interface/dashboard.py — Rich CLI dashboard
  interface/alerts.py    — Telegram notifications (optional)
  main.py                — Entry point
  dashboard.py           — Web dashboard (Chart.js)
  health_check.py        — Integration checks (no orders)
```
