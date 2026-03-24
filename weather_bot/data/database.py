"""Database layer backed by Supabase PostgREST (via httpx).

Uses the Supabase REST API directly to avoid heavy SDK dependencies.
Falls back to no-op stubs if Supabase is not configured.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, date, timezone
from typing import Any

import httpx

from config.settings import settings
from data.models import Trade, TradeStatus, Side, MarketOutcome

log = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self) -> None:
        if not settings.supabase_enabled:
            log.warning("Supabase not configured — database calls will be no-ops")
            self._base: str = ""
            self._headers: dict[str, str] = {}
            self._enabled = False
            return

        self._base = f"{settings.supabase_url}/rest/v1"
        self._headers = {
            "apikey": settings.supabase_service_key,
            "Authorization": f"Bearer {settings.supabase_service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        self._enabled = True
        log.info("Supabase REST client initialised (%s)", settings.supabase_url[:40])

    # ── low-level REST helpers ────────────────────────────────────────

    def _get(self, table: str, params: dict | None = None) -> list[dict]:
        if not self._enabled:
            return []
        try:
            r = httpx.get(
                f"{self._base}/{table}",
                headers={**self._headers, "Prefer": ""},
                params=params or {},
                timeout=15,
            )
            r.raise_for_status()
            return r.json()
        except Exception:
            log.exception("Supabase GET %s failed", table)
            return []

    def _post(self, table: str, payload: dict | list[dict],
              upsert: bool = False, on_conflict: str = "") -> None:
        if not self._enabled:
            return
        headers = dict(self._headers)
        if upsert:
            resolution = f"on_conflict={on_conflict}" if on_conflict else ""
            headers["Prefer"] = f"resolution=merge-duplicates,{resolution}".rstrip(",")
        try:
            r = httpx.post(
                f"{self._base}/{table}",
                headers=headers,
                json=payload if isinstance(payload, list) else payload,
                timeout=15,
            )
            r.raise_for_status()
        except Exception:
            log.exception("Supabase POST %s failed", table)

    def _patch(self, table: str, params: dict, payload: dict) -> None:
        if not self._enabled:
            return
        try:
            r = httpx.patch(
                f"{self._base}/{table}",
                headers=self._headers,
                params=params,
                json=payload,
                timeout=15,
            )
            r.raise_for_status()
        except Exception:
            log.exception("Supabase PATCH %s failed", table)

    # ── trade writes ──────────────────────────────────────────────────

    def insert_trade(self, t: Trade) -> None:
        self._post("trades", {
            "id": t.id,
            "market_condition_id": t.market_condition_id,
            "bracket_token_id": t.bracket_token_id,
            "bracket_label": t.bracket_label,
            "city_slug": t.city_slug,
            "side": t.side.value,
            "price": t.price,
            "size_usd": t.size_usd,
            "size_shares": t.size_shares,
            "forecast_prob": t.forecast_prob,
            "market_prob": t.market_prob,
            "edge_pct": t.edge_pct,
            "status": t.status.value,
            "mode": t.mode,
            "order_id": t.order_id or "",
            "fill_price": t.fill_price,
            "pnl": t.pnl,
            "outcome": t.outcome.value,
            "created_at": t.created_at.isoformat(),
            "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        }, upsert=True, on_conflict="id")

    def update_trade_status(self, trade_id: str, status: TradeStatus,
                            fill_price: float = 0.0) -> None:
        self._patch("trades", {"id": f"eq.{trade_id}"}, {
            "status": status.value,
            "fill_price": fill_price,
        })

    def resolve_trade(self, trade_id: str, outcome: MarketOutcome,
                      pnl: float) -> None:
        self._patch("trades", {"id": f"eq.{trade_id}"}, {
            "outcome": outcome.value,
            "pnl": pnl,
            "resolved_at": _now_iso(),
        })

    def update_daily_pnl(self, day: date, realized: float,
                         num_trades: int) -> None:
        self._post("daily_pnl", {
            "date": day.isoformat(),
            "realized": realized,
            "num_trades": num_trades,
        }, upsert=True, on_conflict="date")

    # ── trade reads ───────────────────────────────────────────────────

    def get_open_trades(self) -> list[Trade]:
        rows = self._get("trades", {
            "outcome": "eq.PENDING",
            "status": "eq.FILLED",
            "select": "*",
        })
        return [self._row_to_trade(r) for r in rows]

    def get_trades_for_market(self, condition_id: str) -> list[Trade]:
        rows = self._get("trades", {
            "market_condition_id": f"eq.{condition_id}",
            "select": "*",
        })
        return [self._row_to_trade(r) for r in rows]

    def get_today_pnl(self) -> tuple[float, int]:
        today = date.today().isoformat()
        rows = self._get("daily_pnl", {
            "date": f"eq.{today}",
            "select": "realized,num_trades",
        })
        if rows:
            return float(rows[0].get("realized", 0)), int(rows[0].get("num_trades", 0))
        return 0.0, 0

    def get_all_trades(self, limit: int = 200) -> list[Trade]:
        rows = self._get("trades", {
            "select": "*",
            "order": "created_at.desc",
            "limit": str(limit),
        })
        return [self._row_to_trade(r) for r in rows]

    def get_summary_stats(self) -> dict:
        rows = self._get("trades", {
            "status": "eq.FILLED",
            "select": "pnl,outcome",
        })
        total = len(rows)
        wins = sum(1 for r in rows if r["outcome"] == "WIN")
        losses = sum(1 for r in rows if r["outcome"] == "LOSS")
        total_pnl = sum(r["pnl"] for r in rows)
        resolved = [r for r in rows if r["outcome"] != "PENDING"]
        avg_pnl = (total_pnl / len(resolved)) if resolved else 0
        return {
            "total": total, "wins": wins, "losses": losses,
            "total_pnl": total_pnl, "avg_pnl": avg_pnl,
        }

    def get_pnl_by_city(self) -> list[dict]:
        rows = self._get("trades", {
            "status": "eq.FILLED",
            "select": "city_slug,pnl,outcome",
        })
        buckets: dict[str, dict] = {}
        for r in rows:
            slug = r["city_slug"]
            if slug not in buckets:
                buckets[slug] = {"city_slug": slug, "trades": 0, "wins": 0, "pnl": 0.0}
            buckets[slug]["trades"] += 1
            if r["outcome"] == "WIN":
                buckets[slug]["wins"] += 1
            buckets[slug]["pnl"] += r["pnl"]
        return sorted(buckets.values(), key=lambda b: b["pnl"], reverse=True)

    def get_cumulative_pnl(self) -> list[dict]:
        rows = self._get("trades", {
            "status": "eq.FILLED",
            "outcome": "neq.PENDING",
            "select": "created_at,pnl",
            "order": "created_at.asc",
        })
        cumulative: list[dict] = []
        running = 0.0
        for r in rows:
            running += r["pnl"]
            cumulative.append({"time": r["created_at"], "pnl": round(running, 2)})
        return cumulative

    def get_edge_distribution(self) -> list[dict]:
        return self._get("trades", {
            "status": "eq.FILLED",
            "select": "edge_pct,outcome,pnl",
            "order": "edge_pct.asc",
        })

    def get_daily_history(self) -> list[dict]:
        return self._get("daily_pnl", {
            "select": "date,realized,num_trades",
            "order": "date.asc",
        })

    def get_open_positions_summary(self) -> list[dict]:
        rows = self._get("trades", {
            "status": "eq.FILLED",
            "outcome": "eq.PENDING",
            "select": "city_slug,bracket_label,side,size_usd,fill_price,edge_pct",
        })
        groups: dict[str, dict] = {}
        for r in rows:
            key = f"{r['city_slug']}|{r['bracket_label']}|{r['side']}"
            if key not in groups:
                groups[key] = {
                    "city_slug": r["city_slug"], "bracket_label": r["bracket_label"],
                    "side": r["side"], "total_size": 0.0, "price_sum": 0.0,
                    "edge_sum": 0.0, "count": 0,
                }
            g = groups[key]
            g["total_size"] += r["size_usd"]
            g["price_sum"] += r["fill_price"]
            g["edge_sum"] += r["edge_pct"]
            g["count"] += 1
        return [{
            "city_slug": g["city_slug"], "bracket_label": g["bracket_label"],
            "side": g["side"],
            "total_size": round(g["total_size"], 2),
            "avg_price": round(g["price_sum"] / g["count"], 4),
            "avg_edge": round(g["edge_sum"] / g["count"], 1),
            "count": g["count"],
        } for g in groups.values()]

    # ── scan / market / signal writes ─────────────────────────────────

    def insert_scan(self, markets_found: int, new_markets: int,
                    duration_ms: int) -> None:
        self._post("scans", {
            "started_at": _now_iso(),
            "markets_found": markets_found,
            "new_markets": new_markets,
            "duration_ms": duration_ms,
        })

    def upsert_market(self, condition_id: str, question: str,
                      city_slug: str, target_date: date,
                      end_date: datetime, num_brackets: int,
                      brackets_json: list[dict],
                      active: bool = True) -> None:
        self._post("markets", {
            "condition_id": condition_id,
            "question": question,
            "city_slug": city_slug,
            "target_date": target_date.isoformat(),
            "end_date": end_date.isoformat(),
            "num_brackets": num_brackets,
            "brackets_json": json.dumps(brackets_json),
            "active": active,
            "last_seen_at": _now_iso(),
        }, upsert=True, on_conflict="condition_id")

    def insert_signal(self, market_condition_id: str, bracket_label: str,
                      city_slug: str, side: str, forecast_prob: float,
                      market_prob: float, edge_pct: float,
                      suggested_size: float, acted_on: bool = False,
                      trade_id: str | None = None) -> None:
        self._post("signals", {
            "market_condition_id": market_condition_id,
            "bracket_label": bracket_label,
            "city_slug": city_slug,
            "side": side,
            "forecast_prob": forecast_prob,
            "market_prob": market_prob,
            "edge_pct": edge_pct,
            "suggested_size": suggested_size,
            "acted_on": acted_on,
            "trade_id": trade_id,
            "created_at": _now_iso(),
        })

    # ── bot_settings ──────────────────────────────────────────────────

    def get_bot_setting(self, key: str, default: str = "") -> str:
        rows = self._get("bot_settings", {
            "key": f"eq.{key}",
            "select": "value",
            "limit": "1",
        })
        return rows[0]["value"] if rows else default

    def get_all_bot_settings(self) -> dict[str, str]:
        rows = self._get("bot_settings", {"select": "key,value"})
        return {r["key"]: r["value"] for r in rows}

    def set_bot_setting(self, key: str, value: str) -> None:
        self._post("bot_settings", {
            "key": key,
            "value": value,
            "updated_at": _now_iso(),
        }, upsert=True, on_conflict="key")

    # ── row mapper ────────────────────────────────────────────────────

    @staticmethod
    def _row_to_trade(row: dict[str, Any]) -> Trade:
        created = row.get("created_at", "")
        resolved = row.get("resolved_at")
        return Trade(
            id=row["id"],
            market_condition_id=row["market_condition_id"],
            bracket_token_id=row["bracket_token_id"],
            bracket_label=row["bracket_label"],
            city_slug=row["city_slug"],
            side=Side(row["side"]),
            price=row["price"],
            size_usd=row["size_usd"],
            size_shares=row["size_shares"],
            forecast_prob=row["forecast_prob"],
            market_prob=row["market_prob"],
            edge_pct=row["edge_pct"],
            status=TradeStatus(row["status"]),
            mode=row["mode"],
            order_id=row.get("order_id", ""),
            fill_price=row.get("fill_price", 0),
            pnl=row.get("pnl", 0),
            outcome=MarketOutcome(row.get("outcome", "PENDING")),
            created_at=datetime.fromisoformat(created) if created else datetime.now(timezone.utc),
            resolved_at=datetime.fromisoformat(resolved) if resolved else None,
        )
