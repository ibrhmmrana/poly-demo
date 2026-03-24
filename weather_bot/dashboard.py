"""Interactive web dashboard for the Weather Bot.

Run standalone:  python dashboard.py
Opens at:        http://localhost:8050
"""

from __future__ import annotations

import json
import sys
import webbrowser
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from threading import Timer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config.settings import settings
from data.database import Database

db = Database(settings.db_path)

PORT = 8050


class DashboardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silence default access logs

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/":
            self._serve_html()
        elif path == "/api/stats":
            self._json_response(self._get_stats())
        elif path == "/api/trades":
            limit = int(params.get("limit", ["100"])[0])
            city = params.get("city", [None])[0]
            self._json_response(self._get_trades(limit, city))
        elif path == "/api/pnl-chart":
            self._json_response(db.get_cumulative_pnl())
        elif path == "/api/city-breakdown":
            self._json_response(db.get_pnl_by_city())
        elif path == "/api/edge-dist":
            self._json_response(db.get_edge_distribution())
        elif path == "/api/daily":
            self._json_response(db.get_daily_history())
        elif path == "/api/positions":
            self._json_response(db.get_open_positions_summary())
        else:
            self.send_error(404)

    def _json_response(self, data):
        body = json.dumps(data, default=str).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _get_stats(self) -> dict:
        stats = db.get_summary_stats()
        pnl_today, trades_today = db.get_today_pnl()
        return {
            "mode": settings.mode,
            "total_trades": stats.get("total", 0) or 0,
            "wins": stats.get("wins", 0) or 0,
            "losses": stats.get("losses", 0) or 0,
            "total_pnl": round(stats.get("total_pnl", 0) or 0, 2),
            "avg_pnl": round(stats.get("avg_pnl", 0) or 0, 2),
            "today_pnl": round(pnl_today, 2),
            "today_trades": trades_today,
            "updated": datetime.now().astimezone().isoformat(),
        }

    def _get_trades(self, limit: int, city: str | None) -> list[dict]:
        trades = db.get_all_trades(limit=limit)
        result = []
        for t in trades:
            if city and t.city_slug != city:
                continue
            result.append({
                "id": t.id[:8],
                "time": t.created_at.isoformat(),
                "city": t.city_slug,
                "bracket": t.bracket_label,
                "side": t.side.value,
                "price": round(t.fill_price, 4),
                "size": round(t.size_usd, 2),
                "forecast": round(t.forecast_prob, 3),
                "market": round(t.market_prob, 3),
                "edge": round(t.edge_pct, 1),
                "pnl": round(t.pnl, 2),
                "outcome": t.outcome.value,
                "mode": t.mode,
            })
        return result

    def _serve_html(self):
        body = HTML_PAGE.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)


