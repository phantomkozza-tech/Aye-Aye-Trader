// ============================================================
// Aye Aye Trader — Trade Import Engine (TypeScript port from index.html)
// Parsers: TopstepX, Quantower, Motivewave, Sierra Chart
// ============================================================

/* ---------- Point value table -------------------------------------------- */
const POINT_VALUE: Record<string, number> = {
  ES: 50,  MES: 5,
  NQ: 20,  MNQ: 2,
  RTY: 50, M2K: 5,
  YM: 5,   MYM: 0.5,
  CL: 1000, MCL: 100,
  GC: 100,  MGC: 10,
  SI: 5000,
  NG: 10000,
  ZB: 1000, ZN: 1000, ZF: 1000,
  "6E": 125000, "6J": 12500000,
};

const ROOTS = Object.keys(POINT_VALUE).sort((a, b) => b.length - a.length);

const PRICE_BAND: Record<string, [number, number]> = {
  ES: [1000, 9000],  MES: [1000, 9000],
  NQ: [5000, 45000], MNQ: [5000, 45000],
  RTY: [800, 5000],  M2K: [800, 5000],
  YM: [20000, 60000], MYM: [20000, 60000],
  GC: [800, 9000],   MGC: [800, 9000],
  CL: [5, 250],      MCL: [5, 250],
  SI: [5, 100],
  NG: [0.5, 20],
  ZB: [80, 200], ZN: [80, 200], ZF: [80, 200],
};

function autoScalePrice(root: string, price: number): number {
  const band = PRICE_BAND[root];
  if (!band || !Number.isFinite(price)) return price;
  for (const div of [1, 10, 100, 1000, 10000]) {
    const v = price / div;
    if (v >= band[0] && v <= band[1]) return v;
  }
  return price;
}

/* ---------- Helpers ------------------------------------------------------- */
function stripBOM(s: string): string {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toRows(text: string, delim: string): string[][] {
  return stripBOM(text)
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n").filter((l) => l.length > 0)
    .map((l) => splitLine(l, delim));
}

function num(v: any): number {
  if (v == null) return NaN;
  const n = parseFloat(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function rootOf(symbol: string): string {
  if (!symbol) return "";
  let s = symbol.toUpperCase().split("_")[0];
  for (const r of ROOTS) if (s.startsWith(r)) return r;
  const m = s.match(/^[A-Z0-9]{1,3}?(?=[FGHJKMNQUVXZ]\d)/);
  return m ? m[0] : s;
}

function pointValue(symbol: string): number | null {
  const r = rootOf(symbol);
  return POINT_VALUE[r] || null;
}

function p2(v: any): string { return String(v).padStart(2, "0"); }

/* ---------- Date normalizers --------------------------------------------- */
function isoTopstep(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([+-]\d{2}:\d{2})?/);
  if (!m) return s;
  const [, mo, d, y, h, mi, se, tz] = m;
  return `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${mi}:${se}${tz || ""}`;
}

function isoMotivewave(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?([+-]\d{4})?/);
  if (!m) return s;
  const [, mo, d, y, h, mi, se, ms, tz] = m;
  const off = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "";
  return `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${mi}:${se}${ms ? "." + ms.slice(0, 3) : ""}${off}`;
}

function isoQuantower(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  let [, d, mo, y, h, mi, se] = m;
  if (y.length === 2) y = "20" + y;
  return `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${mi}:${se}`;
}

function isoSierra(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!m) return s;
  const [, y, mo, d, h, mi, se, frac] = m;
  return `${y}-${mo}-${d}T${p2(h)}:${mi}:${se}${frac ? "." + frac.slice(0, 3) : ""}`;
}

/* ---------- Position-cycle tracker --------------------------------------- */
interface Fill {
  qty: number;
  price: number;
  time: string | null;
  pnl?: number;
  fee?: number;
}

interface Cycle {
  entryQty: number; entryNotional: number;
  exitQty: number;  exitNotional: number;
  pnl: number; fee: number; havePnl: boolean;
  firstTime: string | null; lastTime: string | null; dirSign: number;
}

interface ParseCtx {
  source: string;
  root: string;
  contract: string;
  pointValue: number | null;
}

export interface ParsedTrade {
  source: string;
  symbol: string;
  contract: string;
  direction: "Long" | "Short";
  entryTime: string | null;
  exitTime: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  size: number;
  grossPnL: number | null;
  fees: number | null;
  netPnL: number | null;
  open?: boolean;
}

