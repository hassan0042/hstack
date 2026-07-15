// Stock Monitor server — serves the dashboard and a per-market quotes API.
//
//   bun stock-monitor/server.ts          # http://localhost:4780
//   PORT=5000 bun stock-monitor/server.ts
//
// Live data comes from the PSX data portal (Pakistan) and Yahoo Finance (US),
// fetched server-side to avoid browser CORS. Any symbol that fails falls back
// to deterministic sample data, and the response says which source it used.

import { join } from "node:path";
import { MARKETS, type MarketConfig } from "./src/watchlists";
import { generateSeries, type SeriesPoint } from "./src/sample-data";
import { fetchPsxSeries, fetchYahooSeries } from "./src/providers";
import { computeSignals, type Signals } from "./src/signals";

const PORT = Number(process.env.PORT || 4780);
const PUBLIC_DIR = join(import.meta.dir, "public");
const CACHE_TTL_MS = 5 * 60 * 1000;

interface StockPayload {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  hi: number; // series high (~6 months)
  lo: number; // series low
  live: boolean;
  dates: string[];
  closes: number[];
  signals: Signals;
}

interface MarketPayload {
  market: string;
  label: string;
  currency: string;
  currencySymbol: string;
  indexName: string;
  source: "live" | "sample" | "mixed";
  asOf: string;
  stocks: StockPayload[];
}

const cache = new Map<string, { at: number; payload: MarketPayload }>();

function toStockPayload(cfg: MarketConfig, i: number, series: SeriesPoint[], live: boolean): StockPayload {
  const entry = cfg.stocks[i];
  const closes = series.map((p) => p.close);
  const price = closes[closes.length - 1];
  const prev = closes.length > 1 ? closes[closes.length - 2] : price;
  return {
    symbol: entry.symbol,
    name: entry.name,
    sector: entry.sector,
    price,
    change: Number((price - prev).toFixed(2)),
    changePct: prev ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0,
    volume: series[series.length - 1].volume,
    hi: Math.max(...closes),
    lo: Math.min(...closes),
    live,
    dates: series.map((p) => p.date),
    closes,
    signals: computeSignals(series),
  };
}

async function buildMarketPayload(cfg: MarketConfig): Promise<MarketPayload> {
  const fetcher = cfg.id === "psx" ? fetchPsxSeries : fetchYahooSeries;
  const results = await Promise.all(
    cfg.stocks.map(async (entry, i) => {
      const live = await fetcher(entry.symbol);
      return toStockPayload(cfg, i, live ?? generateSeries(entry), live !== null);
    })
  );
  const liveCount = results.filter((r) => r.live).length;
  return {
    market: cfg.id,
    label: cfg.label,
    currency: cfg.currency,
    currencySymbol: cfg.currencySymbol,
    indexName: cfg.indexName,
    source: liveCount === results.length ? "live" : liveCount === 0 ? "sample" : "mixed",
    asOf: new Date().toISOString(),
    stocks: results,
  };
}

async function getMarket(id: string, force: boolean): Promise<MarketPayload | null> {
  const cfg = MARKETS[id];
  if (!cfg) return null;
  const hit = cache.get(id);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;
  const payload = await buildMarketPayload(cfg);
  cache.set(id, { at: Date.now(), payload });
  return payload;
}

const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/market/")) {
      const id = url.pathname.split("/")[3] ?? "";
      const force = url.searchParams.get("refresh") === "1";
      const payload = await getMarket(id, force);
      if (!payload) return Response.json({ error: `unknown market: ${id}` }, { status: 404 });
      return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    // Static files (no traversal: resolve within PUBLIC_DIR only)
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    if (rel.includes("..")) return new Response("Bad request", { status: 400 });
    const file = Bun.file(join(PUBLIC_DIR, rel));
    if (await file.exists()) {
      const ext = rel.slice(rel.lastIndexOf("."));
      return new Response(file, { headers: { "Content-Type": STATIC_TYPES[ext] ?? "application/octet-stream" } });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Stock Monitor running at http://localhost:${PORT}`);