HTML_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weather Bot Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0f1117; --bg2: #161b22; --bg3: #1c2333;
    --border: #30363d; --text: #e6edf3; --dim: #8b949e;
    --green: #3fb950; --red: #f85149; --yellow: #d29922;
    --blue: #58a6ff; --purple: #bc8cff; --cyan: #39d2c0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.5;
  }
  .header {
    background: var(--bg2); border-bottom: 1px solid var(--border);
    padding: 16px 24px; display: flex; align-items: center; gap: 16px;
  }
  .header h1 { font-size: 20px; font-weight: 600; }
  .mode-badge {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    padding: 3px 10px; border-radius: 12px; letter-spacing: 0.5px;
  }
  .mode-paper { background: var(--yellow); color: #000; }
  .mode-live { background: var(--green); color: #000; }
  .header-right { margin-left: auto; font-size: 13px; color: var(--dim); }
  .container { max-width: 1400px; margin: 0 auto; padding: 20px 24px; }

  /* ── stat cards ── */
  .stats-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px; margin-bottom: 20px;
  }
  .stat-card {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 20px;
  }
  .stat-label { font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-value { font-size: 28px; font-weight: 700; margin-top: 4px; }
  .stat-sub { font-size: 12px; color: var(--dim); margin-top: 2px; }
  .positive { color: var(--green); }
  .negative { color: var(--red); }
  .neutral { color: var(--dim); }

  /* ── charts row ── */
  .charts-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 20px; }
  .chart-card {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 20px; overflow: hidden;
  }
  .chart-card h3 { font-size: 14px; color: var(--dim); margin-bottom: 12px; font-weight: 500; }
  .chart-wrap { position: relative; height: 220px; }
  .chart-wrap-sm { position: relative; height: 180px; }

  /* ── positions + city breakdown ── */
  .mid-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }

  /* ── trades table ── */
  .table-card {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 20px; margin-bottom: 20px;
  }
  .table-scroll { max-height: 480px; overflow-y: auto; }
  .table-scroll::-webkit-scrollbar { width: 6px; }
  .table-scroll::-webkit-scrollbar-track { background: var(--bg2); }
  .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .table-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .table-header h3 { font-size: 14px; color: var(--dim); font-weight: 500; }
  .filter-group { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .filter-group select, .filter-group input {
    background: var(--bg3); border: 1px solid var(--border); color: var(--text);
    padding: 5px 10px; border-radius: 6px; font-size: 13px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--border);
    color: var(--dim); font-weight: 600; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
    user-select: none;
  }
  th:hover { color: var(--text); }
  th.sorted-asc::after { content: ' \u25B2'; font-size: 9px; }
  th.sorted-desc::after { content: ' \u25BC'; font-size: 9px; }
  td { padding: 7px 10px; border-bottom: 1px solid var(--border); }
  tr:hover td { background: var(--bg3); }
  .tag {
    display: inline-block; padding: 1px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 600;
  }
  .tag-win { background: rgba(63,185,80,0.15); color: var(--green); }
  .tag-loss { background: rgba(248,81,73,0.15); color: var(--red); }
  .tag-pending { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .tag-buy { background: rgba(88,166,255,0.1); color: var(--blue); }
  .tag-sell { background: rgba(188,140,255,0.1); color: var(--purple); }
  .mono { font-family: 'SF Mono', 'Fira Code', monospace; }
  .text-right { text-align: right; }

  .empty-state {
    text-align: center; padding: 48px 20px; color: var(--dim);
  }
  .empty-state p { font-size: 15px; margin-top: 8px; }
  .pulse { animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }

  @media (max-width: 900px) {
    .charts-row, .mid-row { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>

<div class="header">
  <h1>Weather Bot</h1>
  <span id="modeBadge" class="mode-badge mode-paper">PAPER</span>
  <div class="header-right">
    <span id="updateTime" class="pulse">connecting...</span>
  </div>
</div>

<div class="container">
  <!-- stat cards -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total P&L</div>
      <div class="stat-value" id="totalPnl">$0.00</div>
      <div class="stat-sub" id="avgPnl">avg $0.00 / trade</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Today's P&L</div>
      <div class="stat-value" id="todayPnl">$0.00</div>
      <div class="stat-sub" id="todayTrades">0 trades today</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value" id="winRate">0%</div>
      <div class="stat-sub" id="winLoss">0W / 0L</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Trades</div>
      <div class="stat-value" id="totalTrades">0</div>
      <div class="stat-sub" id="pendingCount">0 open</div>
    </div>
  </div>

  <!-- charts -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Cumulative P&L</h3>
      <div class="chart-wrap"><canvas id="pnlChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>P&L by City</h3>
      <div class="chart-wrap"><canvas id="cityChart"></canvas></div>
    </div>
  </div>

  <!-- positions + edge distribution -->
  <div class="mid-row">
    <div class="chart-card">
      <h3>Open Positions</h3>
      <div id="positionsTable"></div>
    </div>
    <div class="chart-card">
      <h3>Daily P&L History</h3>
      <div class="chart-wrap-sm"><canvas id="dailyChart"></canvas></div>
    </div>
  </div>

  <!-- trade log -->
  <div class="table-card">
    <div class="table-header">
      <h3>Trade History</h3>
      <div class="filter-group">
        <select id="cityFilter">
          <option value="">All Cities</option>
          <option value="nyc">NYC</option>
          <option value="chicago">Chicago</option>
          <option value="dallas">Dallas</option>
          <option value="miami">Miami</option>
          <option value="seattle">Seattle</option>
          <option value="atlanta">Atlanta</option>
          <option value="london">London</option>
        </select>
        <select id="outcomeFilter">
          <option value="">All Outcomes</option>
          <option value="WIN">Wins</option>
          <option value="LOSS">Losses</option>
          <option value="PENDING">Pending</option>
        </select>
      </div>
    </div>
    <div class="table-scroll"><div id="tradesContainer"></div></div>
  </div>
</div>

<script>
const API = '';
let pnlChart, cityChart, dailyChart;
let allTrades = [];
let sortCol = 'time';
let sortDir = 'desc';

// ── chart setup ──

function initCharts() {
  const gridColor = 'rgba(48,54,61,0.6)';
  const textColor = '#8b949e';
  const defaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 8, font: { size: 11 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
    }
  };

  pnlChart = new Chart(document.getElementById('pnlChart'), {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.08)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }] },
    options: { ...defaults, scales: { ...defaults.scales, y: { ...defaults.scales.y, ticks: { ...defaults.scales.y.ticks, callback: v => '$' + v.toFixed(2) } } } }
  });

  cityChart = new Chart(document.getElementById('cityChart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: { ...defaults, indexAxis: 'y', scales: { x: { ...defaults.scales.x, ticks: { ...defaults.scales.x.ticks, callback: v => '$' + v } }, y: defaults.scales.y } }
  });

  dailyChart = new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: { ...defaults, scales: { ...defaults.scales, y: { ...defaults.scales.y, ticks: { ...defaults.scales.y.ticks, callback: v => '$' + v } } } }
  });
}

