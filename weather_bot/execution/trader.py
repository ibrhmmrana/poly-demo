"""Trade execution: paper and live modes."""

from __future__ import annotations

import logging
import uuid
from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Any

from config.settings import settings
from core.scanner import MarketScanner
from data.database import Database
from data.models import (
    EdgeSignal,
    MarketOutcome,
    OrderBook,
    Side,
    Trade,
    TradeStatus,
)
from execution.orderbook import parse_order_book

log = logging.getLogger(__name__)


class BaseTrader(ABC):
    def __init__(self, db: Database, scanner: MarketScanner) -> None:
        self._db = db
        self._scanner = scanner

    @abstractmethod
    async def execute(self, signal: EdgeSignal, size_usd: float,
                      book: OrderBook) -> Trade | None:
        ...

    async def check_resolutions(self) -> list[Trade]:
        """Check open trades for resolution and update P&L."""
        open_trades = self._db.get_open_trades()
        resolved: list[Trade] = []

        for trade in open_trades:
            market_data = await self._scanner.fetch_market_prices(
                trade.market_condition_id
            )
            if not market_data:
                continue

            # Check if the market has resolved
            closed = market_data.get("closed", False)
            if not closed:
                continue

            outcome_prices_raw = market_data.get("outcomePrices", "[]")
            try:
                prices = (
                    outcome_prices_raw
                    if isinstance(outcome_prices_raw, list)
                    else __import__("json").loads(outcome_prices_raw)
                )
            except Exception:
                continue

            resolution_price = float(prices[0]) if prices else 0.0

            if trade.side == Side.BUY:
                pnl = (resolution_price - trade.fill_price) * trade.size_shares
                won = resolution_price > trade.fill_price
            else:
                pnl = (trade.fill_price - resolution_price) * trade.size_shares
                won = resolution_price < trade.fill_price

            outcome = MarketOutcome.WIN if won else MarketOutcome.LOSS
            self._db.resolve_trade(trade.id, outcome, pnl)
            self._db.update_daily_pnl(date.today(), pnl, 0)

            trade.pnl = pnl
            trade.outcome = outcome
            resolved.append(trade)

            log.info(
                "%s trade %s resolved: %s (PnL: $%.2f)",
                trade.mode.upper(), trade.id[:8], outcome.value, pnl,
            )

        return resolved


class PaperTrader(BaseTrader):
    """Simulates trades at the current best ask/bid price."""

    async def execute(self, signal: EdgeSignal, size_usd: float,
                      book: OrderBook) -> Trade | None:
        if size_usd <= 0:
            return None

        if signal.side == Side.BUY:
            fill_price = book.best_ask if book.asks else signal.market_prob
        else:
            fill_price = book.best_bid if book.bids else signal.market_prob

        if fill_price <= 0:
            return None

        size_shares = size_usd / fill_price

        trade = Trade(
            id=str(uuid.uuid4()),
            market_condition_id=signal.market.condition_id,
            bracket_token_id=signal.bracket.token_id,
            bracket_label=signal.bracket.label,
            city_slug=signal.market.city_slug,
            side=signal.side,
            price=signal.market_prob,
            size_usd=size_usd,
            size_shares=size_shares,
            forecast_prob=signal.forecast_prob,
            market_prob=signal.market_prob,
            edge_pct=signal.edge_pct,
            status=TradeStatus.FILLED,
            mode="paper",
            fill_price=fill_price,
            created_at=datetime.utcnow(),
        )

        self._db.insert_trade(trade)
        log.info(
            "[PAPER] %s %s @ $%.3f | size $%.2f | edge %.1f%% | %s %s",
            signal.side.value, signal.bracket.label, fill_price,
            size_usd, signal.edge_pct, signal.market.city_slug,
            signal.market.target_date.strftime("%m/%d"),
        )

        return trade


