"""Rich CLI dashboard for live monitoring."""

from __future__ import annotations

from datetime import datetime

from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from data.database import Database
from data.models import EdgeSignal, Market, Trade

console = Console()


class Dashboard:
    def __init__(self, db: Database, mode: str) -> None:
        self._db = db
        self._mode = mode
        self._active_markets: list[Market] = []
        self._recent_signals: list[EdgeSignal] = []
        self._live: Live | None = None

    def start(self) -> Live:
        self._live = Live(
            self._build_layout(),
            console=console,
            refresh_per_second=1,
            screen=False,
        )
        return self._live

    def update(
        self,
        markets: list[Market] | None = None,
        signals: list[EdgeSignal] | None = None,
    ) -> None:
        if markets is not None:
            self._active_markets = markets
        if signals is not None:
            self._recent_signals = signals[:10]
        if self._live:
            self._live.update(self._build_layout())

    def _build_layout(self) -> Panel:
        layout = Table.grid(expand=True)
        layout.add_row(self._header())
        layout.add_row(self._stats_panel())
        layout.add_row(self._signals_panel())
        layout.add_row(self._trades_panel())
        return Panel(layout, title="Weather Bot", border_style="blue")

    def _header(self) -> Panel:
        mode_str = f"[bold green]{self._mode.upper()}[/]"
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        markets_count = len(self._active_markets)
        text = Text.from_markup(
            f" Mode: {mode_str}  |  Markets: {markets_count}  |  {now}"
        )
        return Panel(text, style="dim")

    def _stats_panel(self) -> Panel:
        stats = self._db.get_summary_stats()
        pnl_today, trades_today = self._db.get_today_pnl()

        table = Table(show_header=True, header_style="bold cyan", expand=True)
        table.add_column("Metric")
        table.add_column("Value", justify="right")

        total = stats.get("total", 0) or 0
        wins = stats.get("wins", 0) or 0
        losses = stats.get("losses", 0) or 0
        total_pnl = stats.get("total_pnl", 0) or 0
        avg_pnl = stats.get("avg_pnl", 0) or 0
        win_rate = (wins / (wins + losses) * 100) if (wins + losses) > 0 else 0

        pnl_style = "green" if total_pnl >= 0 else "red"
        today_style = "green" if pnl_today >= 0 else "red"

        table.add_row("Total Trades", str(total))
        table.add_row("Win Rate", f"{win_rate:.1f}%")
        table.add_row("Total P&L", f"[{pnl_style}]${total_pnl:.2f}[/]")
        table.add_row("Avg P&L/Trade", f"${avg_pnl:.2f}")
        table.add_row("Today's P&L", f"[{today_style}]${pnl_today:.2f}[/]")
        table.add_row("Today's Trades", str(trades_today))

        return Panel(table, title="Performance", border_style="green")

    def _signals_panel(self) -> Panel:
        table = Table(show_header=True, header_style="bold yellow", expand=True)
        table.add_column("City")
        table.add_column("Date")
        table.add_column("Bracket")
        table.add_column("Side")
        table.add_column("Forecast", justify="right")
        table.add_column("Market", justify="right")
        table.add_column("Edge", justify="right")
        table.add_column("Size", justify="right")

        for s in self._recent_signals:
            edge_color = "green" if s.edge_pct >= 20 else "yellow"
            table.add_row(
                s.market.city_slug,
                s.market.target_date.strftime("%m/%d"),
                s.bracket.label,
                s.side.value,
                f"{s.forecast_prob:.1%}",
                f"{s.market_prob:.1%}",
                f"[{edge_color}]{s.edge_pct:.1f}%[/]",
                f"${s.suggested_size_usd:.2f}",
            )

        if not self._recent_signals:
            table.add_row("—", "—", "—", "—", "—", "—", "—", "—")

        return Panel(table, title="Active Signals", border_style="yellow")

    def _trades_panel(self) -> Panel:
        trades = self._db.get_all_trades(limit=8)

        table = Table(show_header=True, header_style="bold magenta", expand=True)
        table.add_column("Time")
        table.add_column("City")
        table.add_column("Bracket")
        table.add_column("Side")
        table.add_column("Price", justify="right")
        table.add_column("Size", justify="right")
        table.add_column("Edge", justify="right")
        table.add_column("P&L", justify="right")
        table.add_column("Status")

        for t in trades:
            pnl_str = f"${t.pnl:.2f}" if t.outcome.value != "PENDING" else "—"
            pnl_style = ""
            if t.pnl > 0:
                pnl_style = "green"
            elif t.pnl < 0:
                pnl_style = "red"

            status_style = {
                "WIN": "green", "LOSS": "red", "PENDING": "yellow",
            }.get(t.outcome.value, "")

            table.add_row(
                t.created_at.strftime("%H:%M"),
                t.city_slug,
                t.bracket_label,
                t.side.value,
                f"${t.fill_price:.3f}",
                f"${t.size_usd:.2f}",
                f"{t.edge_pct:.1f}%",
                f"[{pnl_style}]{pnl_str}[/]" if pnl_style else pnl_str,
                f"[{status_style}]{t.outcome.value}[/]" if status_style else t.outcome.value,
            )

        if not trades:
            table.add_row("—", "—", "—", "—", "—", "—", "—", "—", "—")

        return Panel(table, title="Recent Trades", border_style="magenta")