// ── data fetching ──

async function fetchAll() {
  try {
    const [stats, pnl, cities, trades, daily, positions] = await Promise.all([
      fetch(API + '/api/stats').then(r => r.json()),
      fetch(API + '/api/pnl-chart').then(r => r.json()),
      fetch(API + '/api/city-breakdown').then(r => r.json()),
      fetch(API + '/api/trades?limit=500').then(r => r.json()),
      fetch(API + '/api/daily').then(r => r.json()),
      fetch(API + '/api/positions').then(r => r.json()),
    ]);
    updateStats(stats);
    updatePnlChart(pnl);
    updateCityChart(cities);
    updateDailyChart(daily);
    updatePositions(positions);
    allTrades = trades;
    renderTrades();
    document.getElementById('updateTime').textContent = new Date().toLocaleTimeString();
    document.getElementById('updateTime').classList.remove('pulse');
  } catch (e) {
    document.getElementById('updateTime').textContent = 'connection error';
    document.getElementById('updateTime').classList.add('pulse');
  }
}

function updateStats(s) {
  const badge = document.getElementById('modeBadge');
  badge.textContent = s.mode.toUpperCase();
  badge.className = 'mode-badge mode-' + s.mode;

  const pnlEl = document.getElementById('totalPnl');
  pnlEl.textContent = '$' + s.total_pnl.toFixed(2);
  pnlEl.className = 'stat-value ' + (s.total_pnl >= 0 ? 'positive' : 'negative');

  document.getElementById('avgPnl').textContent = 'avg $' + s.avg_pnl.toFixed(2) + ' / trade';

  const todayEl = document.getElementById('todayPnl');
  todayEl.textContent = '$' + s.today_pnl.toFixed(2);
  todayEl.className = 'stat-value ' + (s.today_pnl >= 0 ? 'positive' : 'negative');
  document.getElementById('todayTrades').textContent = s.today_trades + ' trades today';

  const wins = s.wins || 0, losses = s.losses || 0;
  const wr = (wins + losses) > 0 ? (wins / (wins + losses) * 100) : 0;
  const wrEl = document.getElementById('winRate');
  wrEl.textContent = wr.toFixed(1) + '%';
  wrEl.className = 'stat-value ' + (wr >= 50 ? 'positive' : wr > 0 ? 'negative' : 'neutral');
  document.getElementById('winLoss').textContent = wins + 'W / ' + losses + 'L';

  document.getElementById('totalTrades').textContent = s.total_trades;
  const pending = allTrades.filter(t => t.outcome === 'PENDING').length;
  document.getElementById('pendingCount').textContent = pending + ' open';
}

