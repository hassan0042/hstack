// Technical signal engine.
// Computes indicators from a daily close series and folds them into a 0-100
// score with a plain-English rationale. This is an educational screen, not
// financial advice — the UI carries that disclaimer prominently.

import type { SeriesPoint } from "./sample-data";

export type SignalLabel = "Buy candidate" | "Accumulate" | "Hold" | "Weak";

export interface Signals {
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  mom21: number | null;  // 1-month return, fraction
  mom63: number | null;  // 3-month return, fraction
  volAnn: number | null; // annualized volatility, fraction
  posRange: number;      // position in the series' high/low range, 0..1
  score: number;         // 0..100
  label: SignalLabel;
  rationale: string[];
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  // Wilder's smoothing over the full series for stability
  let avgGain: number | null = null;
  let avgLoss: number | null = null;
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        avgGain = gains / period;
        avgLoss = losses / period;
      }
    } else {
      avgGain = (avgGain! * (period - 1) + gain) / period;
      avgLoss = (avgLoss! * (period - 1) + loss) / period;
    }
  }
  if (avgGain === null || avgLoss === null) return null;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function momentum(closes: number[], lookback: number): number | null {
  if (closes.length < lookback + 1) return null;
  const past = closes[closes.length - 1 - lookback];
  if (past === 0) return null;
  return closes[closes.length - 1] / past - 1;
}

function annualizedVol(closes: number[]): number | null {
  if (closes.length < 21) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export function computeSignals(series: SeriesPoint[]): Signals {
  const closes = series.map((p) => p.close);
  const price = closes[closes.length - 1];
  const hi = Math.max(...closes);
  const lo = Math.min(...closes);

  const s: Signals = {
    rsi14: rsi(closes),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    mom21: momentum(closes, 21),
    mom63: momentum(closes, 63),
    volAnn: annualizedVol(closes),
    posRange: hi === lo ? 0.5 : (price - lo) / (hi - lo),
    score: 0,
    label: "Hold",
    rationale: [],
  };

  let score = 50;
  const why: string[] = [];

  // Trend: price vs 50-day average (±15)
  if (s.sma50 !== null) {
    const gap = price / s.sma50 - 1;
    if (gap > 0.02) {
      score += Math.min(15, gap * 150);
      why.push(`Trading ${pct(gap)} above its 50-day average — uptrend intact`);
    } else if (gap < -0.02) {
      score += Math.max(-15, gap * 150);
      why.push(`Trading ${pct(gap)} below its 50-day average — trend is against it`);
    } else {
      why.push("Sitting on its 50-day average — no clear trend");
    }
  }

  // Momentum: 3-month return (±20)
  if (s.mom63 !== null) {
    score += Math.max(-20, Math.min(20, s.mom63 * 80));
    if (s.mom63 > 0.05) why.push(`Up ${pct(s.mom63)} over the last 3 months`);
    else if (s.mom63 < -0.05) why.push(`Down ${pct(s.mom63)} over the last 3 months`);
  }

  // Short-term momentum confirmation (±5)
  if (s.mom21 !== null && s.mom63 !== null) {
    if (s.mom21 > 0 && s.mom63 > 0) score += 5;
    else if (s.mom21 < 0 && s.mom63 > 0.05) {
      score -= 3;
      why.push(`Pulling back this month (${pct(s.mom21)}) within a longer uptrend`);
    }
  }

  // RSI: reward the healthy band, flag the extremes (±10)
  if (s.rsi14 !== null) {
    if (s.rsi14 >= 45 && s.rsi14 <= 65) {
      score += 8;
      why.push(`RSI ${s.rsi14.toFixed(0)} — steady demand, not overheated`);
    } else if (s.rsi14 > 75) {
      score -= 10;
      why.push(`RSI ${s.rsi14.toFixed(0)} — overbought, a pullback is likelier here`);
    } else if (s.rsi14 < 30) {
      score -= 2;
      why.push(`RSI ${s.rsi14.toFixed(0)} — oversold; watch for a base before buying`);
    }
  }

  // Range position: mid-to-upper is constructive, the very top is chase-y (±7)
  if (s.posRange >= 0.45 && s.posRange <= 0.9) score += 7;
  else if (s.posRange > 0.97) {
    score -= 2;
    why.push("At the very top of its 6-month range — wait for a dip if entering");
  } else if (s.posRange < 0.15) {
    score -= 5;
    why.push("Near the bottom of its 6-month range");
  }

  // Volatility: calmer names score a small bonus (±5)
  if (s.volAnn !== null) {
    if (s.volAnn < 0.25) score += 5;
    else if (s.volAnn > 0.45) {
      score -= 5;
      why.push(`High volatility (${(s.volAnn * 100).toFixed(0)}% annualized) — size positions accordingly`);
    }
  }

  s.score = Math.round(Math.max(0, Math.min(100, score)));
  s.label = s.score >= 70 ? "Buy candidate" : s.score >= 58 ? "Accumulate" : s.score >= 42 ? "Hold" : "Weak";
  s.rationale = why;
  return s;
}
