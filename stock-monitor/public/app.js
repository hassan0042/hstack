/* Stock Monitor frontend.
   Charts are hand-rolled SVG following the dataviz mark specs:
   2px lines with round caps, ~10% area wash, hairline solid gridlines,
   >=8px end markers with a 2px surface ring, crosshair + tooltip on hover. */

"use strict";

const state = {
  market: "psx",
  data: {},          // market id -> payload
  sort: { key: "score", dir: -1 },
  selected: null,    // symbol
  loading: false,
};

const $ = (sel) => document.querySelector(sel);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ── Formatting ─────────────────────────────────────── */

function fmtNum(x, dp = 2) {
  return x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtPrice(x, cur) {
  return `${cur}${fmtNum(x, x >= 1000 ? 0 : 2)}`;
}
function fmtCompact(x) {
  if (x >= 1e9) return (x / 1e9).toFixed(1) + "B";
  if (x >= 1e6) return (x / 1e6).toFixed(1) + "M";
  if (x >= 1e3) return (x / 1e3).toFixed(0) + "K";
  return String(Math.round(x));
}
function fmtPct(x, signed = true) {
  const s = signed && x > 0 ? "+" : "";
  return `${s}${x.toFixed(2)}%`;
}
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/* ── Data ───────────────────────────────────────────── */

async function loadMarket(id, refresh = false) {
  state.loading = true;
  renderLoading();
  try {
    const res = await fetch(`/api/market/${id}${refresh ? "?refresh=1" : ""}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    state.data[id] = await res.json();
  } catch (err) {
    $("#kpi-row").innerHTML = `<div class="panel loading">Could not load market data (${err.message}). Is the server running?</div>`;
    state.loading = false;
    return;
  }
  state.loading = false;
  const stocks = state.data[id].stocks;
  if (!state.selected || !stocks.some((s) => s.symbol === state.selected)) {
    state.selected = [...stocks].sort((a, b) => b.signals.score - a.signals.score)[0]?.symbol ?? null;
  }
  renderAll();
}

function current() {
  return state.data[state.market];
}

/* Equal-weight index of the watchlist, normalized to 100 at window start. */
function indexSeries(stocks) {
  const minLen = Math.min(...stocks.map((s) => s.closes.length));
  const n = Math.min(minLen, 126);
  const out = new Array(n).fill(0);
  for (const s of stocks) {
    const win = s.closes.slice(-n);
    const base = win[0];
    for (let i = 0; i < n; i++) out[i] += win[i] / base;
  }
  return out.map((v) => (v / stocks.length) * 100);
}

/* ── SVG helpers ────────────────────────────────────── */

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function linePath(values, x, y) {
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
}

/* Small trend sparkline: de-emphasis (muted) line, series-accent end dot. */
function sparkline(values, w = 88, h = 26) {
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, "aria-hidden": "true" });
  if (values.length < 2) return svg;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = 3;
  const x = (i) => pad + (i / (values.length - 1)) * (w - pad * 2 - 4);
  const y = (v) => (hi === lo ? h / 2 : pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2));
  svg.appendChild(svgEl("path", {
    d: linePath(values, x, y),
    fill: "none", stroke: cssVar("--text-muted"), "stroke-width": 1.5,
    "stroke-linecap": "round", "stroke-linejoin": "round",
  }));
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);
  svg.appendChild(svgEl("circle", { cx: lastX, cy: lastY, r: 4, fill: cssVar("--surface-1") }));
  svg.appendChild(svgEl("circle", { cx: lastX, cy: lastY, r: 2.5, fill: cssVar("--series-1") }));
  return svg;
}

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = mult * step;
  const start = Math.ceil(lo / s) * s;
  const ticks = [];
  for (let v = start; v <= hi + 1e-9; v += s) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/* Full detail chart: gridlines, y ticks, month ticks, area wash, 2px line,
   end dot + ring, crosshair with tooltip. Single series -> no legend box. */
function detailChart(container, stock, cur) {
  container.innerHTML = "";
  const values = stock.closes;
  const dates = stock.dates;
  const W = 920, H = 280;
  const m = { top: 14, right: 84, bottom: 26, left: 8 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const padV = (hi - lo) * 0.06 || hi * 0.02;
  const yLo = lo - padV, yHi = hi + padV;

  const x = (i) => m.left + (i / (values.length - 1)) * (W - m.left - m.right);
  const y = (v) => m.top + (1 - (v - yLo) / (yHi - yLo)) * (H - m.top - m.bottom);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${stock.symbol} closing price, last 6 months` });

  // gridlines + y tick labels (right side, under the end-label area)
  for (const t of niceTicks(yLo, yHi)) {
    svg.appendChild(svgEl("line", { x1: m.left, x2: W - m.right, y1: y(t), y2: y(t), stroke: cssVar("--grid"), "stroke-width": 1 }));
    const label = svgEl("text", { x: W - m.right + 8, y: y(t) + 3.5, "font-size": 11, fill: cssVar("--text-muted"), style: "font-variant-numeric: tabular-nums" });
    label.textContent = t.toLocaleString("en-US");
    svg.appendChild(label);
  }

  // month labels along the x axis
  let lastMonth = "";
  dates.forEach((d, i) => {
    const mo = d.slice(0, 7);
    if (mo !== lastMonth && i > 2 && i < dates.length - 4) {
      lastMonth = mo;
      const t = svgEl("text", { x: x(i), y: H - 8, "font-size": 11, fill: cssVar("--text-muted"), "text-anchor": "middle" });
      t.textContent = new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
      svg.appendChild(t);
    } else if (mo === lastMonth) { /* same month */ } else { lastMonth = mo; }
  });

  // baseline
  svg.appendChild(svgEl("line", { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom, stroke: cssVar("--baseline"), "stroke-width": 1 }));

  // area wash (~10% of series hue)
  const areaD = linePath(values, x, y) + `L${x(values.length - 1)},${H - m.bottom}L${x(0)},${H - m.bottom}Z`;
  svg.appendChild(svgEl("path", { d: areaD, fill: cssVar("--series-1"), opacity: 0.1 }));

  // the line
  svg.appendChild(svgEl("path", {
    d: linePath(values, x, y), fill: "none", stroke: cssVar("--series-1"),
    "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
  }));

  // end marker: >=8px dot with a 2px surface ring, plus the end label
  const ex = x(values.length - 1), ey = y(values[values.length - 1]);
  svg.appendChild(svgEl("circle", { cx: ex, cy: ey, r: 6.5, fill: cssVar("--surface-1") }));
  svg.appendChild(svgEl("circle", { cx: ex, cy: ey, r: 4.5, fill: cssVar("--series-1") }));
  const endLabel = svgEl("text", { x: ex + 10, y: ey + 4, "font-size": 12.5, "font-weight": 650, fill: cssVar("--text-primary"), style: "font-variant-numeric: tabular-nums" });
  endLabel.textContent = fmtPrice(values[values.length - 1], cur);
  svg.appendChild(endLabel);

  // crosshair layer
  const cross = svgEl("g", { visibility: "hidden" });
  const vline = svgEl("line", { y1: m.top, y2: H - m.bottom, stroke: cssVar("--baseline"), "stroke-width": 1 });
  const dotRing = svgEl("circle", { r: 6, fill: cssVar("--surface-1") });
  const dot = svgEl("circle", { r: 4, fill: cssVar("--series-1") });
  cross.append(vline, dotRing, dot);
  svg.appendChild(cross);

  const tooltip = $("#tooltip");
  const hit = svgEl("rect", { x: m.left, y: 0, width: W - m.left - m.right, height: H, fill: "transparent" });
  hit.addEventListener("pointermove", (ev) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(((relX - m.left) / (W - m.left - m.right)) * (values.length - 1))));
    const cx = x(i), cy = y(values[i]);
    vline.setAttribute("x1", cx); vline.setAttribute("x2", cx);
    dotRing.setAttribute("cx", cx); dotRing.setAttribute("cy", cy);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
    cross.setAttribute("visibility", "visible");
    const prev = i > 0 ? values[i - 1] : values[i];
    const dPct = prev ? ((values[i] - prev) / prev) * 100 : 0;
    tooltip.innerHTML =
      `<div class="tt-date">${fmtDate(dates[i])}</div>` +
      `<div class="tt-price">${fmtPrice(values[i], cur)}</div>` +
      `<div class="tt-delta ${dPct >= 0 ? "up" : "down"}">${fmtPct(dPct)} vs prior day</div>`;
    tooltip.hidden = false;
    const tw = tooltip.offsetWidth;
    const px = ev.clientX + 14 + tw > window.innerWidth ? ev.clientX - tw - 14 : ev.clientX + 14;
    tooltip.style.left = `${px}px`;
    tooltip.style.top = `${ev.clientY - 10}px`;
  });
  hit.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  });
  svg.appendChild(hit);

  container.appendChild(svg);
}