function round(n: number, d: number): number | null {
  if (!Number.isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function finalize(cyc: Cycle, ctx: ParseCtx, open: boolean): ParsedTrade {
  const entryPrice = cyc.entryQty ? cyc.entryNotional / cyc.entryQty : NaN;
  const exitPrice  = cyc.exitQty  ? cyc.exitNotional  / cyc.exitQty  : NaN;
  const size = cyc.entryQty || cyc.exitQty;
  const dir = cyc.dirSign >= 0 ? "Long" : "Short";

  let grossPnl: number, netPnl: number;
  if (cyc.havePnl) {
    netPnl = cyc.pnl;
    grossPnl = cyc.pnl + cyc.fee;
  } else {
    const pv = ctx.pointValue;
    if (pv && Number.isFinite(entryPrice) && Number.isFinite(exitPrice) && !open) {
      const dirMul = cyc.dirSign >= 0 ? 1 : -1;
      grossPnl = (exitPrice - entryPrice) * pv * cyc.exitQty * dirMul;
      netPnl = grossPnl - cyc.fee;
    } else {
      grossPnl = NaN; netPnl = NaN;
    }
  }

  return {
    source: ctx.source,
    symbol: ctx.root,
    contract: ctx.contract,
    direction: dir,
    entryTime: cyc.firstTime,
    exitTime: open ? null : cyc.lastTime,
    entryPrice: round(entryPrice, 4),
    exitPrice: open ? null : round(exitPrice, 4),
    size,
    grossPnL: round(grossPnl, 2),
    fees: round(cyc.fee, 2),
    netPnL: round(netPnl, 2),
    open: open || undefined,
  };
}

function buildTradesFromFills(fills: Fill[], ctx: ParseCtx): ParsedTrade[] {
  fills = [...fills].sort((a, b) => (Date.parse(a.time ?? "") || 0) - (Date.parse(b.time ?? "") || 0));
  const trades: ParsedTrade[] = [];
  let pos = 0;
  let cyc: Cycle | null = null;

  const startCycle = (): Cycle => ({
    entryQty: 0, entryNotional: 0,
    exitQty: 0, exitNotional: 0,
    pnl: 0, fee: 0, havePnl: false,
    firstTime: null, lastTime: null, dirSign: 0,
  });

  for (const f of fills) {
    if (!Number.isFinite(f.qty) || !Number.isFinite(f.price) || f.qty === 0) continue;
    if (!cyc) { cyc = startCycle(); cyc.dirSign = Math.sign(f.qty); cyc.firstTime = f.time; }
    cyc.lastTime = f.time;

    const before = pos;
    let remaining = f.qty;

    if (before !== 0 && Math.sign(f.qty) !== Math.sign(before)) {
      const closeQty = Math.min(Math.abs(f.qty), Math.abs(before));
      cyc.exitQty += closeQty;
      cyc.exitNotional += closeQty * f.price;
      remaining = f.qty + Math.sign(before) * closeQty;
    } else {
      cyc.entryQty += Math.abs(f.qty);
      cyc.entryNotional += Math.abs(f.qty) * f.price;
      remaining = 0;
    }

    if (Number.isFinite(f.pnl!)) { cyc.pnl += f.pnl!; cyc.havePnl = true; }
    if (Number.isFinite(f.fee!)) cyc.fee += f.fee!;

    pos = before + f.qty;

    if (pos === 0) {
      trades.push(finalize(cyc, ctx, false));
      cyc = null;
    } else if (before !== 0 && Math.sign(pos) !== Math.sign(before)) {
      trades.push(finalize(cyc, ctx, false));
      cyc = startCycle();
      cyc.dirSign = Math.sign(pos);
      cyc.firstTime = f.time; cyc.lastTime = f.time;
      cyc.entryQty = Math.abs(remaining);
      cyc.entryNotional = Math.abs(remaining) * f.price;
    }
  }

  if (cyc) trades.push(finalize(cyc, ctx, true));
  return trades;
}

/* ========================================================================= */
/* PARSER 1 — TopstepX                                                       */
/* ========================================================================= */
function parseTopstep(text: string): ParsedTrade[] {
  const rows = toRows(text, ",");
  const head = rows[0].map((h) => h.toLowerCase());
  const ix = (name: string) => head.indexOf(name.toLowerCase());
  if (ix("positiondisposition") >= 0 && ix("executeprice") >= 0)
    return parseTopstepOrders(rows, head, ix);
  if (ix("enteredat") < 0 || ix("exitedat") < 0 || ix("contractname") < 0) return [];
  const c = {
    sym: ix("ContractName"), inT: ix("EnteredAt"), outT: ix("ExitedAt"),
    inP: ix("EntryPrice"), outP: ix("ExitPrice"),
    fees: ix("Fees"), pnl: ix("PnL"), size: ix("Size"), type: ix("Type"),
    comm: ix("Commissions"),
  };
  const trades: ParsedTrade[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < head.length) continue;
    const fees = (num(r[c.fees]) || 0) + (num(r[c.comm]) || 0);
    const gross = num(r[c.pnl]);
    trades.push({
      source: "TopstepX", symbol: rootOf(r[c.sym]), contract: r[c.sym],
      direction: /short/i.test(r[c.type]) ? "Short" : "Long",
      entryTime: isoTopstep(r[c.inT]), exitTime: isoTopstep(r[c.outT]),
      entryPrice: round(num(r[c.inP]), 4), exitPrice: round(num(r[c.outP]), 4),
      size: num(r[c.size]), grossPnL: round(gross, 2),
      fees: round(fees, 2), netPnL: round(gross - fees, 2),
    });
  }
  return trades;
}

function parseTopstepOrders(rows: string[][], head: string[], ix: (n: string) => number): ParsedTrade[] {
  const bySym: Record<string, Fill[]> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if ((r[ix("Status")] || "").toLowerCase() !== "filled") continue;
    const rawPrice = num(r[ix("ExecutePrice")]);
    if (!Number.isFinite(rawPrice)) continue;
    const rawSize = num(r[ix("Size")]);
    if (!Number.isFinite(rawSize) || rawSize === 0) continue;
    const sign = (r[ix("Side")] || "").toLowerCase() === "bid" ? 1 : -1;
    const sym = r[ix("ContractName")] || "";
    (bySym[sym] = bySym[sym] || []).push({
      qty: sign * Math.abs(rawSize), price: rawPrice,
      time: isoTopstep(r[ix("FilledAt")] || ""),
    });
  }
  let out: ParsedTrade[] = [];
  for (const sym in bySym) {
    out = out.concat(buildTradesFromFills(bySym[sym], {
      source: "TopstepX", root: rootOf(sym), contract: sym, pointValue: pointValue(sym),
    }));
  }
  return out;
}

