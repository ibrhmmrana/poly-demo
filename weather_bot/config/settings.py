from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)


def _float(key: str, default: float) -> float:
    return float(os.getenv(key, str(default)))


def _int(key: str, default: int) -> int:
    return int(os.getenv(key, str(default)))


@dataclass(frozen=True)
class Settings:
    # ── mode ──────────────────────────────────────────────────────────
    mode: str = os.getenv("MODE", "paper")  # "paper" | "live"

    # ── polymarket ────────────────────────────────────────────────────
    polymarket_host: str = "https://clob.polymarket.com"
    polymarket_ws: str = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
    polymarket_private_key: str = os.getenv("POLYMARKET_PRIVATE_KEY", "")
    chain_id: int = _int("POLYMARKET_CHAIN_ID", 137)

    # ── edge / risk thresholds ────────────────────────────────────────
    min_edge_pct: float = _float("MIN_EDGE_PERCENT", 15.0)
    max_position_usd: float = _float("MAX_POSITION_USD", 10.0)
    kelly_fraction: float = _float("KELLY_FRACTION", 0.25)
    max_liquidity_take: float = _float("MAX_LIQUIDITY_TAKE", 0.30)
    min_hours_to_resolution: float = _float("MIN_HOURS_TO_RESOLUTION", 2.0)
    max_hours_to_resolution: float = _float("MAX_HOURS_TO_RESOLUTION", 72.0)
    daily_loss_limit_usd: float = _float("DAILY_LOSS_LIMIT_USD", -20.0)
    min_book_depth_usd: float = _float("MIN_BOOK_DEPTH_USD", 50.0)

    # ── scanning ──────────────────────────────────────────────────────
    scan_interval_sec: int = _int("SCAN_INTERVAL_SEC", 300)
    forecast_poll_sec: int = _int("FORECAST_POLL_SEC", 60)

    # ── telegram (optional) ───────────────────────────────────────────
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # ── NWS ───────────────────────────────────────────────────────────
    nws_user_agent: str = os.getenv("NWS_USER_AGENT", "WeatherBot (bot@example.com)")

    # ── supabase ──────────────────────────────────────────────────────
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_key: str = os.getenv("SUPABASE_SERVICE_KEY", "")

    # ── legacy sqlite (kept as fallback) ──────────────────────────────
    db_path: str = str(Path(__file__).resolve().parent.parent / "data" / "trades.db")

    @property
    def is_live(self) -> bool:
        return self.mode == "live"

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_key)

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token and self.telegram_chat_id)


settings = Settings()