/* ── Renderers ──────────────────────────────────────── */

function renderLoading() {
  if (!current()) $("#kpi-row").innerHTML = `<div class="panel loading">Loading market data…</div>`;
}

function statTile({ label, value, unit, delta, deltaClass, vs, spark }) {
  const tile = document.createElement("div");
  tile.className = "stat-tile";
  tile.innerHTML =
    `<span class="stat-label">${label}</span>` +
    `<span class="stat-value">${value}${unit ? ` <span class="unit">${unit}</span>` : ""}</span>` +
    (delta ? `<span class="stat-delta ${deltaClass}">${delta}${vs ? ` <span class="vs">${vs}</span>` : ""}</span>` : "");
  if (spark) {
    const holder = document.createElement("div");
    holder.className = "stat-spark";
    holder.appendChild(spark);
    tile.appendChild(holder);
  }
  return tile;
}

function renderKpis(d) {
  const row = $("#kpi-row");
  row.innerHTML = "";
  const idx = indexSeries(d.stocks);
  const idxNow = idx[idx.length - 1];
  const idxPrev = idx[idx.length - 2];
  const idxPct = ((idxNow - idxPrev) / idxPrev) * 100;
  const first = idx[0];
  const sixMoPct = ((idxNow - first) / first) * 100;

  row.appendChild(statTile({
    label: `${d.indexName} — equal-weight, 6 mo = 100 at start`,
    value: fmtNum(idxNow, 1),
    delta: `${fmtPct(idxPct)} today · ${fmtPct(sixMoPct)} over 6 mo`,
    deltaClass: idxPct >= 0 ? "up" : "down",
    spark: sparkline(idx.slice(-60), 180, 32),
  }));

  const ups = d.stocks.filter((s) => s.changePct > 0).length;
  const downs = d.stocks.filter((s) => s.changePct < 0).length;
  row.appendChild(statTile({
    label: "Market breadth today",
    value: `${ups} <span class="unit">up</span> · ${downs} <span class="unit">down</span>`,
    delta: ups >= downs ? "Advancers lead" : "Decliners lead",
    deltaClass: ups >= downs ? "up" : "down",
    vs: `of ${d.stocks.length} watched`,
  }));

  const byChg = [...d.stocks].sort((a, b) => b.changePct - a.changePct);
  const g = byChg[0], l = byChg[byChg.length - 1];
  row.appendChild(statTile({
    label: `Top gainer — ${g.name}`,
    value: g.symbol,
    delta: `${fmtPct(g.changePct)} to ${fmtPrice(g.price, d.currencySymbol)}`,
    deltaClass: "up",
  }));
  row.appendChild(statTile({
    label: `Top decliner — ${l.name}`,
    value: l.symbol,
    delta: `${fmtPct(l.changePct)} to ${fmtPrice(l.price, d.currencySymbol)}`,
    deltaClass: l.changePct >= 0 ? "up" : "down",
  }));
}

