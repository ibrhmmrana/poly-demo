"""Market scanner: discovers active weather/temperature markets on Polymarket."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any

import httpx

from config.cities import CITIES, City
from config.settings import settings
from data.models import Market, TemperatureBracket

log = logging.getLogger(__name__)

GAMMA_API = "https://gamma-api.polymarket.com"
_SLUG_PATTERN = re.compile(
    r"highest-temperature-in-(?P<city>[a-z\-]+)-on-(?P<month>[a-z]+)-(?P<day>\d+)(?:-(?P<year>\d{4}))?"
)
_TITLE_RE = re.compile(
    r"Highest temperature in (?P<city>.+?) on (?P<date>.+?)\?",
    re.IGNORECASE,
)
_MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}
_BRACKET_RE_F = re.compile(r"(\d+)-(\d+)")  # e.g. "56-57" (Fahrenheit 2-deg bracket)
_BRACKET_RE_C = re.compile(r"^(\d+)$")  # e.g. "15" (Celsius single-degree)
_BRACKET_ABOVE = re.compile(r"(\d+)\s*(?:or\s*(?:higher|above|more)|\+)", re.I)
_BRACKET_BELOW = re.compile(r"(\d+)\s*(?:or\s*(?:lower|below|less))", re.I)


class MarketScanner:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(timeout=30)
        self._known_ids: set[str] = set()

    async def close(self) -> None:
        await self._client.aclose()

    async def scan(self) -> list[Market]:
        """Fetch active temperature markets from the Gamma API.

        Polymarket slugs include the year, e.g.
        highest-temperature-in-atlanta-on-march-25-2026
        so we build exact slugs for each city + upcoming date.
        """
        events = await self._fetch_temperature_events()

        markets: list[Market] = []
        for ev in events:
            parsed = self._parse_event(ev)
            if parsed and self._within_window(parsed):
                markets.append(parsed)

        new = [m for m in markets if m.condition_id not in self._known_ids]
        for m in new:
            self._known_ids.add(m.condition_id)
            log.info("New market: %s (%s, %s)", m.question,
                     m.city_slug, m.target_date.strftime("%Y-%m-%d"))

        log.info("Scan complete: %d active temperature markets (%d new)",
                 len(markets), len(new))
        return markets

    # ── API calls ─────────────────────────────────────────────────────

    async def _fetch_temperature_events(self) -> list[dict]:
        """Build exact slug queries for each city × upcoming date."""
        now = datetime.now()
        year = now.year
        events: list[dict] = []
        seen_slugs: set[str] = set()

        # Check today + next 4 days (covers the resolution window)
        for day_offset in range(5):
            dt = now + timedelta(days=day_offset)
            month_name = dt.strftime("%B").lower()
            day = dt.day

            for city_slug in CITIES:
                slug = f"highest-temperature-in-{city_slug}-on-{month_name}-{day}-{year}"
                if slug in seen_slugs:
                    continue
                seen_slugs.add(slug)

                fetched = await self._fetch_events_by_slug(slug)
                events.extend(fetched)

        log.info("Slug scan: queried %d slug(s), got %d event(s)",
                 len(seen_slugs), len(events))
        return events

    async def _fetch_events_by_slug(self, slug: str) -> list[dict]:
        """Fetch a single event by exact slug."""
        try:
            resp = await self._client.get(
                f"{GAMMA_API}/events",
                params={"slug": slug},
            )
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []
        except Exception:
            log.debug("Gamma slug query failed: %s", slug)
            return []

    async def fetch_market_prices(self, condition_id: str) -> dict[str, Any]:
        """Fetch current prices/book for a single market from the CLOB."""
        try:
            resp = await self._client.get(
                f"{settings.polymarket_host}/markets/{condition_id}",
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            log.exception("Failed to fetch CLOB market %s", condition_id)
            return {}

    async def fetch_order_book(self, token_id: str) -> dict[str, Any]:
        """Fetch the full order book for a token."""
        try:
            resp = await self._client.get(
                f"{settings.polymarket_host}/book",
                params={"token_id": token_id},
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            log.exception("Failed to fetch order book for %s", token_id)
            return {}

    # ── parsing ───────────────────────────────────────────────────────

    def _parse_event(self, event: dict) -> Market | None:
        """Parse a Gamma API event into a Market, or None if not temp market."""
        slug = event.get("slug", "")
        title = event.get("title", "")

        city_slug, target_date = self._extract_city_date(slug, title)
        if not city_slug or not target_date:
            return None

        if city_slug not in CITIES:
            return None

        sub_markets = event.get("markets", [])
        if not sub_markets:
            return None

        # Temperature markets are negRisk grouped events — each sub-market
        # is a bracket outcome within the same event.
        brackets: list[TemperatureBracket] = []
        first_condition_id = ""
        end_date = None

        for sm in sub_markets:
            if not sm.get("active") or sm.get("closed"):
                continue

            cond_id = sm.get("conditionId", "")
            if not first_condition_id and cond_id:
                first_condition_id = cond_id

            token_ids_raw = sm.get("clobTokenIds", "[]")
            try:
                token_ids = json.loads(token_ids_raw) if isinstance(token_ids_raw, str) else token_ids_raw
            except json.JSONDecodeError:
                token_ids = []

            yes_token = token_ids[0] if token_ids else ""
            outcome_prices_raw = sm.get("outcomePrices", "[]")
            try:
                prices = json.loads(outcome_prices_raw) if isinstance(outcome_prices_raw, str) else outcome_prices_raw
            except json.JSONDecodeError:
                prices = []

            yes_price = float(prices[0]) if prices else 0.0

            label = sm.get("groupItemTitle", "") or sm.get("question", "")
            bracket = self._parse_bracket(label, yes_token, yes_price,
                                          CITIES[city_slug].temp_unit)
            if bracket:
                brackets.append(bracket)

            if not end_date:
                ed = sm.get("endDate")
                if ed:
                    try:
                        end_date = datetime.fromisoformat(ed.replace("Z", "+00:00")).replace(tzinfo=None)
                    except ValueError:
                        pass

        if not brackets or not first_condition_id:
            return None

        # Use the event-level negRiskRequestID or the first conditionId
        event_condition = event.get("negRiskRequestID") or first_condition_id
        if not end_date:
            end_date = target_date + timedelta(days=1)

        return Market(
            condition_id=event_condition,
            question=title,
            city_slug=city_slug,
            target_date=target_date,
            end_date=end_date,
            brackets=brackets,
            active=True,
        )

    def _extract_city_date(self, slug: str, title: str) -> tuple[str | None, datetime | None]:
        m = _SLUG_PATTERN.search(slug)
        if m:
            raw_city = m.group("city").replace("-", " ").strip()
            month_str = m.group("month").lower()
            day = int(m.group("day"))
            month = _MONTH_MAP.get(month_str)
            if month:
                year = int(m.group("year")) if m.group("year") else datetime.now().year
                try:
                    target = datetime(year, month, day)
                except ValueError:
                    return None, None
                city_slug = self._resolve_city(raw_city)
                return city_slug, target

        m = _TITLE_RE.search(title)
        if m:
            raw_city = m.group("city").strip()
            date_str = m.group("date").strip()
            city_slug = self._resolve_city(raw_city)
            target = self._parse_date_str(date_str)
            return city_slug, target

        return None, None

    def _resolve_city(self, raw: str) -> str | None:
        raw_lower = raw.lower()
        for slug, city in CITIES.items():
            if (raw_lower == slug
                    or raw_lower == city.name.lower()
                    or raw_lower in city.name.lower()):
                return slug
        return None

    def _parse_date_str(self, s: str) -> datetime | None:
        """Parse 'March 24' or 'March 24, 2026' into a datetime."""
        for fmt in ("%B %d, %Y", "%B %d"):
            try:
                dt = datetime.strptime(s.strip().rstrip("?"), fmt)
                if dt.year == 1900:
                    dt = dt.replace(year=datetime.now().year)
                return dt
            except ValueError:
                continue
        return None

    def _parse_bracket(self, label: str, token_id: str, price: float,
                       unit: str) -> TemperatureBracket | None:
        """Parse bracket label into structured bounds."""
        label_clean = label.strip()

        m = _BRACKET_ABOVE.search(label_clean)
        if m:
            val = float(m.group(1))
            return TemperatureBracket(
                token_id=token_id, label=label_clean,
                low=val, high=None, market_price=price,
            )

        m = _BRACKET_BELOW.search(label_clean)
        if m:
            val = float(m.group(1))
            return TemperatureBracket(
                token_id=token_id, label=label_clean,
                low=None, high=val, market_price=price,
            )

        m = _BRACKET_RE_F.search(label_clean)
        if m:
            low, high = float(m.group(1)), float(m.group(2))
            return TemperatureBracket(
                token_id=token_id, label=label_clean,
                low=low, high=high, market_price=price,
            )

        m = _BRACKET_RE_C.search(label_clean)
        if m:
            val = float(m.group(1))
            return TemperatureBracket(
                token_id=token_id, label=label_clean,
                low=val, high=val, market_price=price,
            )

        # Fallback: try to extract any number as a single-value bracket
        nums = re.findall(r"\d+", label_clean)
        if len(nums) == 1:
            val = float(nums[0])
            return TemperatureBracket(
                token_id=token_id, label=label_clean,
                low=val, high=val, market_price=price,
            )

        log.debug("Could not parse bracket label: %r", label_clean)
        return None

    def _within_window(self, market: Market) -> bool:
        hours = market.hours_to_resolution
        return (settings.min_hours_to_resolution
                <= hours
                <= settings.max_hours_to_resolution)
