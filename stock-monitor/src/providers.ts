// Live market-data fetchers.
// PSX: the exchange's own data portal (dps.psx.com.pk) — free, no key.
// US:  Yahoo Finance chart API — free, no key.
// Every fetcher returns null on any failure; the server falls back to
// deterministic sample data per symbol so the dashboard always renders.

import type { SeriesPoint } from "./sample-data";

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; stock-monitor/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network down, host blocked, timeout — all mean "use sample data".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PSX data portal end-of-day timeseries.
 * Shape: { status: 1, data: [[unixSeconds, price, volume], ...] }
 * Row order is not guaranteed; we sort ascending by timestamp.
 */
export async function fetchPsxSeries(symbol: string): Promise<SeriesPoint[] | null> {
  const json = (await fetchJson(`https://dps.psx.com.pk/timeseries/eod/${encodeURIComponent(symbol)}`)) as
    | { status?: number; data?: [number, number, number][] }
    | null;
  if (!json || json.status !== 1 || !Array.isArray(json.data) || json.data.length < 30) return null;

  const rows = [...json.data]
    .filter((r) => Array.isArray(r) && r.length >= 2 && r[1] > 0)
    .sort((a, b) => a[0] - b[0])
    .slice(-130);
  if (rows.length < 30) return null;

  return rows.map(([ts, price, volume]) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    close: Number(price),
    volume: Number(volume ?? 0),
  }));
}

/**
 * Yahoo Finance daily chart, ~6 months.
 * Shape: chart.result[0] = { timestamp: [...], indicators: { quote: [{ close, volume }] } }
 */
export async function fetchYahooSeries(symbol: string): Promise<SeriesPoint[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
  const json = (await fetchJson(url)) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> } }> };
  } | null;
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote?.close || timestamps.length < 30) return null;

  const points: SeriesPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close[i];
    if (close === null || close === undefined) continue; // holiday / partial rows
    points.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      close: Number(close.toFixed(2)),
      volume: Number(quote.volume?.[i] ?? 0),
    });
  }
  return points.length >= 30 ? points : null;
}