const CHIP = {
  "Buy candidate": { cls: "chip-buy", ico: "▲", short: "Buy" },
  "Accumulate": { cls: "chip-acc", ico: "◆", short: "Accumulate" },
  "Hold": { cls: "chip-hold", ico: "●", short: "Hold" },
  "Weak": { cls: "chip-weak", ico: "▼", short: "Weak" },
};
function chipHtml(label, short = false) {
  const c = CHIP[label];
  return `<span class="chip ${c.cls}"><span class="chip-ico" aria-hidden="true">${c.ico}</span>${short ? c.short : label}</span>`;
}

const COLUMNS = [
  { key: "symbol", label: "Symbol", get: (s) => s.symbol, str: true },
  { key: "price", label: "Price", get: (s) => s.price },
  { key: "changePct", label: "1D %", get: (s) => s.changePct },
  { key: "mom63", label: "3M %", get: (s) => s.signals.mom63 ?? 0 },
  { key: "volume", label: "Volume", get: (s) => s.volume },
  { key: "rsi", label: "RSI 14", get: (s) => s.signals.rsi14 ?? 0 },
  { key: "trend", label: "6M trend", get: null },
  { key: "score", label: "Score", get: (s) => s.signals.score },
  { key: "label", label: "Signal", get: (s) => s.signals.score },
];

