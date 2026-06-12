// ── Instruments ──────────────────────────────────────────────
export interface InstrumentDef {
  pt: number;
  tick: number;
  name: string;
}

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  NQ:  { pt: 20,      tick: 0.25,   name: "E-mini Nasdaq" },
  MNQ: { pt: 2,       tick: 0.25,   name: "Micro Nasdaq" },
  ES:  { pt: 50,      tick: 0.25,   name: "E-mini S&P" },
  MES: { pt: 5,       tick: 0.25,   name: "Micro S&P" },
  RTY: { pt: 50,      tick: 0.1,    name: "E-mini Russell" },
  M2K: { pt: 5,       tick: 0.1,    name: "Micro Russell" },
  "6A":  { pt: 100000, tick: 0.0001, name: "Aussie Dollar" },
  M6A: { pt: 10000,   tick: 0.0001, name: "Micro Aussie" },
  BTC: { pt: 5,       tick: 5,      name: "Bitcoin (BTC)" },
  MBT: { pt: 0.1,     tick: 5,      name: "Micro Bitcoin" },
  GC:  { pt: 100,     tick: 0.1,    name: "Gold" },
  MGC: { pt: 10,      tick: 0.1,    name: "Micro Gold" },
  CL:  { pt: 1000,    tick: 0.01,   name: "Crude Oil" },
  MCL: { pt: 100,     tick: 0.01,   name: "Micro Crude" },
};

export const INST_KEYS = Object.keys(INSTRUMENTS);

export function instPt(sym: string): number {
  return INSTRUMENTS[sym]?.pt ?? 1;
}

// ── P&L calculation ──────────────────────────────────────────
export function calcLegPnl(
  sym: string,
  dir: "Long" | "Short",
  size: number,
  entry: number,
  exit: number
): number {
  const pt = instPt(sym);
  const sign = dir === "Long" ? 1 : -1;
  return (exit - entry) * sign * pt * size;
}

// ── R multiple ───────────────────────────────────────────────
export function calcR(
  dir: "Long" | "Short",
  entry: number,
  sl: number,
  exit: number
): string {
  const sign = dir === "Long" ? 1 : -1;
  const risk = Math.abs(entry - sl);
  if (!risk) return "";
  const r = ((exit - entry) * sign) / risk;
  return (r >= 0 ? "+" : "") + r.toFixed(2) + "R";
}

// ── Tag gradient (matches V1 signature purple→blue→green) ────
const GRADIENT: [number, number, number][] = [
  [130, 60, 222],
  [60, 130, 200],
  [82, 196, 64],
];

export function tagColor(idx: number, total: number): string {
  const g = GRADIENT;
  const f = total <= 1 ? 0 : idx / (total - 1);
  const seg = g.length - 1;
  const pos = f * seg;
  const i = Math.min(Math.floor(pos), seg - 1);
  const t = pos - i;
  const a = g[i], b = g[i + 1];
  const c = a.map((s, k) => Math.round(s + (b[k] - s) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function pickInk(rgb: string): string {
  const m = rgb.match(/\d+/g)!.map(Number);
  const lum = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
  return lum > 150 ? "#1a1205" : "#fff";
}
