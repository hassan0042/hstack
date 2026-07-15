// Deterministic sample time-series generator.
// Used when live market feeds are unreachable (offline dev, blocked network).
// Seeded per symbol + calendar date, so a given day always renders the same
// data — refreshing the page doesn't reshuffle the market.

import type { WatchlistEntry } from "./watchlists";

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  close: number;
  volume: number;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: two uniforms -> one standard normal
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Generate ~`tradingDays` of daily closes ending at the most recent weekday.
 * Geometric random walk with the entry's drift/vol, seeded deterministically.
 */
export function generateSeries(entry: WatchlistEntry, tradingDays = 126): SeriesPoint[] {
  const today = new Date();
  const dayKey = today.toISOString().slice(0, 10);
  const rand = mulberry32(hashString(`${entry.symbol}:${dayKey}`));

  // Collect trading dates going backwards, then walk forwards.
  const dates: string[] = [];
  const cursor = new Date(today);
  while (dates.length < tradingDays) {
    if (!isWeekend(cursor)) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  dates.reverse();

  const dt = 1 / 252; // one trading day in years
  const sigma = entry.vol * Math.sqrt(dt);
  const mu = (entry.drift - 0.5 * entry.vol * entry.vol) * dt;

  // Walk backwards from basePrice so the series ENDS near the realistic level.
  const returns: number[] = [];
  for (let i = 0; i < tradingDays - 1; i++) returns.push(mu + sigma * gaussian(rand));
  const totalLog = returns.reduce((a, b) => a + b, 0);
  let price = entry.basePrice / Math.exp(totalLog);

  const baseVolume = Math.round(80_000_000 / Math.sqrt(entry.basePrice));
  const points: SeriesPoint[] = [];
  for (let i = 0; i < tradingDays; i++) {
    if (i > 0) price *= Math.exp(returns[i - 1]);
    const volNoise = 0.5 + rand() * 1.2 + Math.abs(i > 0 ? returns[i - 1] : 0) * 25;
    points.push({
      date: dates[i],
      close: Number(price.toFixed(2)),
      volume: Math.round(baseVolume * volNoise),
    });
  }
  return points;
}