function renderTable(d) {
  const thead = $("#stock-table thead");
  const tbody = $("#stock-table tbody");
  thead.innerHTML = "";
  const tr = document.createElement("tr");
  for (const col of COLUMNS) {
    const th = document.createElement("th");
    const active = state.sort.key === col.key;
    th.innerHTML = `${col.label}${active ? ` <span class="arrow">${state.sort.dir < 0 ? "▼" : "▲"}</span>` : ""}`;
    if (col.get) th.addEventListener("click", () => {
      state.sort = { key: col.key, dir: active ? -state.sort.dir : col.str ? 1 : -1 };
      renderTable(current());
    });
    tr.appendChild(th);
  }
  thead.appendChild(tr);

  const col = COLUMNS.find((c) => c.key === state.sort.key) ?? COLUMNS[7];
  const rows = [...d.stocks].sort((a, b) => {
    const av = col.get(a), bv = col.get(b);
    return (col.str ? String(av).localeCompare(String(bv)) : av - bv) * state.sort.dir;
  });

  tbody.innerHTML = "";
  for (const s of rows) {
    const trEl = document.createElement("tr");
    if (s.symbol === state.selected) trEl.classList.add("selected");
    const sig = s.signals;
    trEl.innerHTML =
      `<td><span class="sym">${s.symbol}</span><span class="sym-name">${s.name} · ${s.sector}</span></td>` +
      `<td>${fmtPrice(s.price, d.currencySymbol)}</td>` +
      `<td class="${s.changePct >= 0 ? "up" : "down"}">${fmtPct(s.changePct)}</td>` +
      `<td class="${(sig.mom63 ?? 0) >= 0 ? "up" : "down"}">${sig.mom63 == null ? "—" : fmtPct(sig.mom63 * 100)}</td>` +
      `<td>${fmtCompact(s.volume)}</td>` +
      `<td>${sig.rsi14 == null ? "—" : sig.rsi14.toFixed(0)}</td>` +
      `<td class="spark-cell"></td>` +
      `<td><span class="score-cell"><span class="score-meter"><i style="width:${sig.score}%"></i></span>${sig.score}</span></td>` +
      `<td>${chipHtml(sig.label, true)}</td>`;
    trEl.querySelector(".spark-cell").appendChild(sparkline(s.closes.slice(-60)));
    trEl.addEventListener("click", () => {
      state.selected = s.symbol;
      renderTable(d);
      renderDetail(d);
    });
    tbody.appendChild(trEl);
  }
}

function renderDetail(d) {
  const s = d.stocks.find((x) => x.symbol === state.selected) ?? d.stocks[0];
  if (!s) return;
  $("#detail-title").textContent = `${s.symbol} — ${s.name}`;
  const sig = s.signals;
  $("#detail-sub").textContent =
    `${fmtPrice(s.price, d.currencySymbol)} · ${fmtPct(s.changePct)} today · ` +
    `6-mo range ${fmtPrice(s.lo, d.currencySymbol)} – ${fmtPrice(s.hi, d.currencySymbol)}` +
    (sig.rsi14 != null ? ` · RSI ${sig.rsi14.toFixed(0)}` : "") +
    (s.live ? "" : " · sample data");
  detailChart($("#detail-chart"), s, d.currencySymbol);
}

