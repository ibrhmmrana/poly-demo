"""Optional Telegram alerts for trade notifications."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from config.settings import settings
from data.models import EdgeSignal, Trade

log = logging.getLogger(__name__)


class TelegramAlerts:
    def __init__(self) -> None:
        self._bot: object | None = None
        self._enabled = settings.telegram_enabled

    async def initialize(self) -> bool:
        if not self._enabled:
            log.info("Telegram alerts disabled (no token/chat_id configured)")
            return False

        try:
            from telegram import Bot
            self._bot = Bot(token=settings.telegram_bot_token)
            await self._send("Weather Bot started")
            log.info("Telegram alerts initialized")
            return True
        except Exception:
            log.exception("Failed to initialize Telegram bot")
            self._enabled = False
            return False

    async def _send(self, text: str) -> None:
        if not self._bot or not self._enabled:
            return
        try:
            await self._bot.send_message(  # type: ignore[union-attr]
                chat_id=settings.telegram_chat_id,
                text=text,
                parse_mode="HTML",
            )
        except Exception:
            log.exception("Telegram send failed")

    async def notify_signal(self, signal: EdgeSignal) -> None:
        msg = (
            f"<b>Edge Detected</b>\n"
            f"City: {signal.market.city_slug}\n"
            f"Date: {signal.market.target_date.strftime('%Y-%m-%d')}\n"
            f"Bracket: {signal.bracket.label}\n"
            f"Side: {signal.side.value}\n"
            f"Forecast: {signal.forecast_prob:.1%}\n"
            f"Market: {signal.market_prob:.1%}\n"
            f"Edge: {signal.edge_pct:.1f}%\n"
            f"Suggested: ${signal.suggested_size_usd:.2f}"
        )
        await self._send(msg)

    async def notify_trade(self, trade: Trade) -> None:
        msg = (
            f"<b>Trade Executed [{trade.mode.upper()}]</b>\n"
            f"{trade.side.value} {trade.bracket_label} @ ${trade.fill_price:.3f}\n"
            f"Size: ${trade.size_usd:.2f} | Edge: {trade.edge_pct:.1f}%\n"
            f"City: {trade.city_slug}"
        )
        await self._send(msg)

    async def notify_resolution(self, trade: Trade) -> None:
        emoji = "+" if trade.pnl >= 0 else ""
        msg = (
            f"<b>Market Resolved</b>\n"
            f"{trade.bracket_label} ({trade.city_slug})\n"
            f"Outcome: {trade.outcome.value}\n"
            f"P&L: {emoji}${trade.pnl:.2f}"
        )
        await self._send(msg)

    async def notify_daily_summary(self, pnl: float, trades: int) -> None:
        sign = "+" if pnl >= 0 else ""
        msg = (
            f"<b>Daily Summary</b>\n"
            f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}\n"
            f"Trades: {trades}\n"
            f"P&L: {sign}${pnl:.2f}"
        )
        await self._send(msg)

    async def notify_error(self, error: str) -> None:
        await self._send(f"<b>Error</b>\n{error}")

    async def shutdown(self) -> None:
        await self._send("Weather Bot shutting down")