/* ========================================================================= */
/* PARSER 2 — Quantower                                                      */
/* ========================================================================= */
function parseQuantower(text: string): ParsedTrade[] {
  const rows = toRows(text, ",");
  const head = rows[0].map((h) => h.toLowerCase());
  const ix = (name: string) => head.indexOf(name.toLowerCase());
  if (ix("net p/l") < 0 || ix("symbol type") < 0 || ix("date/time") < 0) return [];
  const c = {
    dt: ix("Date/Time"), sym: ix("Symbol"), side: ix("Side"),
    qty: ix("Quantity"), price: ix("Price"),
    gpl: ix("Gross P/L"), fee: ix("Fee"), npl: ix("Net P/L"),
  };
  const bySym: Record<string, Fill[]> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[c.sym]) continue;
    const sym = r[c.sym];
    (bySym[sym] = bySym[sym] || []).push({
      qty: num(r[c.qty]),
      price: num(r[c.price]),
      time: isoQuantower(r[c.dt]),
      pnl: num(r[c.npl]),
      fee: Math.abs(num(r[c.fee]) || 0),
    });
  }
  let out: ParsedTrade[] = [];
  for (const sym in bySym) {
    out = out.concat(buildTradesFromFills(bySym[sym], {
      source: "Quantower", root: rootOf(sym), contract: sym, pointValue: pointValue(sym),
    }));
  }
  return out;
}

/* ========================================================================= */
/* PARSER 3 — Motivewave                                                     */
/* ========================================================================= */
function parseMotivewave(text: string): ParsedTrade[] {
  const rows = toRows(text, ",");
  const head = rows[0].map((h) => h.toLowerCase());
  const ix = (name: string) => head.indexOf(name.toLowerCase());
  if (ix("fill id") < 0 || ix("underlying") < 0 || ix("action") < 0) return [];
  const c = { sym: ix("Symbol"), time: ix("Time"), action: ix("Action"), qty: ix("Quantity"), price: ix("Price") };
  const bySym: Record<string, Fill[]> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[c.sym]) continue;
    const sign = /^s/i.test(r[c.action]) ? -1 : 1;
    (bySym[r[c.sym]] = bySym[r[c.sym]] || []).push({
      qty: sign * Math.abs(num(r[c.qty])), price: num(r[c.price]),
      time: isoMotivewave(r[c.time]),
    });
  }
  let out: ParsedTrade[] = [];
  for (const sym in bySym) {
    out = out.concat(buildTradesFromFills(bySym[sym], {
      source: "Motivewave", root: rootOf(sym), contract: sym, pointValue: pointValue(sym),
    }));
  }
  return out;
}

