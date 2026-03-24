"""Forecast engine: fetches weather data and builds probability distributions."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta
from typing import Any

import httpx
import numpy as np
from scipy.stats import norm

from config.cities import CITIES, City
from config.settings import settings
from data.models import Forecast, Market, TemperatureBracket

log = logging.getLogger(__name__)

NWS_BASE = "https://api.weather.gov"
OPENMETEO_BASE = "https://api.open-meteo.com/v1/forecast"

# Typical forecast standard deviations by hours-out (empirical from NWS data).
# These widen as the forecast horizon grows.
_FORECAST_STD_BY_HOURS: dict[int, float] = {
    6: 1.5,
    12: 2.0,
    24: 2.5,
    36: 3.0,
    48: 3.5,
    72: 4.5,
}


def _interpolate_std(hours_out: float) -> float:
    """Estimate forecast standard deviation for a given hours-out value."""
    keys = sorted(_FORECAST_STD_BY_HOURS.keys())
    if hours_out <= keys[0]:
        return _FORECAST_STD_BY_HOURS[keys[0]]
    if hours_out >= keys[-1]:
        return _FORECAST_STD_BY_HOURS[keys[-1]]
    for i in range(len(keys) - 1):
        if keys[i] <= hours_out <= keys[i + 1]:
            t = (hours_out - keys[i]) / (keys[i + 1] - keys[i])
            lo = _FORECAST_STD_BY_HOURS[keys[i]]
            hi = _FORECAST_STD_BY_HOURS[keys[i + 1]]
            return lo + t * (hi - lo)
    return 3.0


class ForecastEngine:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            timeout=30,
            headers={"User-Agent": settings.nws_user_agent},
        )
        self._nws_grid_cache: dict[str, str] = {}  # city_slug -> forecast URL
        self._cache: dict[str, Forecast] = {}
        self._cache_ttl = timedelta(minutes=15)

    async def close(self) -> None:
        await self._client.aclose()

    async def get_forecast(self, market: Market) -> Forecast | None:
        """Get a probability-distributed forecast for a market."""
        cache_key = f"{market.city_slug}:{market.target_date.date()}"
        cached = self._cache.get(cache_key)
        if cached and (datetime.utcnow() - cached.fetched_at) < self._cache_ttl:
            return cached

        city = CITIES.get(market.city_slug)
        if not city:
            return None

        if city.forecast_source == "nws":
            forecast = await self._fetch_nws(city, market)
        else:
            forecast = await self._fetch_openmeteo(city, market)

        if forecast:
            forecast.probabilities = self._build_distribution(
                forecast, market.brackets, city,
            )
            self._cache[cache_key] = forecast

        return forecast

    # ── NWS (US cities) ───────────────────────────────────────────────

    async def _fetch_nws(self, city: City, market: Market) -> Forecast | None:
        """Fetch hourly forecast from api.weather.gov."""
        try:
            forecast_url = await self._get_nws_forecast_url(city)
            if not forecast_url:
                return None

            resp = await self._client.get(forecast_url)
            resp.raise_for_status()
            data = resp.json()

            periods = data.get("properties", {}).get("periods", [])
            if not periods:
                log.warning("NWS returned no forecast periods for %s", city.slug)
                return None

            target = market.target_date.date()
            day_temps: list[float] = []
            for p in periods:
                start = datetime.fromisoformat(p["startTime"].replace("Z", "+00:00"))
                if start.date() == target:
                    temp = p.get("temperature")
                    if temp is not None:
                        if city.temp_unit == "C" and p.get("temperatureUnit") == "F":
                            temp = (temp - 32) * 5 / 9
                        elif city.temp_unit == "F" and p.get("temperatureUnit") == "C":
                            temp = temp * 9 / 5 + 32
                        day_temps.append(float(temp))

            if not day_temps:
                log.warning("No temperatures for target date %s in NWS data", target)
                return None

            high = max(day_temps)
            return Forecast(
                city_slug=city.slug,
                target_date=market.target_date,
                fetched_at=datetime.utcnow(),
                source="nws",
                point_forecast=high,
                probabilities={},
                raw_hourly=day_temps,
            )

        except Exception:
            log.exception("NWS forecast fetch failed for %s", city.slug)
            return None

    async def _get_nws_forecast_url(self, city: City) -> str | None:
        """Resolve lat/lon to NWS hourly forecast URL (cached)."""
        if city.slug in self._nws_grid_cache:
            return self._nws_grid_cache[city.slug]

        try:
            resp = await self._client.get(
                f"{NWS_BASE}/points/{city.lat:.4f},{city.lon:.4f}"
            )
            resp.raise_for_status()
            url = resp.json()["properties"]["forecastHourly"]
            self._nws_grid_cache[city.slug] = url
            return url
        except Exception:
            log.exception("Failed to resolve NWS grid for %s", city.slug)
            return None

    # ── Open-Meteo (London / international) ───────────────────────────

    async def _fetch_openmeteo(self, city: City, market: Market) -> Forecast | None:
        """Fetch hourly forecast from Open-Meteo API."""
        try:
            target = market.target_date.date()
            resp = await self._client.get(
                OPENMETEO_BASE,
                params={
                    "latitude": city.lat,
                    "longitude": city.lon,
                    "hourly": "temperature_2m",
                    "start_date": target.isoformat(),
                    "end_date": target.isoformat(),
                    "timezone": "UTC",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            temps = data.get("hourly", {}).get("temperature_2m", [])
            if not temps:
                log.warning("Open-Meteo returned no temps for %s on %s",
                            city.slug, target)
                return None

            temps_f = [float(t) for t in temps if t is not None]
            if not temps_f:
                return None

            if city.temp_unit == "F":
                temps_f = [t * 9 / 5 + 32 for t in temps_f]

            high = max(temps_f)
            return Forecast(
                city_slug=city.slug,
                target_date=market.target_date,
                fetched_at=datetime.utcnow(),
                source="openmeteo",
                point_forecast=high,
                probabilities={},
                raw_hourly=temps_f,
            )

        except Exception:
            log.exception("Open-Meteo forecast failed for %s", city.slug)
            return None

    # ── probability distribution ──────────────────────────────────────

    def _build_distribution(
        self,
        forecast: Forecast,
        brackets: list[TemperatureBracket],
        city: City,
    ) -> dict[str, float]:
        """Convert a point forecast into probabilities across brackets.

        Uses a Gaussian centered on the forecast high temperature, with
        standard deviation derived from forecast horizon uncertainty.
        """
        mu = forecast.point_forecast
        hours_out = max(
            (forecast.target_date - forecast.fetched_at).total_seconds() / 3600,
            1,
        )
        sigma = _interpolate_std(hours_out)

        # If we have enough hourly data, use empirical spread to refine sigma
        if len(forecast.raw_hourly) >= 4:
            top_n = sorted(forecast.raw_hourly, reverse=True)[:4]
            empirical_spread = max(top_n) - min(top_n)
            sigma = max(sigma, empirical_spread / 2)

        probs: dict[str, float] = {}
        for b in brackets:
            p = self._bracket_probability(b, mu, sigma)
            probs[b.label] = p

        # Normalize so probabilities sum to 1
        total = sum(probs.values())
        if total > 0:
            probs = {k: v / total for k, v in probs.items()}

        return probs

    @staticmethod
    def _bracket_probability(
        bracket: TemperatureBracket,
        mu: float,
        sigma: float,
    ) -> float:
        """CDF-based probability that the high falls within bracket bounds."""
        if bracket.low is not None and bracket.high is not None:
            if bracket.low == bracket.high:
                # Single-degree bracket (e.g. "15°C") — use ±0.5
                return float(
                    norm.cdf(bracket.high + 0.5, mu, sigma)
                    - norm.cdf(bracket.low - 0.5, mu, sigma)
                )
            return float(
                norm.cdf(bracket.high + 0.5, mu, sigma)
                - norm.cdf(bracket.low - 0.5, mu, sigma)
            )
        elif bracket.low is not None:
            # "X or higher"
            return float(1 - norm.cdf(bracket.low - 0.5, mu, sigma))
        elif bracket.high is not None:
            # "X or lower"
            return float(norm.cdf(bracket.high + 0.5, mu, sigma))
        return 0.0
