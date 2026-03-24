"""Weather Bot entry point — async main loop."""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config.settings import settings
from core.edge import EdgeCalculator
from core.forecast import ForecastEngine
from core.risk import RiskEngine
from core.scanner import MarketScanner
from data.database import Database
from data.models import Forecast, Market
from execution.orderbook import parse_order_book
from execution.trader import BaseTrader, LiveTrader, PaperTrader
from interface.alerts import TelegramAlerts
from interface.dashboard import Dashboard

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("weatherbot")


class WeatherBot:
    def __init__(self) -> None:
        self._running = False
        self._paused = False
        self._db = Database()
        self._scanner = MarketScanner()
        self._forecast = ForecastEngine()
        self._edge = EdgeCalculator()
        self._risk = RiskEngine(self._db)
        self._alerts = TelegramAlerts()
        self._dashboard = Dashboard(self._db, settings.mode)
        self._trader: BaseTrader | None = None
        self._markets: list[Market] = []
        self._forecasts: dict[str, Forecast] = {}

    async def start(self) -> None:
        log.info("Starting Weather Bot in %s mode", settings.mode.upper())

        if settings.is_live:
            trader = LiveTrader(self._db, self._scanner)
            ok = await trader.initialize()
            if not ok:
                log.error("Failed to initialize live trader, falling back to paper")
                self._trader = PaperTrader(self._db, self._scanner)
            else:
                self._trader = trader
        else:
            self._trader = PaperTrader(self._db, self._scanner)

        await self._alerts.initialize()
        await self._edge.connect()

        self._risk.refresh_daily()
        self._running = True

        log.info("Bot initialized — entering main loop")
        live = self._dashboard.start()

        try:
            with live:
                await self._main_loop()
        except asyncio.CancelledError:
            log.info("Main loop cancelled")
        finally:
            await self._shutdown()

    async def _main_loop(self) -> None:
        scan_interval = settings.scan_interval_sec
        forecast_interval = settings.forecast_poll_sec

        last_scan = 0.0
        last_forecast = 0.0
        last_settings_check = 0.0
        settings_check_interval = 10.0

        while self._running:
            now = asyncio.get_event_loop().time()

            # ── Check dashboard-controlled settings ──
            if now - last_settings_check >= settings_check_interval:
                try:
                    self._sync_bot_settings()
                except Exception:
                    log.exception("Failed to sync bot_settings")
                last_settings_check = now

            if self._paused:
                await asyncio.sleep(2)
                continue

            # ── Scan for new markets ──
            if now - last_scan >= scan_interval:
                try:
                    t0 = time.monotonic()
                    prev_known = len(self._scanner._known_ids)
                    self._markets = await self._scanner.scan()
                    duration_ms = int((time.monotonic() - t0) * 1000)
                    new_count = len(self._scanner._known_ids) - prev_known

                    self._db.insert_scan(
                        markets_found=len(self._markets),
                        new_markets=max(new_count, 0),
                        duration_ms=duration_ms,
                    )
                    for m in self._markets:
                        brackets_json = [
                            {"label": b.label, "token_id": b.token_id,
                             "low": b.low, "high": b.high,
                             "market_price": b.market_price}
                            for b in m.brackets
                        ]
                        self._db.upsert_market(
                            condition_id=m.condition_id,
                            question=m.question,
                            city_slug=m.city_slug,
                            target_date=m.target_date.date(),
                            end_date=m.end_date,
                            num_brackets=len(m.brackets),
                            brackets_json=brackets_json,
                            active=m.active,
                        )

                    await self._edge.subscribe(self._markets)
                    self._dashboard.update(markets=self._markets)
                except Exception:
                    log.exception("Market scan failed")
                last_scan = now

            # ── Fetch/refresh forecasts ──
            if now - last_forecast >= forecast_interval:
                try:
                    await self._refresh_forecasts()
                except Exception:
                    log.exception("Forecast refresh failed")
                last_forecast = now

            # ── Poll WebSocket prices ──
            try:
                await self._edge.poll_prices(timeout=0.3)
            except Exception:
                log.exception("Price poll failed")

            # ── Find and act on edges ──
            try:
                await self._evaluate_and_trade()
            except Exception:
                log.exception("Trade evaluation failed")

            # ── Check resolutions ──
            try:
                if self._trader:
                    resolved = await self._trader.check_resolutions()
                    for t in resolved:
                        self._risk.record_trade_pnl(t.pnl)
                        await self._alerts.notify_resolution(t)
            except Exception:
                log.exception("Resolution check failed")

            if self._edge._ws is None:
                log.info("Reconnecting WebSocket...")
                await self._edge.connect()
                if self._markets:
                    await self._edge.subscribe(self._markets)

            await asyncio.sleep(1)

    def _sync_bot_settings(self) -> None:
        """Read bot_settings from Supabase and apply changes."""
        paused_val = self._db.get_bot_setting("bot_paused", "false")
        new_paused = paused_val.lower() in ("true", "1", "yes")
        if new_paused != self._paused:
            log.info("Bot %s via dashboard", "PAUSED" if new_paused else "RESUMED")
            self._paused = new_paused

        new_mode = self._db.get_bot_setting("mode", settings.mode)
        if new_mode != settings.mode and new_mode in ("paper", "live"):
            log.info("Mode changed via dashboard: %s -> %s", settings.mode, new_mode)
            # Mode switch requires re-init of trader on next loop

    async def _refresh_forecasts(self) -> None:
        for market in self._markets:
            cache_key = f"{market.city_slug}:{market.target_date.date()}"
            forecast = await self._forecast.get_forecast(market)
            if forecast:
                self._forecasts[cache_key] = forecast

    async def _evaluate_and_trade(self) -> None:
        if not self._markets or not self._forecasts or not self._trader:
            return

        signals = self._edge.find_edges(self._markets, self._forecasts)
        if not signals:
            self._dashboard.update(signals=[])
            return

        for sig in signals:
            book_raw = await self._scanner.fetch_order_book(
                sig.bracket.token_id
            )
            if not book_raw:
                self._db.insert_signal(
                    market_condition_id=sig.market.condition_id,
                    bracket_label=sig.bracket.label,
                    city_slug=sig.market.city_slug,
                    side=sig.side.value,
                    forecast_prob=sig.forecast_prob,
                    market_prob=sig.market_prob,
                    edge_pct=sig.edge_pct,
                    suggested_size=0,
                    acted_on=False,
                )
                continue

            book = parse_order_book(book_raw)
            size = self._risk.size_trade(sig, book)

            acted = False
            trade_id = None
            if size > 0:
                trade = await self._trader.execute(sig, size, book)
                if trade:
                    acted = True
                    trade_id = trade.id
                    self._risk.track_position(sig.bracket.token_id, size)
                    await self._alerts.notify_trade(trade)

            self._db.insert_signal(
                market_condition_id=sig.market.condition_id,
                bracket_label=sig.bracket.label,
                city_slug=sig.market.city_slug,
                side=sig.side.value,
                forecast_prob=sig.forecast_prob,
                market_prob=sig.market_prob,
                edge_pct=sig.edge_pct,
                suggested_size=sig.suggested_size_usd,
                acted_on=acted,
                trade_id=trade_id,
            )

        self._dashboard.update(signals=signals)

    async def _shutdown(self) -> None:
        log.info("Shutting down...")
        self._running = False

        await self._alerts.shutdown()
        await self._edge.disconnect()
        await self._scanner.close()
        await self._forecast.close()

        log.info("Shutdown complete")


def main() -> None:
    bot = WeatherBot()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def _handle_signal(sig: int, frame: object) -> None:
        log.info("Received signal %d, stopping...", sig)
        bot._running = False

    signal.signal(signal.SIGINT, _handle_signal)
    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, _handle_signal)

    try:
        loop.run_until_complete(bot.start())
    except KeyboardInterrupt:
        log.info("Keyboard interrupt received")
    finally:
        loop.close()


if __name__ == "__main__":
    main()
