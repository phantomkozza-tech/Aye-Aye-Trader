// ============================================================
// Aye Aye Trader — DB layer (ported from index.html vanilla JS)
// All localStorage logic lives here. React state is in DBContext.
// ============================================================

import type { JournalDB, Account, Trade, TradeLeg, Settings, Strategy } from "@/types/journal";

export const KEY = "ayeaye_journal_v2";

// ── Micro contracts ──────────────────────────────────────────
const MICRO_INSTS = ["MNQ", "MES", "M2K", "M6A", "MBT", "MGC", "MCL"];
export function isMicro(inst: string): boolean {
  return MICRO_INSTS.includes((inst || "").toUpperCase());
}
export function commRateFor(inst: string, settings: Settings): number {
  return isMicro(inst) ? settings.commMicro ?? 0 : settings.commMini ?? 0;
}

// ── Unique ID ────────────────────────────────────────────────
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Formatting ───────────────────────────────────────────────
export function fmt(n: number): string {
  const s = n < 0 ? "-" : "";
  return s + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function fmtDur(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return min + "m";
  const h = Math.floor(min / 60), m = min % 60;
  return h + "h" + (m ? " " + m + "m" : "");
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Trade leg math ───────────────────────────────────────────
export function legComm(l: TradeLeg): number {
  const rate = l?.comm != null ? l.comm : 0;
  return rate * (l.size || 0) * 2;
}
export function legNet(l: TradeLeg): number {
  return (l.pnl || 0) - legComm(l);
}

export function tradeDurMin(t: Trade): number | null {
  if (!t.entryTime || !t.exitTime) return null;
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(t.exitTime) - toMin(t.entryTime);
}

// ── Account map ──────────────────────────────────────────────
export function acctMap(db: JournalDB): Record<string, Account> {
  const m: Record<string, Account> = {};
  db.accounts.forEach((a) => (m[a.id] = a));
  return m;
}

// ── Date range filter ────────────────────────────────────────
export function inDateRange(dateStr: string, from: string, to: string): boolean {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

// ── Trade filtering (mirrors filteredTrades in vanilla JS) ───
export interface FilteredTrade extends Trade {
  _legs: TradeLeg[];
  _gross: number;
  _comm: number;
  _pnl: number;
}

export function filteredTrades(
  db: JournalDB,
  selAccts: Set<string>,   // selected account chips (empty = all)
  allow: Set<string>,      // visible accounts (respects show-blown)
  from: string,
  to: string
): FilteredTrade[] {
  return db.trades
    .filter((t) => inDateRange(t.date, from, to))
    .map((t) => {
      const legs = (t.legs || []).filter((l) => {
        if (!allow.has(l.acct)) return false;
        return selAccts.size === 0 || selAccts.has(l.acct);
      });
      const gross = legs.reduce((a, l) => a + (l.pnl || 0), 0);
      const comm = legs.reduce((a, l) => a + legComm(l), 0);
      const pnl = gross - comm;
      return { ...t, _legs: legs, _gross: gross, _comm: comm, _pnl: pnl };
    })
    .filter((t) => t._legs.length > 0);
}

// ── Dashboard stats ──────────────────────────────────────────
export interface DashStats {
  pnl: number;
  n: number;
  wr: number;
  wins: number;
  losses: number;
  exp: number;
  pf: number;
  slip: number;
  slipN: number;   // count of trades with slippage (for "avg per trade" sub)
  equityCurve: number[];
  setupLabels: string[];
  setupWr: number[];
  gradeExp: number[];
  acctLabels: string[];
  acctPnl: number[];
}

export function calcDashStats(
  db: JournalDB,
  trades: FilteredTrade[],
  allow: Set<string>,
  from: string,
  to: string
): DashStats {
  const n = trades.length;
  const pnl = trades.reduce((a, t) => a + t._pnl, 0);
  const wins = trades.filter((t) => t._pnl > 0);
  const lossArr = trades.filter((t) => t._pnl < 0);
  const wr = n ? Math.round((wins.length / n) * 100) : 0;
  const rs = trades.map((t) => parseFloat((t as any).r)).filter((v) => !isNaN(v));
  const exp = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  const gw = wins.reduce((a, t) => a + t._pnl, 0);
  const gl = Math.abs(lossArr.reduce((a, t) => a + t._pnl, 0));
  const pf = gl ? gw / gl : 0;
  const slip = trades.reduce(
    (a, t) => a + (t._legs || []).reduce((x, l) => x + ((l as any).slip || 0), 0),
    0
  );
  const slipN = trades.filter((t) =>
    (t._legs || []).some((l) => ((l as any).slip || 0) > 0)
  ).length;

  // Equity curve
  let cum = 0;
  const equityCurve = trades.map((t) => {
    cum += t._pnl;
    return +cum.toFixed(0);
  });

  // Win rate by setup
  const palette = ["#26d07c","#3b82c4","#d4a948","#9b6bd4","#e8825a","#5ac8c8","#c85a9b","#7c8aef"];
  const usedSetups = [...new Set(trades.map((t) => t.setup))].filter(Boolean) as string[];
  const setups = usedSetups.length ? usedSetups : db.strategies.map((s) => s.name);
  const setupWr = setups.map((s) => {
    const g = trades.filter((t) => t.setup === s);
    return g.length ? Math.round((g.filter((t) => t._pnl > 0).length / g.length) * 100) : 0;
  });
  const setupLabels = setups.map((s) => (s.length > 10 ? s.slice(0, 9) + "…" : s));

  // Grade expectancy
  const grades = ["A+", "A", "B"];
  const gradeExp = grades.map((g) => {
    const r = trades
      .filter((t) => t.grade === g)
      .map((t) => parseFloat((t as any).r))
      .filter((v) => !isNaN(v));
    return r.length ? +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(2) : 0;
  });

  // P&L by account
  const visAccts = db.accounts.filter((a) => allow.has(a.id));
  const acctPnl = visAccts.map((a) => {
    let s = 0;
    db.trades
      .filter((t) => inDateRange(t.date, from, to))
      .forEach((t) => (t.legs || []).forEach((l) => { if (l.acct === a.id) s += l.pnl || 0; }));
    return +s.toFixed(0);
  });
  const acctLabels = visAccts.map((a) => a.name + (a.status === "blown" ? " ✖" : ""));

  return { pnl, n, wr, wins: wins.length, losses: lossArr.length, exp, pf, slip, slipN, equityCurve, setupLabels, setupWr, gradeExp, acctLabels, acctPnl };
}

// ── Defaults ─────────────────────────────────────────────────
export function defaultSettings(): Settings {
  return {
    emoji: "😮‍💨", onenote: "", firms: [],
    tags: {
      feelings: ["Fear","FOMO","Anxious","Frustrated","Greed","Bored","Confident","Calm"],
      actions: ["Revenge traded","Chased entry","Oversized","Moved stop","Hesitated","Cut winner short","Took profit early","Followed plan"],
      execution: ["Sloppy","Rushed","Forced","Easy","Patient","Clean"],
    },
    journalAccts: [], commMini: 2.10, commMicro: 0.74,
    maxConsecLosses: 2, maxTradesPerDay: 5, rapidMins: 5, brokers: [],
  };
}

export function defaultStrategies(): Strategy[] {
  const crits = [
    "Location confluence (3+ references stack)",
    "Regime agrees with setup",
    "Timeframes aligned",
    "Strong confirmation (absorption/reclaim/exhaustion)",
    "GEX backing (positive/zero or wall at level)",
    "Clean structure into the zone",
    "Clear room to target (good R:R)",
  ];
  const mk = (name: string): Strategy => ({
    id: uid(), name,
    criteria: crits.slice(),
    thresholds: { aplus: 6, a: 4 },
  });
  return [mk("S/R Fade"), mk("Break & Retest"), mk("Gap & Go"), mk("Gap Fill")];
}

// ── Load / Save ──────────────────────────────────────────────
export function loadDB(): JournalDB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("empty");
    const d: JournalDB = JSON.parse(raw);
    if (!d?.accounts) throw new Error("no accounts");

    // backfill missing fields
    if (!d.groups) d.groups = [];
    if (!d.strategies) d.strategies = defaultStrategies();
    if (!d.settings) d.settings = defaultSettings();
    if (!d.settings.firms) d.settings.firms = [];
    if (!d.settings.tags) d.settings.tags = defaultSettings().tags;
    if (!d.settings.journalAccts) d.settings.journalAccts = [];
    if (d.settings.commMini == null) d.settings.commMini = 2.10;
    if (d.settings.commMicro == null) d.settings.commMicro = 0.74;
    if (d.settings.maxConsecLosses == null) d.settings.maxConsecLosses = 2;
    if (d.settings.maxTradesPerDay == null) d.settings.maxTradesPerDay = 5;
    if (d.settings.rapidMins == null) d.settings.rapidMins = 5;
    if (!d.settings.brokers) d.settings.brokers = [];
    if (!d.notes) d.notes = [];

    d.accounts.forEach((a) => {
      if (!a.status) a.status = "active";
      if (!a.ddtype) a.ddtype = "static";
    });

    // backfill per-leg commission
    (d.trades || []).forEach((t) => {
      (t.legs || []).forEach((l: any) => {
        if (l.comm == null) {
          const a = d.accounts.find((x) => x.id === l.acct);
          if (a && (a as any).comm) l.comm = (a as any).comm;
          else l.comm = isMicro(t.inst) ? d.settings.commMicro : d.settings.commMini;
        }
      });
    });

    return d;
  } catch {
    return {
      accounts: [], trades: [], groups: [],
      strategies: defaultStrategies(),
      settings: defaultSettings(),
      notes: [],
    };
  }
}

export function saveDB(db: JournalDB): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}