function updatePnlChart(data) {
  if (!data.length) return;
  pnlChart.data.labels = data.map(d => {
    const dt = new Date(d.time);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  pnlChart.data.datasets[0].data = data.map(d => d.pnl);
  pnlChart.update('none');
}

function updateCityChart(data) {
  if (!data.length) return;
  cityChart.data.labels = data.map(d => d.city_slug.toUpperCase());
  cityChart.data.datasets[0].data = data.map(d => d.pnl);
  cityChart.data.datasets[0].backgroundColor = data.map(d =>
    d.pnl >= 0 ? 'rgba(63,185,80,0.7)' : 'rgba(248,81,73,0.7)'
  );
  cityChart.update('none');
}

function updateDailyChart(data) {
  if (!data.length) return;
  const last14 = data.slice(-14);
  dailyChart.data.labels = last14.map(d => {
    const dt = new Date(d.date + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  dailyChart.data.datasets[0].data = last14.map(d => d.realized);
  dailyChart.data.datasets[0].backgroundColor = last14.map(d =>
    d.realized >= 0 ? 'rgba(63,185,80,0.6)' : 'rgba(248,81,73,0.6)'
  );
  dailyChart.update('none');
}

function updatePositions(data) {
  const el = document.getElementById('positionsTable');
  if (!data.length) {
    el.innerHTML = '<div class="empty-state"><p>No open positions</p></div>';
    return;
  }
  let html = '<table><thead><tr><th>City</th><th>Bracket</th><th>Side</th><th class="text-right">Size</th><th class="text-right">Avg Price</th><th class="text-right">Edge</th></tr></thead><tbody>';
  for (const p of data) {
    const sideClass = p.side === 'BUY' ? 'tag-buy' : 'tag-sell';
    html += `<tr>
      <td>${p.city_slug.toUpperCase()}</td>
      <td class="mono">${p.bracket_label}</td>
      <td><span class="tag ${sideClass}">${p.side}</span></td>
      <td class="text-right mono">$${p.total_size.toFixed(2)}</td>
      <td class="text-right mono">$${p.avg_price.toFixed(3)}</td>
      <td class="text-right mono">${p.avg_edge.toFixed(1)}%</td>
    </tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

// ── trades table ──

function renderTrades() {
  const cityF = document.getElementById('cityFilter').value;
  const outcomeF = document.getElementById('outcomeFilter').value;
  let filtered = allTrades;
  if (cityF) filtered = filtered.filter(t => t.city === cityF);
  if (outcomeF) filtered = filtered.filter(t => t.outcome === outcomeF);

  filtered.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const el = document.getElementById('tradesContainer');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><p>No trades yet. Start the bot with <code>python main.py</code> to begin paper trading.</p></div>';
    return;
  }

  const cols = [
    { key: 'time', label: 'Time' },
    { key: 'city', label: 'City' },
    { key: 'bracket', label: 'Bracket' },
    { key: 'side', label: 'Side' },
    { key: 'price', label: 'Price', align: 'right' },
    { key: 'size', label: 'Size', align: 'right' },
    { key: 'edge', label: 'Edge', align: 'right' },
    { key: 'forecast', label: 'Forecast', align: 'right' },
    { key: 'pnl', label: 'P&L', align: 'right' },
    { key: 'outcome', label: 'Status' },
  ];

  let html = '<table><thead><tr>';
  for (const c of cols) {
    const cls = c.key === sortCol ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : '';
    const align = c.align === 'right' ? ' class="text-right ' + cls + '"' : (cls ? ' class="' + cls + '"' : '');
    html += `<th${align} data-col="${c.key}">${c.label}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const t of filtered.slice(0, 100)) {
    const dt = new Date(t.time);
    const timeStr = dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const sideClass = t.side === 'BUY' ? 'tag-buy' : 'tag-sell';
    const outcomeClass = t.outcome === 'WIN' ? 'tag-win' : t.outcome === 'LOSS' ? 'tag-loss' : 'tag-pending';
    const pnlClass = t.pnl > 0 ? 'positive' : t.pnl < 0 ? 'negative' : '';
    const pnlStr = t.outcome === 'PENDING' ? '—' : '$' + t.pnl.toFixed(2);

    html += `<tr>
      <td>${timeStr}</td>
      <td>${t.city.toUpperCase()}</td>
      <td class="mono">${t.bracket}</td>
      <td><span class="tag ${sideClass}">${t.side}</span></td>
      <td class="text-right mono">$${t.price.toFixed(3)}</td>
      <td class="text-right mono">$${t.size.toFixed(2)}</td>
      <td class="text-right mono">${t.edge.toFixed(1)}%</td>
      <td class="text-right mono">${(t.forecast * 100).toFixed(1)}%</td>
      <td class="text-right mono ${pnlClass}">${pnlStr}</td>
      <td><span class="tag ${outcomeClass}">${t.outcome}</span></td>
    </tr>`;
  }

  if (filtered.length > 100) {
    html += `<tr><td colspan="10" style="text-align:center;color:var(--dim);padding:12px">Showing 100 of ${filtered.length} trades</td></tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;

  // attach sort handlers
  el.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
      else { sortCol = col; sortDir = col === 'time' ? 'desc' : 'asc'; }
      renderTrades();
    });
  });
}

// ── init ──

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  fetchAll();
  setInterval(fetchAll, 5000);
  document.getElementById('cityFilter').addEventListener('change', renderTrades);
  document.getElementById('outcomeFilter').addEventListener('change', renderTrades);
});
</script>
</body>
</html>
"""


def main():
    server = HTTPServer(("127.0.0.1", PORT), DashboardHandler)
    print(f"Dashboard running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop\n")

    Timer(1.0, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