/* ========================================================================= */
/* PARSER 4 — Sierra Chart                                                   */
/* ========================================================================= */
function parseSierra(text: string): ParsedTrade[] {
  const rows = toRows(text, "\t");
  const head = rows[0];
  const ix = (name: string) => head.indexOf(name);
  if (ix("OrderStatus") < 0 || ix("FilledQuantity") < 0 || ix("DateTime") < 0) return [];
  const c = {
    dt: ix("DateTime"), sym: ix("Symbol"), bs: ix("BuySell"),
    status: ix("OrderStatus"), fillPrice: ix("FillPrice"), fillQty: ix("FilledQuantity"),
  };
  const bySym: Record<string, Fill[]> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[c.status] !== "Filled") continue;
    const fq = num(r[c.fillQty]);
    if (!Number.isFinite(fq) || fq === 0) continue;
    let price = num(r[c.fillPrice]);
    if (!Number.isFinite(price)) continue;
    const rawSym = r[c.sym];
    const root = rootOf(rawSym);
    price = autoScalePrice(root, price);
    const sign = /^s/i.test(r[c.bs]) ? -1 : 1;
    const key = rawSym.split(/[_.]/)[0];
    (bySym[key] = bySym[key] || []).push({
      qty: sign * Math.abs(fq), price,
      time: isoSierra(r[c.dt]),
    });
  }
  let out: ParsedTrade[] = [];
  for (const sym in bySym) {
    out = out.concat(buildTradesFromFills(bySym[sym], {
      source: "Sierra", root: rootOf(sym), contract: sym, pointValue: pointValue(sym),
    }));
  }
  return out;
}

/* ========================================================================= */
/* DETECTION + DISPATCH                                                      */
/* ========================================================================= */
export type PlatformId = "topstep" | "quantower" | "motivewave" | "sierra" | "__other__";

export const SUPPORTED: { id: PlatformId; label: string; ext: string }[] = [
  { id: "topstep",    label: "TopstepX",     ext: ".csv" },
  { id: "quantower",  label: "Quantower",    ext: ".csv" },
  { id: "motivewave", label: "Motivewave",   ext: ".csv" },
  { id: "sierra",     label: "Sierra Chart", ext: ".txt / .tsv" },
];

export interface ParseResult {
  platform: string;
  trades: ParsedTrade[];
  error?: string;
}

export function parseTradeFile(filename: string, text: string, platformOverride?: string): ParseResult {
  const platform = platformOverride || detectPlatform(filename, text);
  let trades: ParsedTrade[] = [];
  switch (platform) {
    case "topstep":    trades = parseTopstep(text);    break;
    case "quantower":  trades = parseQuantower(text);  break;
    case "motivewave": trades = parseMotivewave(text); break;
    case "sierra":     trades = parseSierra(text);     break;
    default:
      return { platform, trades: [], error: "Unrecognized file format" };
  }
  if (!trades.length)
    return { platform, trades: [], error: "No trades parsed — is this the right platform for this file?" };
  return { platform, trades };
}

export function detectPlatform(filename: string, text: string): string {
  const first = stripBOM(text).split(/\r?\n/)[0] || "";
  const h = first.toLowerCase();
  if (h.includes("\t") && h.includes("orderstatus") && h.includes("filledquantity")) return "sierra";
  if ((h.includes("enteredat") && h.includes("exitedat") && h.includes("contractname")) ||
      (h.includes("positiondisposition") && h.includes("executeprice") && h.includes("filledat"))) return "topstep";
  if (h.includes("net p/l") && h.includes("position id") && h.includes("symbol type")) return "quantower";
  if (h.includes("fill id") && h.includes("underlying") && h.includes("action")) return "motivewave";
  const fn = (filename || "").toLowerCase();
  if (fn.includes("quantower")) return "quantower";
  if (fn.includes("tradeactivitylog")) return "sierra";
  if (/execution/.test(fn)) return "motivewave";
  if (/trades?_export/.test(fn)) return "topstep";
  return "unknown";
}

/* ── Helpers used by CsvImportView ── */
export function impHhmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  return m ? m[1] + ":" + m[2] : "";
}

export function importKey(t: ParsedTrade, platform: string): string {
  return [platform, t.contract || t.symbol, t.direction, t.entryTime || "", t.exitTime || "", t.size, t.entryPrice, t.exitPrice].join("|");
}

export function rootToInst(root: string): string {
  const INSTRUMENTS = ["NQ","MNQ","ES","MES","RTY","M2K","6A","M6A","BTC","MBT","GC","MGC","CL","MCL"];
  return INSTRUMENTS.includes(root) ? root : (root || "");
}

export function impSummary(t: ParsedTrade): string {
  const net = t.netPnL ?? 0;
  return (
    (t.entryTime || "").slice(0, 10) + " · " + t.symbol + " · " + t.direction +
    " ×" + t.size + " · " +
    (t.entryPrice == null ? "—" : t.entryPrice) + "→" + (t.exitPrice == null ? "—" : t.exitPrice) +
    " · <b style=\"color:" + (net >= 0 ? "var(--green)" : "var(--red)") + "\">" +
    (net < 0 ? "-" : "") + "$" + Math.abs(net).toLocaleString(undefined, { maximumFractionDigits: 0 }) +
    "</b>"
  );
}
