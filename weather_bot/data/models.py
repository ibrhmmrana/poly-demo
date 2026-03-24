"""Data classes shared across the bot."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class TradeStatus(str, Enum):
    PENDING = "PENDING"
    FILLED = "FILLED"
    PARTIAL = "PARTIAL"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


class MarketOutcome(str, Enum):
    WIN = "WIN"
    LOSS = "LOSS"
    PENDING = "PENDING"


@dataclass
class TemperatureBracket:
    """A single bracket/outcome within a temperature market."""
    token_id: str
    label: str  # e.g. "56-57" or "15"
    low: float | None  # lower bound (inclusive), None for open-ended
    high: float | None  # upper bound (inclusive), None for open-ended
    market_price: float = 0.0  # last known price (0-1)
    best_bid: float = 0.0
    best_ask: float = 1.0


@dataclass
class Market:
    """A Polymarket temperature market (one event, multiple brackets)."""
    condition_id: str
    question: str  # raw title, e.g. "Highest temperature in NYC on March 24?"
    city_slug: str
    target_date: datetime
    end_date: datetime  # when the market resolves
    brackets: list[TemperatureBracket] = field(default_factory=list)
    active: bool = True

    @property
    def hours_to_resolution(self) -> float:
        delta = self.end_date - datetime.utcnow()
        return max(delta.total_seconds() / 3600, 0)


@dataclass
class Forecast:
    """Probability distribution from a weather forecast."""
    city_slug: str
    target_date: datetime
    fetched_at: datetime
    source: str  # "nws" | "openmeteo"
    point_forecast: float  # best-estimate high temp
    probabilities: dict[str, float]  # bracket_label -> probability (0-1)
    raw_hourly: list[float] = field(default_factory=list)  # hourly temps for the day


@dataclass
class EdgeSignal:
    """A detected edge on a specific bracket."""
    market: Market
    bracket: TemperatureBracket
    forecast_prob: float
    market_prob: float  # derived from price
    edge_pct: float  # forecast_prob - market_prob (as percentage points)
    side: Side
    suggested_size_usd: float = 0.0
    vwap: float = 0.0
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Trade:
    """A trade record (paper or live)."""
    id: str
    market_condition_id: str
    bracket_token_id: str
    bracket_label: str
    city_slug: str
    side: Side
    price: float
    size_usd: float
    size_shares: float
    forecast_prob: float
    market_prob: float
    edge_pct: float
    status: TradeStatus
    mode: str  # "paper" | "live"
    order_id: str = ""
    fill_price: float = 0.0
    pnl: float = 0.0
    outcome: MarketOutcome = MarketOutcome.PENDING
    created_at: datetime = field(default_factory=datetime.utcnow)
    resolved_at: datetime | None = None


@dataclass
class Position:
    """Aggregated open position in a bracket."""
    market_condition_id: str
    bracket_token_id: str
    bracket_label: str
    city_slug: str
    avg_price: float
    total_shares: float
    total_cost_usd: float
    current_price: float = 0.0
    unrealized_pnl: float = 0.0

    def update_pnl(self, current_price: float) -> None:
        self.current_price = current_price
        self.unrealized_pnl = (current_price - self.avg_price) * self.total_shares


@dataclass
class OrderBookLevel:
    price: float
    size: float


@dataclass
class OrderBook:
    bids: list[OrderBookLevel] = field(default_factory=list)
    asks: list[OrderBookLevel] = field(default_factory=list)

    @property
    def best_bid(self) -> float:
        return self.bids[0].price if self.bids else 0.0

    @property
    def best_ask(self) -> float:
        return self.asks[0].price if self.asks else 1.0

    @property
    def mid_price(self) -> float:
        return (self.best_bid + self.best_ask) / 2

    def total_ask_depth_usd(self) -> float:
        return sum(l.price * l.size for l in self.asks)

    def total_bid_depth_usd(self) -> float:
        return sum(l.price * l.size for l in self.bids)
