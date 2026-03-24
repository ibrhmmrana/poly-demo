#!/usr/bin/env python3
"""Verify .env + connectivity without placing orders or printing secrets.

Run from project root:  python health_check.py
"""

from __future__ import annotations

import asyncio
import logging
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path


def _safe_msg(text: str) -> str:
    """Windows consoles often use cp1252; avoid UnicodeEncodeError."""
    return text.encode("ascii", "replace").decode("ascii")


def _err_detail(exc: BaseException) -> str:
    s = str(exc).strip()
    if s:
        return s
    return type(exc).__name__

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Loads .env before importing settings
from config.settings import settings  # noqa: E402
from config.cities import CITIES  # noqa: E402
import httpx  # noqa: E402
from core.forecast import ForecastEngine  # noqa: E402
from core.edge import EdgeCalculator  # noqa: E402
from data.database import Database  # noqa: E402
from data.models import Market, TemperatureBracket  # noqa: E402


def _pass(name: str, detail: str = "") -> None:
    extra = f" - {_safe_msg(detail)}" if detail else ""
    print(f"  [OK] {_safe_msg(name)}{extra}")


def _fail(name: str, detail: str = "") -> None:
    extra = f" - {_safe_msg(detail)}" if detail else ""
    print(f"  [FAIL] {_safe_msg(name)}{extra}")


def _warn(name: str, detail: str = "") -> None:
    extra = f" - {_safe_msg(detail)}" if detail else ""
    print(f"  [WARN] {_safe_msg(name)}{extra}")


def print_config_sanitized() -> None:
    print("\n=== Configuration (no secrets) ===")
    print(f"  MODE: {settings.mode}")
    print(f"  POLYMARKET_CHAIN_ID: {settings.chain_id}")
    print(f"  CLOB host: {settings.polymarket_host}")
    pk = (settings.polymarket_private_key or "").strip()
    if pk:
        print(f"  POLYMARKET_PRIVATE_KEY: set (length {len(pk)} chars)")
    else:
        print("  POLYMARKET_PRIVATE_KEY: not set")
    if settings.telegram_enabled:
        print("  Telegram: token + chat_id configured")
    else:
        print("  Telegram: disabled")
    ua = (settings.nws_user_agent or "").strip()
    if ua:
        print(f"  NWS_USER_AGENT: set ({len(ua)} chars, value hidden)")
    else:
        print("  NWS_USER_AGENT: (default)")
    if settings.supabase_enabled:
        print(f"  SUPABASE_URL: {settings.supabase_url[:50]}...")
        print(f"  SUPABASE_SERVICE_KEY: set ({len(settings.supabase_service_key)} chars)")
    else:
        print("  Supabase: NOT configured (SUPABASE_URL / SUPABASE_SERVICE_KEY empty)")
    print(f"  DB path (legacy): {settings.db_path}")


async def check_database() -> bool:
    try:
        db = Database()
        if not db._enabled:
            _warn("Supabase database", "not configured - bot will run in no-op mode")
            return True
        stats = db.get_summary_stats()
        _pass("Supabase database", f"connected (total filled trades: {stats.get('total', 0)})")
        return True
    except Exception as e:
        _fail("Supabase database", _err_detail(e))
        return False


async def check_supabase_write() -> bool:
    """Verify we can read bot_settings (proves table exists + RLS works)."""
    try:
        db = Database()
        if not db._enabled:
            _warn("Supabase write test", "skipped (not configured)")
            return True
        val = db.get_bot_setting("mode", "NOT_FOUND")
        if val == "NOT_FOUND":
            _warn("Supabase write test", "bot_settings table exists but 'mode' key missing (run schema.sql)")
            return True
        _pass("Supabase write test", f"bot_settings.mode = {val}")
        return True
    except Exception as e:
        _fail("Supabase write test", _err_detail(e))
        return False


async def check_gamma_api() -> bool:
    """Single-page Gamma request (fast); full scan runs in the bot loop."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                "https://gamma-api.polymarket.com/events",
                params={
                    "active": "true",
                    "closed": "false",
                    "limit": 10,
                    "offset": 0,
                    "slug": "highest-temperature",
                },
            )
            r.raise_for_status()
            data = r.json()
        n = len(data) if isinstance(data, list) else 0
        _pass("Gamma API (first page)", f"{n} event(s) returned")
        return True
    except Exception as e:
        _fail("Gamma API", _err_detail(e))
        return False


async def check_gamma_all_weather() -> bool:
    """Broader search: look for any temperature/weather events, active or not."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # Try multiple search terms
            found = []
            for slug in ["highest-temperature", "temperature", "weather"]:
                r = await client.get(
                    "https://gamma-api.polymarket.com/events",
                    params={"limit": 20, "offset": 0, "slug": slug},
                )
                r.raise_for_status()
                data = r.json()
                if isinstance(data, list):
                    for ev in data:
                        title = ev.get("title", "")
                        active = ev.get("active", False)
                        closed = ev.get("closed", True)
                        slug_val = ev.get("slug", "")
                        found.append(
                            f"{'[ACTIVE]' if active and not closed else '[ended]'} {title[:60]}"
                        )
            if found:
                _pass("Gamma weather events (broad)", f"{len(found)} total event(s):")
                for line in found[:8]:
                    print(f"         {_safe_msg(line)}")
                if len(found) > 8:
                    print(f"         ... and {len(found) - 8} more")
            else:
                _warn("Gamma weather events (broad)", "0 events found with any search term - Polymarket may have none listed right now")
            return True
    except Exception as e:
        _fail("Gamma weather events (broad)", _err_detail(e))
        return False


