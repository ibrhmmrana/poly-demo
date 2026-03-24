"""Edge calculator: compares forecast probabilities to market prices."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any

import websockets

from config.settings import settings
from data.models import (
    EdgeSignal,
    Forecast,
    Market,
    Side,
    TemperatureBracket,
)

log = logging.getLogger(__name__)


class EdgeCalculator:
    """Identifies mispriced brackets by comparing forecasts to market prices."""

    def __init__(self) -> None:
        self._ws: Any = None
        self._prices: dict[str, float] = {}  # token_id -> last price
        self._subscribed_tokens: set[str] = set()

    async def connect(self) -> None:
        """Connect to Polymarket WebSocket for real-time prices."""
        try:
            self._ws = await websockets.connect(
                settings.polymarket_ws,
                ping_interval=10,
                ping_timeout=5,
                open_timeout=20,
            )
            log.info("WebSocket connected to %s", settings.polymarket_ws)
        except Exception:
            log.exception("WebSocket connection failed")
            self._ws = None

    async def disconnect(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None

    async def subscribe(self, markets: list[Market]) -> None:
        """Subscribe to price updates for all bracket tokens in given markets."""
        token_ids = []
        for m in markets:
            for b in m.brackets:
                if b.token_id and b.token_id not in self._subscribed_tokens:
                    token_ids.append(b.token_id)
                    self._subscribed_tokens.add(b.token_id)

        if not token_ids or not self._ws:
            return

        msg = json.dumps({
            "assets_ids": token_ids,
            "type": "market",
        })
        try:
            await self._ws.send(msg)
            log.info("Subscribed to %d token price feeds", len(token_ids))
        except Exception:
            log.exception("Failed to subscribe to WebSocket")

    async def poll_prices(self, timeout: float = 0.5) -> None:
        """Read available WebSocket messages and update prices."""
        if not self._ws:
            return
        try:
            while True:
                try:
                    raw = await asyncio.wait_for(self._ws.recv(), timeout=timeout)
                    self._handle_message(raw)
                except asyncio.TimeoutError:
                    break
        except websockets.exceptions.ConnectionClosed:
            log.warning("WebSocket connection lost, will reconnect")
            self._ws = None

    def _handle_message(self, raw: str) -> None:
        """Parse a WebSocket message and update internal price state."""
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return

        # The market channel sends various event types
        event_type = msg.get("event_type") or msg.get("type", "")

        if event_type in ("book", "price_change", "last_trade_price"):
            asset_id = msg.get("asset_id", "")
            if not asset_id:
                return

            if event_type == "last_trade_price":
                price = msg.get("price")
                if price is not None:
                    self._prices[asset_id] = float(price)

            elif event_type == "book":
                # Full book snapshot — extract midpoint
                bids = msg.get("bids", [])
                asks = msg.get("asks", [])
                best_bid = float(bids[0]["price"]) if bids else 0.0
                best_ask = float(asks[0]["price"]) if asks else 1.0
                self._prices[asset_id] = (best_bid + best_ask) / 2

            elif event_type == "price_change":
                price = msg.get("price")
                if price is not None:
                    self._prices[asset_id] = float(price)

    def get_price(self, token_id: str) -> float | None:
        """Get the latest known price for a token."""
        return self._prices.get(token_id)

    def find_edges(
        self,
        markets: list[Market],
        forecasts: dict[str, Forecast],
    ) -> list[EdgeSignal]:
        """Scan all markets for actionable edge signals.

        Args:
            markets: Active temperature markets.
            forecasts: Map of cache_key -> Forecast.

        Returns:
            List of EdgeSignal for brackets exceeding the minimum edge threshold.
        """
        signals: list[EdgeSignal] = []

        for market in markets:
            cache_key = f"{market.city_slug}:{market.target_date.date()}"
            forecast = forecasts.get(cache_key)
            if not forecast or not forecast.probabilities:
                continue

            for bracket in market.brackets:
                signal = self._evaluate_bracket(market, bracket, forecast)
                if signal:
                    signals.append(signal)

        signals.sort(key=lambda s: s.edge_pct, reverse=True)
        return signals

    def _evaluate_bracket(
        self,
        market: Market,
        bracket: TemperatureBracket,
        forecast: Forecast,
    ) -> EdgeSignal | None:
        """Check if a single bracket has a tradeable edge."""
        forecast_prob = forecast.probabilities.get(bracket.label, 0.0)

        # Use WebSocket price if available, else fall back to REST price
        ws_price = self._prices.get(bracket.token_id)
        market_prob = ws_price if ws_price is not None else bracket.market_price

        if market_prob <= 0 or market_prob >= 1:
            return None

        # BUY YES if forecast prob > market price (market undervalues this bracket)
        edge_buy = (forecast_prob - market_prob) * 100  # percentage points

        # BUY NO (sell YES) if market overvalues this bracket
        edge_sell = (market_prob - forecast_prob) * 100

        if edge_buy >= settings.min_edge_pct:
            return EdgeSignal(
                market=market,
                bracket=bracket,
                forecast_prob=forecast_prob,
                market_prob=market_prob,
                edge_pct=edge_buy,
                side=Side.BUY,
                timestamp=datetime.utcnow(),
            )

        if edge_sell >= settings.min_edge_pct:
            return EdgeSignal(
                market=market,
                bracket=bracket,
                forecast_prob=forecast_prob,
                market_prob=market_prob,
                edge_pct=edge_sell,
                side=Side.SELL,
                timestamp=datetime.utcnow(),
            )

        return None
