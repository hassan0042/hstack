# Stock Monitor

A self-contained dashboard for watching Pakistani (PSX) and US stocks side by
side, with a technical screen that ranks the watchlist and explains, in plain
English, which names look investable right now.

![tabs](docs-tabs.png)

## Run it

```bash
bun stock-monitor/server.ts
# open http://localhost:4780
```

No dependencies beyond Bun. `PORT=5000 bun stock-monitor/server.ts` to change the port.

## What you get

- **Two market tabs** — Pakistan (PSX) and United States — each with its own
  watchlist, currency, and index.
- **KPI row** — an equal-weight watchlist index with a 6-month sparkline,
  today's market breadth (advancers vs decliners), and the day's top
  gainer/decliner.
- **Watchlist table** — price, 1-day and 3-month change, volume, RSI-14, a
  6-month trend sparkline, a composite 0–100 score, and a signal chip
  (Buy candidate / Accumulate / Hold / Weak). Click any column header to sort,
  click a row to chart it.
- **Detail chart** — 6 months of daily closes with a crosshair tooltip
  (date, price, day-over-day change).
- **"Where the signals point"** — the top-ranked names with the reasons spelled
  out ("Trading +6.2% above its 50-day average", "RSI 78 — overbought"), plus a
  "Treat with caution" list for the weakest names.
- **Light and dark theme**, following your OS setting with a manual toggle.

## Where the data comes from

| Market | Live source | Notes |
|--------|-------------|-------|
| PSX | `dps.psx.com.pk` (the exchange's own data portal) | Free, no API key |
| US | Yahoo Finance chart API | Free, no API key |

Quotes are fetched **server-side** (no browser CORS issues) and cached for
5 minutes. The Refresh button forces a refetch.

**Offline fallback:** any symbol whose live feed fails falls back to
deterministic sample data (seeded per symbol per day, so it doesn't reshuffle
on reload). The header badge tells you which mode you're in — *Live data*,
*Partial live data*, or *Sample data*. Sample prices are clearly flagged and
are NOT real.

## How the score works

Each stock gets a 0–100 composite from price history alone:

| Factor | Weight | What it rewards |
|--------|--------|-----------------|
| Trend | ±15 | Price above a rising 50-day average |
| 3-month momentum | ±20 | Sustained gains, penalizes sustained losses |
| Momentum confirmation | ±5 | 1-month agreeing with 3-month |
| RSI-14 | ±10 | The healthy 45–65 band; penalizes overbought >75 |
| Range position | ±7 | Mid-to-upper 6-month range; penalizes chasing the very top |
| Volatility | ±5 | Calmer names; penalizes >45% annualized |

Score ≥ 70 → **Buy candidate**, 58–69 → **Accumulate**, 42–57 → **Hold**,
< 42 → **Weak**. Every suggestion lists the factors that drove it.

**This is not financial advice.** The screen sees prices only — no earnings,
no news, no macro. It's a starting point for your own research, not a
replacement for it.

## Customizing the watchlists

Edit `src/watchlists.ts`. Each entry has the symbol, display name, sector, and
sample-data parameters (`basePrice`, `drift`, `vol`) used only when live feeds
are unreachable.

## Layout

```
stock-monitor/
├── server.ts            # Bun server: static files + /api/market/:id
├── src/
│   ├── watchlists.ts    # PSX + US watchlist definitions
│   ├── providers.ts     # Live fetchers (PSX portal, Yahoo Finance)
│   ├── sample-data.ts   # Deterministic offline fallback series
│   └── signals.ts       # RSI / SMA / momentum / scoring engine
└── public/
    ├── index.html
    ├── styles.css       # Light + dark theme, validated dataviz palette
    └── app.js           # Rendering + hand-rolled SVG charts
```