async def check_forecast() -> bool:
    city = CITIES.get("nyc")
    if not city:
        _fail("Forecast", "nyc not in CITIES")
        return False
    target = datetime.now().replace(tzinfo=None) + timedelta(days=1)
    end = target + timedelta(days=1)
    dummy = Market(
        condition_id="health-check",
        question="Health check NYC",
        city_slug="nyc",
        target_date=target,
        end_date=end,
        brackets=[
            TemperatureBracket(token_id="0", label="60-61", low=60, high=61),
        ],
    )
    eng = ForecastEngine()
    try:
        fc = await eng.get_forecast(dummy)
        if fc and fc.probabilities:
            _pass(
                "Forecast (NWS for NYC sample)",
                f"source={fc.source}, point_est={fc.point_forecast:.1f} deg",
            )
            return True
        _fail("Forecast", "no probabilities returned (check NWS_USER_AGENT / network)")
        return False
    except Exception as e:
        _fail("Forecast (NWS)", _err_detail(e))
        return False
    finally:
        await eng.close()


async def check_websocket() -> bool:
    edge = EdgeCalculator()
    try:
        await asyncio.wait_for(edge.connect(), timeout=25.0)
        if not edge._ws:
            _fail("Polymarket WebSocket", "connect failed (timeout or network)")
            return False
        await edge.poll_prices(timeout=1.0)
        _pass("Polymarket WebSocket", "connected + polled")
        return True
    except TimeoutError:
        _fail(
            "Polymarket WebSocket",
            "handshake timed out - check firewall/VPN/proxy",
        )
        return False
    except Exception as e:
        _fail("Polymarket WebSocket", _err_detail(e))
        return False
    finally:
        await edge.disconnect()


def _normalize_hex_private_key(raw: str) -> str:
    s = raw.strip()
    if s.startswith("0x") or s.startswith("0X"):
        s = s[2:]
    return s


async def check_clob_auth() -> bool:
    if not settings.is_live:
        _pass("CLOB API credentials", "skipped (MODE is not live)")
        return True
    pk = (settings.polymarket_private_key or "").strip()
    if not pk:
        _fail("CLOB API credentials", "MODE=live but POLYMARKET_PRIVATE_KEY empty")
        return False
    normalized = _normalize_hex_private_key(pk)
    if len(normalized) != 64 or not re.fullmatch(r"[0-9a-fA-F]+", normalized):
        _fail(
            "CLOB API credentials",
            "private key must be 64 hex chars (optionally 0x prefix). "
            "Polymarket trading uses your wallet export key, not API passphrase.",
        )
        return False
    try:
        from py_clob_client.client import ClobClient

        client = ClobClient(
            settings.polymarket_host,
            key=normalized,
            chain_id=settings.chain_id,
        )
        client.set_api_creds(client.create_or_derive_api_creds())
        _pass("CLOB API credentials", "create_or_derive_api_creds OK (no order sent)")
        return True
    except Exception as e:
        msg = _err_detail(e)
        if "Non-hexadecimal" in msg or "hex" in msg.lower():
            msg += " | Check POLYMARKET_PRIVATE_KEY is 64-char hex (wallet private key)."
        _fail("CLOB API credentials", msg)
        return False


async def check_telegram() -> bool:
    if not settings.telegram_enabled:
        _pass("Telegram API", "skipped (not configured)")
        return True
    try:
        import httpx

        token = settings.telegram_bot_token.strip()
        url = f"https://api.telegram.org/bot{token}/getMe"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
        if data.get("ok") and data.get("result", {}).get("is_bot"):
            uname = data["result"].get("username", "?")
            _pass("Telegram API", f"getMe ok (@{uname})")
            return True
        _fail("Telegram API", f"unexpected response: {data}")
        return False
    except Exception as e:
        _fail("Telegram API", _err_detail(e))
        return False


async def main() -> int:
    # Quieter logs during check (WebSocket failures log full trace by default)
    logging.getLogger("core.edge").setLevel(logging.CRITICAL)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    print("Weather Bot - health check (read-only / no orders)\n")

    print_config_sanitized()

    print("\n=== Checks ===")
    results: list[bool] = []

    results.append(await check_database())
    results.append(await check_supabase_write())
    results.append(await check_gamma_api())
    results.append(await check_gamma_all_weather())
    results.append(await check_forecast())
    results.append(await check_websocket())
    results.append(await check_clob_auth())
    results.append(await check_telegram())

    ok = all(results)
    print("\n=== Summary ===")
    if ok:
        print("All checks passed.")
    else:
        print("One or more checks failed - see [FAIL] lines above.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
