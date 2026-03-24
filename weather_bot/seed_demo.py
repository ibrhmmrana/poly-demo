"""Seed the database with realistic demo trades for dashboard testing.

Run: python seed_demo.py
Then: python dashboard.py
"""

from __future__ import annotations

import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config.settings import settings
from data.database import Database
from data.models import Trade, TradeStatus, Side, MarketOutcome

db = Database(settings.db_path)

CITIES = ["nyc", "chicago", "london", "dallas", "miami", "seattle", "atlanta"]
BRACKETS_F = ["52-53", "54-55", "56-57", "58-59", "60-61", "62-63", "64-65",
              "66-67", "68-69", "70-71", "72-73", "74-75", "76-77"]
BRACKETS_C = ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]

random.seed(42)

now = datetime.utcnow()
trades_created = 0

for day_offset in range(14, 0, -1):
    n_trades = random.randint(3, 8)
    for _ in range(n_trades):
        city = random.choice(CITIES)
        brackets = BRACKETS_C if city == "london" else BRACKETS_F
        bracket = random.choice(brackets)
        side = random.choice([Side.BUY, Side.SELL])

        forecast_prob = round(random.uniform(0.15, 0.55), 3)
        if side == Side.BUY:
            market_prob = round(forecast_prob - random.uniform(0.05, 0.25), 3)
            market_prob = max(market_prob, 0.02)
        else:
            market_prob = round(forecast_prob + random.uniform(0.05, 0.25), 3)
            market_prob = min(market_prob, 0.95)

        edge = abs(forecast_prob - market_prob) * 100
        price = market_prob
        size_usd = round(random.uniform(2, 10), 2)
        size_shares = round(size_usd / price, 2) if price > 0 else 0

        won = random.random() < 0.58  # ~58% win rate
        if won:
            pnl = round(random.uniform(0.3, size_usd * 0.8), 2)
            outcome = MarketOutcome.WIN
        else:
            pnl = round(-random.uniform(0.2, size_usd * 0.5), 2)
            outcome = MarketOutcome.LOSS

        created = now - timedelta(
            days=day_offset,
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
        )

        # Leave some recent trades as PENDING
        if day_offset <= 1 and random.random() < 0.4:
            outcome = MarketOutcome.PENDING
            pnl = 0

        trade = Trade(
            id=str(uuid.uuid4()),
            market_condition_id=f"0x{uuid.uuid4().hex[:40]}",
            bracket_token_id=f"{random.randint(10**60, 10**76)}",
            bracket_label=bracket,
            city_slug=city,
            side=side,
            price=price,
            size_usd=size_usd,
            size_shares=size_shares,
            forecast_prob=forecast_prob,
            market_prob=market_prob,
            edge_pct=round(edge, 1),
            status=TradeStatus.FILLED,
            mode="paper",
            fill_price=price,
            pnl=pnl,
            outcome=outcome,
            created_at=created,
            resolved_at=created + timedelta(hours=random.randint(6, 48)) if outcome != MarketOutcome.PENDING else None,
        )

        db.insert_trade(trade)
        trades_created += 1

        if outcome != MarketOutcome.PENDING:
            db.update_daily_pnl(created.date(), pnl, 1)

print(f"Seeded {trades_created} demo trades into {settings.db_path}")
print("Now run: python dashboard.py")
