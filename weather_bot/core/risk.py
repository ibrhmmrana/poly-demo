"""Risk engine: Kelly sizing, VWAP checks, position limits, daily loss guard."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from config.settings import settings
from data.database import Database
from data.models import EdgeSignal, OrderBook, Side
from execution.orderbook import (
    available_liquidity_usd,
    calculate_vwap_buy,
    calculate_vwap_sell,
)

log = logging.getLogger(__name__)


class RiskEngine:
    def __init__(self, db: Database) -> None:
        self._db = db
        self._daily_pnl: float = 0.0
        self._daily_trades: int = 0
        self._position_by_token: dict[str, float] = {}  # token_id -> USD held

    def refresh_daily(self) -> None:
        """Reload today's P&L from the database."""
        self._daily_pnl, self._daily_trades = self._db.get_today_pnl()

    def record_trade_pnl(self, pnl: float) -> None:
        self._daily_pnl += pnl
        self._daily_trades += 1

    def track_position(self, token_id: str, usd: float) -> None:
        current = self._position_by_token.get(token_id, 0.0)
        self._position_by_token[token_id] = current + usd

    def check_daily_limit(self) -> bool:
        """Return True if still within daily loss limit."""
        if self._daily_pnl <= settings.daily_loss_limit_usd:
            log.warning("Daily loss limit hit: $%.2f", self._daily_pnl)
            return False
        return True

    def size_trade(self, signal: EdgeSignal, book: OrderBook) -> float:
        """Calculate position size in USD using fractional Kelly criterion.

        Returns 0 if the trade should be skipped.
        """
        if not self.check_daily_limit():
            return 0.0

        # Kelly sizing
        p = signal.forecast_prob
        q = 1 - p

        if signal.side == Side.BUY:
            market_price = signal.market_prob
            if market_price <= 0 or market_price >= 1:
                return 0.0
            # Odds: if we buy at `market_price`, we win (1 - market_price)
            b = (1 - market_price) / market_price
        else:
            market_price = signal.market_prob
            if market_price <= 0 or market_price >= 1:
                return 0.0
            # Selling YES = buying NO at (1 - market_price)
            b = market_price / (1 - market_price)
            p, q = q, p  # flip for the NO side

        if b <= 0:
            return 0.0

        kelly = (b * p - q) / b
        if kelly <= 0:
            return 0.0

        # Fractional Kelly
        raw_size = kelly * settings.kelly_fraction * settings.max_position_usd

        # Cap at max position
        raw_size = min(raw_size, settings.max_position_usd)

        # Cap at liquidity fraction
        liq = available_liquidity_usd(book, signal.side.value)
        max_liq = liq * settings.max_liquidity_take
        raw_size = min(raw_size, max_liq)

        # Minimum book depth check
        if liq < settings.min_book_depth_usd:
            log.debug("Skipping %s: book depth $%.2f < $%.2f min",
                      signal.bracket.label, liq, settings.min_book_depth_usd)
            return 0.0

        # Existing position check
        existing = self._position_by_token.get(signal.bracket.token_id, 0.0)
        if existing + raw_size > settings.max_position_usd:
            raw_size = max(settings.max_position_usd - existing, 0)

        # VWAP check
        if raw_size > 0:
            if signal.side == Side.BUY:
                vwap = calculate_vwap_buy(book, raw_size)
            else:
                shares_est = raw_size / signal.market_prob if signal.market_prob > 0 else 0
                vwap = calculate_vwap_sell(book, shares_est)

            if vwap is not None:
                signal.vwap = vwap
                # If VWAP erodes the edge below threshold, skip
                if signal.side == Side.BUY:
                    effective_edge = (signal.forecast_prob - vwap) * 100
                else:
                    effective_edge = (vwap - signal.forecast_prob) * 100

                if effective_edge < settings.min_edge_pct * 0.5:
                    log.debug("Skipping %s: VWAP erodes edge to %.1f%%",
                              signal.bracket.label, effective_edge)
                    return 0.0
            else:
                log.debug("Skipping %s: insufficient liquidity for VWAP",
                          signal.bracket.label)
                return 0.0

        signal.suggested_size_usd = round(raw_size, 2)
        return round(raw_size, 2)
