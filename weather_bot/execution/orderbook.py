"""Order book parsing and VWAP calculation."""

from __future__ import annotations

import logging
from typing import Any

from data.models import OrderBook, OrderBookLevel

log = logging.getLogger(__name__)


def parse_order_book(raw: dict[str, Any]) -> OrderBook:
    """Parse raw CLOB order book response into an OrderBook model."""
    bids = [
        OrderBookLevel(price=float(level["price"]), size=float(level["size"]))
        for level in raw.get("bids", [])
    ]
    asks = [
        OrderBookLevel(price=float(level["price"]), size=float(level["size"]))
        for level in raw.get("asks", [])
    ]
    bids.sort(key=lambda l: l.price, reverse=True)
    asks.sort(key=lambda l: l.price)
    return OrderBook(bids=bids, asks=asks)


def calculate_vwap_buy(book: OrderBook, size_usd: float) -> float | None:
    """Walk ask side to calculate VWAP for buying `size_usd` worth of shares.

    Returns the VWAP price, or None if insufficient liquidity.
    """
    if not book.asks:
        return None

    remaining = size_usd
    total_shares = 0.0
    total_cost = 0.0

    for level in book.asks:
        level_value = level.price * level.size
        if level_value >= remaining:
            shares_at_level = remaining / level.price
            total_shares += shares_at_level
            total_cost += remaining
            remaining = 0
            break
        else:
            total_shares += level.size
            total_cost += level_value
            remaining -= level_value

    if remaining > 0:
        return None  # insufficient liquidity

    return total_cost / total_shares if total_shares > 0 else None


def calculate_vwap_sell(book: OrderBook, size_shares: float) -> float | None:
    """Walk bid side to calculate VWAP for selling `size_shares` shares.

    Returns the VWAP price, or None if insufficient liquidity.
    """
    if not book.bids:
        return None

    remaining = size_shares
    total_shares = 0.0
    total_revenue = 0.0

    for level in book.bids:
        if level.size >= remaining:
            total_shares += remaining
            total_revenue += remaining * level.price
            remaining = 0
            break
        else:
            total_shares += level.size
            total_revenue += level.size * level.price
            remaining -= level.size

    if remaining > 0:
        return None

    return total_revenue / total_shares if total_shares > 0 else None


def available_liquidity_usd(book: OrderBook, side: str) -> float:
    """Total available liquidity in USD on one side of the book."""
    if side == "BUY":
        return sum(l.price * l.size for l in book.asks)
    return sum(l.price * l.size for l in book.bids)