function renderSuggestions(d) {
  const ranked = [...d.stocks].sort((a, b) => b.signals.score - a.signals.score);
  const picks = ranked.filter((s) => s.signals.score >= 58).slice(0, 3);
  const box = $("#suggestions");
  box.innerHTML = "";
  if (picks.length === 0) {
    box.innerHTML = `<p class="empty-note">No strong technical setups on this watchlist today. Sitting out is a position too.</p>`;
  }
  picks.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "sugg";
    const why = s.signals.rationale.slice(0, 3).map((r) => `<li>${r}</li>`).join("");
    div.innerHTML =
      `<div class="sugg-head"><span class="sugg-rank">${i + 1}</span>` +
      `<span class="sugg-sym">${s.symbol}</span><span class="sugg-name">${s.name}</span>` +
      `<span class="sugg-score">${s.signals.score}/100</span></div>` +
      `<div>${chipHtml(s.signals.label)}</div>` +
      `<ul>${why || "<li>Broadly steady across trend, momentum and RSI.</li>"}</ul>`;
    div.style.cursor = "pointer";
    div.addEventListener("click", () => {
      state.selected = s.symbol;
      renderTable(d);
      renderDetail(d);
    });
    box.appendChild(div);
  });

  const cautions = ranked.filter((s) => s.signals.score < 45).slice(-2).reverse();
  const cbox = $("#cautions");
  cbox.innerHTML = "";
  if (cautions.length === 0) cbox.innerHTML = `<p class="empty-note">Nothing flashing red on this watchlist right now.</p>`;
  for (const s of cautions) {
    const div = document.createElement("div");
    div.className = "sugg";
    const why = s.signals.rationale.slice(0, 2).map((r) => `<li>${r}</li>`).join("");
    div.innerHTML =
      `<div class="sugg-head"><span class="sugg-sym">${s.symbol}</span>` +
      `<span class="sugg-name">${s.name}</span><span class="sugg-score">${s.signals.score}/100</span></div>` +
      `<div>${chipHtml(s.signals.label)}</div><ul>${why}</ul>`;
    cbox.appendChild(div);
  }
}

function renderMeta(d) {
  const badge = $("#source-badge");
  const cfg = {
    live: { color: "var(--status-good)", text: "Live data" },
    mixed: { color: "var(--status-warning)", text: "Partial live data" },
    sample: { color: "var(--status-warning)", text: "Sample data (feeds unreachable)" },
  }[d.source];
  badge.innerHTML = `<span class="dot" style="background:${cfg.color}"></span>${cfg.text}`;
  badge.hidden = false;
  badge.title = d.source === "live"
    ? "All quotes fetched from the exchange feed."
    : "Some or all quotes are deterministic sample data because the live feed was unreachable. Prices shown are NOT real.";
  $("#as-of").textContent = `Updated ${new Date(d.asOf).toLocaleString()} · ${d.label} · prices in ${d.currency}`;
}

function renderAll() {
  const d = current();
  if (!d) return;
  renderKpis(d);
  renderTable(d);
  renderDetail(d);
  renderSuggestions(d);
  renderMeta(d);
}

/* ── Wiring ─────────────────────────────────────────── */

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", String(b === btn));
    });
    state.market = btn.dataset.market;
    state.selected = null;
    if (state.data[state.market]) {
      const stocks = state.data[state.market].stocks;
      state.selected = [...stocks].sort((a, b) => b.signals.score - a.signals.score)[0]?.symbol ?? null;
      renderAll();
    } else {
      loadMarket(state.market);
    }
  });
});

$("#refresh-btn").addEventListener("click", () => loadMarket(state.market, true));

$("#theme-btn").addEventListener("click", () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = isDark ? "light" : "dark";
  renderAll(); // charts read CSS vars at render time
});

// Deep-linking: /?market=us&theme=dark (theme param also aids screenshot tests)
const params = new URLSearchParams(location.search);
const themeParam = params.get("theme");
if (themeParam === "dark" || themeParam === "light") document.documentElement.dataset.theme = themeParam;
const marketParam = params.get("market");
if (marketParam && ["psx", "us"].includes(marketParam)) {
  state.market = marketParam;
  document.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.market === marketParam;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
}

loadMarket(state.market);