class LiveTrader(BaseTrader):
    """Executes real trades via the Polymarket CLOB API."""

    def __init__(self, db: Database, scanner: MarketScanner) -> None:
        super().__init__(db, scanner)
        self._clob_client: Any = None

    async def initialize(self) -> bool:
        """Initialize the authenticated CLOB client."""
        if not settings.polymarket_private_key:
            log.error("POLYMARKET_PRIVATE_KEY not set — cannot trade live")
            return False

        try:
            from py_clob_client.client import ClobClient

            pk = (settings.polymarket_private_key or "").strip()
            if pk.startswith(("0x", "0X")):
                pk = pk[2:]

            self._clob_client = ClobClient(
                settings.polymarket_host,
                key=pk,
                chain_id=settings.chain_id,
            )
            self._clob_client.set_api_creds(
                self._clob_client.create_or_derive_api_creds()
            )
            log.info("Live CLOB client initialized")
            return True
        except Exception:
            log.exception("Failed to initialize CLOB client")
            return False

    async def execute(self, signal: EdgeSignal, size_usd: float,
                      book: OrderBook) -> Trade | None:
        if size_usd <= 0 or not self._clob_client:
            return None

        trade_id = str(uuid.uuid4())

        try:
            from py_clob_client.order_builder.constants import BUY, SELL

            side = BUY if signal.side == Side.BUY else SELL

            if signal.side == Side.BUY:
                price = book.best_ask if book.asks else signal.market_prob
            else:
                price = book.best_bid if book.bids else signal.market_prob

            if price <= 0:
                return None

            size_shares = size_usd / price

            order_args = {
                "token_id": signal.bracket.token_id,
                "price": round(price, 4),
                "size": round(size_shares, 2),
                "side": side,
            }

            signed_order = self._clob_client.create_and_sign_order(order_args)
            resp = self._clob_client.post_order(signed_order)

            order_id = ""
            if isinstance(resp, dict):
                order_id = resp.get("orderID", resp.get("id", ""))
                if resp.get("status") == "matched" or resp.get("success"):
                    status = TradeStatus.FILLED
                    fill_price = float(resp.get("matchedPrice", price))
                else:
                    status = TradeStatus.PENDING
                    fill_price = price
            else:
                status = TradeStatus.PENDING
                fill_price = price

            trade = Trade(
                id=trade_id,
                market_condition_id=signal.market.condition_id,
                bracket_token_id=signal.bracket.token_id,
                bracket_label=signal.bracket.label,
                city_slug=signal.market.city_slug,
                side=signal.side,
                price=signal.market_prob,
                size_usd=size_usd,
                size_shares=size_shares,
                forecast_prob=signal.forecast_prob,
                market_prob=signal.market_prob,
                edge_pct=signal.edge_pct,
                status=status,
                mode="live",
                order_id=order_id,
                fill_price=fill_price,
                created_at=datetime.utcnow(),
            )

            self._db.insert_trade(trade)
            log.info(
                "[LIVE] %s %s @ $%.3f | size $%.2f | edge %.1f%% | %s %s | order %s",
                signal.side.value, signal.bracket.label, fill_price,
                size_usd, signal.edge_pct, signal.market.city_slug,
                signal.market.target_date.strftime("%m/%d"), order_id[:8],
            )

            return trade

        except Exception:
            log.exception("Live order execution failed")

            trade = Trade(
                id=trade_id,
                market_condition_id=signal.market.condition_id,
                bracket_token_id=signal.bracket.token_id,
                bracket_label=signal.bracket.label,
                city_slug=signal.market.city_slug,
                side=signal.side,
                price=signal.market_prob,
                size_usd=size_usd,
                size_shares=0,
                forecast_prob=signal.forecast_prob,
                market_prob=signal.market_prob,
                edge_pct=signal.edge_pct,
                status=TradeStatus.REJECTED,
                mode="live",
                created_at=datetime.utcnow(),
            )
            self._db.insert_trade(trade)
            return None
