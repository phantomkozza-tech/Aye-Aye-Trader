// ============================================================
// Aye Aye Trader — DB layer (ported from index.html vanilla JS)
// All localStorage logic lives here. React state is in DBContext.
// ============================================================

import type { JournalDB, Account, Trade, TradeLeg, Settings, Strategy, Phase, Broker, DDType, PhaseKind } from "@/types/journal";

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

// ============================================================
// PHASE + BLOW-UP DETECTION
// Faithful port of the working logic in index.html (evalDrawdownSim,
// marginSim, activePhase, legPhaseId). This is the single source of
// truth so every trade-entry path (manual + CSV) detects blow-ups
// identically and flips accounts to "blown".
// ============================================================

export function acctPhases(a: Account): Phase[] {
  return a.phases?.length ? a.phases : [];
}

export function activePhase(a: Account): Phase | null {
  const ps = acctPhases(a);
  return ps.find((p) => p.outcome === "active") ?? ps[ps.length - 1] ?? null;
}

// Which phase does a leg belong to? Explicit stamp wins; else resolve by
// trade date against each phase's [startDate, endDate]; else the first phase.
export function legPhaseId(a: Account, leg: TradeLeg, tradeDate: string): string | null {
  if (leg && leg.phase) return leg.phase;
  const ps = acctPhases(a);
  for (const p of ps) {
    const s = p.startDate || "0000-00-00";
    const e = p.endDate || "9999-12-31";
    if (tradeDate >= s && tradeDate <= e) return p.id;
  }
  return ps[0] ? ps[0].id : null;
}

export function makePhase(o: Partial<Phase> = {}): Phase {
  return {
    id: uid(), kind: "eval", label: null, startDate: today(), endDate: null,
    startBal: 0, target: 0, dd: 0, ddtype: "static", cost: 0, outcome: "active",
    ...o,
  };
}

export function phaseById(a: Account, pid: string): Phase | null {
  return acctPhases(a).find((p) => p.id === pid) ?? null;
}

// eval STEP number: only PASSING an eval advances the ladder.
export function evalStep(a: Account, p: Phase): number {
  const ps = acctPhases(a); let step = 1;
  for (const x of ps) {
    if (x.id === p.id) return step;
    if (x.kind === "eval" && x.outcome === "passed") step++;
  }
  return step;
}
export function evalMaxStep(a: Account): number {
  const ps = acctPhases(a); let step = 1, max = 1;
  for (const x of ps) {
    if (x.kind !== "eval") continue;
    if (step > max) max = step;
    if (x.outcome === "passed") step++;
  }
  return max;
}
export function phaseLabel(a: Account, p: Phase): string {
  if (p.label) return p.label;
  if (p.kind === "eval") return evalMaxStep(a) > 1 ? "Eval " + evalStep(a, p) : "Eval";
  if (p.kind === "funded") return "Funded";
  if (p.kind === "live") return "Live";
  return "Phase";
}
export function phaseKindLabel(a: Account, p: Phase | null): string {
  if (!p) return "";
  if (p.kind === "eval") return evalMaxStep(a) > 1 ? "Evaluation Phase " + evalStep(a, p) : "Evaluation";
  if (p.kind === "funded") return "Funded";
  if (p.kind === "live") return "Live";
  return "Phase";
}

// Eval→Eval/Funded, Funded→Live, Live→(final)
export function nextKinds(kind: PhaseKind): PhaseKind[] {
  if (kind === "eval") return ["eval", "funded"];
  if (kind === "funded") return ["live"];
  return [];
}

export function acctTotalCost(a: Account): number {
  const pc = acctPhases(a).reduce((s, p) => s + (p.cost || 0), 0);
  const rc = (a.resets || []).reduce((s, r) => s + (r.amount || 0), 0);
  return pc + rc;
}

// Mirror the active phase's rules up to the top-level fields the rest of the app
// reads (immutable: returns a new account object).
export function syncTopFromActive(a: Account): Account {
  const p = activePhase(a);
  if (!p) return a;
  return { ...a, bal: p.startBal, target: p.target, dd: p.dd, ddtype: p.ddtype, cost: acctTotalCost(a) };
}

export interface PhaseVals {
  kind: PhaseKind;
  label: string | null;
  startBal: number;
  target: number;
  dd: number;
  ddtype: DDType;
  cost: number;
}

// Advance the account to its next phase: pass the current phase and open a fresh
// one with independent rules. Immutable — returns a new DB.
export function advanceAccount(db: JournalDB, id: string, next: PhaseVals): JournalDB {
  const a = db.accounts.find((x) => x.id === id);
  if (!a || a.status === "blown") return db;
  const phases = acctPhases(a).map((p) => ({ ...p }));
  const cur = phases.find((p) => p.outcome === "active") ?? phases[phases.length - 1];
  if (!cur) return db;
  cur.outcome = "passed";
  cur.endDate = today();
  phases.push(makePhase({
    kind: next.kind, label: next.label || null, startDate: today(),
    startBal: next.startBal, target: next.target, dd: next.dd, ddtype: next.ddtype,
    cost: next.cost, outcome: "active",
  }));
  const updated = syncTopFromActive({ ...a, phases });
  return { ...db, accounts: db.accounts.map((x) => (x.id === id ? updated : x)) };
}

// Edit one phase's fields in place. Immutable — returns a new DB.
export function applyPhaseEdit(db: JournalDB, id: string, pid: string, vals: Partial<PhaseVals>): JournalDB {
  const a = db.accounts.find((x) => x.id === id);
  if (!a) return db;
  const phases = acctPhases(a).map((p) => ({ ...p }));
  const p = phases.find((x) => x.id === pid);
  if (!p) return db;
  Object.assign(p, vals);
  let updated: Account = { ...a, phases };
  if (p.outcome === "active") updated = syncTopFromActive(updated);
  return { ...db, accounts: db.accounts.map((x) => (x.id === id ? updated : x)) };
}

// Net P&L for an account scoped to one phase (null phaseId = all phases).
export function acctPnlScoped(db: JournalDB, id: string, phaseId: string | null): number {
  const a = db.accounts.find((x) => x.id === id);
  let s = 0;
  db.trades.forEach((t) => (t.legs || []).forEach((l) => {
    if (l.acct !== id) return;
    if (phaseId && a && legPhaseId(a, l, t.date) !== phaseId) return;
    s += legNet(l);
  }));
  return s;
}

export interface DrawdownResult {
  blown: boolean;
  floor: number;
  curBal: number;
  start: number;
  dd: number;
  type: DDType;
}

// Reconstructs the account's active-phase balance series and decides whether
// the drawdown floor has been breached. Supports static / intraday-trailing /
// eod-trailing drawdown, exactly like the HTML version.
//   excludeTradeId — skip a trade (used when re-checking the trade being saved)
//   extraLegs      — prospective {date, net} rows to fold in before deciding
export function evalDrawdownSim(
  db: JournalDB,
  acctId: string,
  excludeTradeId?: string | null,
  extraLegs?: { date: string; net: number }[]
): DrawdownResult {
  const a = db.accounts.find((x) => x.id === acctId);
  if (!a) return { blown: false, floor: 0, curBal: 0, start: 0, dd: 0, type: "static" };
  const p = activePhase(a);
  const ddv = p ? p.dd : a.dd;
  const type = ((p ? p.ddtype : a.ddtype) || "static") as DDType;
  const startBal = p && p.startBal != null ? p.startBal : a.bal || 0;
  if (!ddv) return { blown: false, floor: startBal, curBal: startBal, start: startBal, dd: 0, type };

  const rows: { date: string; net: number }[] = [];
  db.trades.forEach((t) => {
    if (t.id === excludeTradeId) return;
    (t.legs || []).forEach((l) => {
      if (l.acct !== acctId) return;
      if (p && legPhaseId(a, l, t.date) !== p.id) return;
      rows.push({ date: t.date, net: legNet(l) });
    });
  });
  (extraLegs || []).forEach((r) => rows.push(r));
  rows.sort((x, y) => x.date.localeCompare(y.date));

  let bal = startBal;
  const series: { date: string; bal: number }[] = [];
  rows.forEach((r) => { bal += r.net; series.push({ date: r.date, bal }); });

  const start = startBal, dd = ddv;
  let blown = false, floor = start - dd;
  if (type === "static") {
    floor = start - dd;
    blown = series.some((s) => s.bal <= floor);
  } else if (type === "intraday") {
    let peak = start;
    for (const s of series) { if (s.bal > peak) peak = s.bal; if (s.bal <= peak - dd) blown = true; }
    floor = peak - dd;
  } else if (type === "eod") {
    const byDay: Record<string, number> = {};
    series.forEach((s) => { byDay[s.date] = s.bal; });
    let peak = start;
    const days = Object.keys(byDay).sort();
    for (const d of days) { const eod = byDay[d]; if (eod <= peak - dd) blown = true; if (eod > peak) peak = eod; }
    floor = peak - dd;
  }
  const curBal = series.length ? series[series.length - 1].bal : start;
  return { blown, floor, curBal, start, dd, type };
}

export function brokerById(db: JournalDB, id?: string): Broker | null {
  if (!id) return null;
  return (db.settings.brokers || []).find((b) => b.id === id) ?? null;
}

export interface MarginResult {
  floor: number;
  start: number;
  balance: number;
  low: number;
  blown: boolean;
  hitDate: string | null;
  debt: number;
  timing: string;
  broker: string;
}

// Personal-account margin floor + debt. Floor = smallest per-contract margin
// the account's broker defines. EOD-fee brokers run gross intraday then sweep
// the day's fees at the close, which can push the balance negative (debt).
export function marginSim(db: JournalDB, a: Account): MarginResult | null {
  const b = brokerById(db, a.broker);
  const insts = (b as any)?.insts as { sym: string; margin: number; fee: number }[] | undefined;
  if (!b || !insts || !insts.length) return null;
  const floor = Math.min(...insts.map((i) => +i.margin || 0));
  if (!(floor > 0)) return null;
  const start = +a.bal || 0;

  const byDay: Record<string, { date: string; gross: number; fee: number }> = {};
  db.trades.forEach((t) => {
    let gross = 0, fee = 0, has = false;
    (t.legs || []).forEach((l) => {
      if (l.acct === a.id) { gross += l.pnl || 0; fee += legComm(l); has = true; }
    });
    if (has) {
      const d = byDay[t.date] || (byDay[t.date] = { date: t.date, gross: 0, fee: 0 });
      d.gross += gross; d.fee += fee;
    }
  });
  const days = Object.values(byDay).sort((x, y) => x.date.localeCompare(y.date));
  const eod = (b as any).feeTiming === "eod";
  let bal = start, low = start, blown = false, hitDate: string | null = null;
  days.forEach((d) => {
    if (eod) { bal += d.gross; if (bal < low) low = bal; bal -= d.fee; }
    else { bal += d.gross - d.fee; }
    if (bal < low) low = bal;
    if (!blown && bal < floor) { blown = true; hitDate = d.date; }
  });
  return { floor, start, balance: bal, low, blown, hitDate, debt: bal < 0 ? -bal : 0, timing: (b as any).feeTiming, broker: b.name };
}

export interface DdBlowWarning {
  acctId: string;
  name: string;
  curBal: number;
  floor: number;
}

// PRE-INSERT check: which active accounts would this prospective trade's legs
// push past their drawdown floor? Used to warn the user before committing.
export function simulateDdBlows(db: JournalDB, trade: Trade): DdBlowWarning[] {
  const out: DdBlowWarning[] = [];
  (trade.legs || []).forEach((l) => {
    const a = db.accounts.find((x) => x.id === l.acct);
    if (!a || a.status === "blown") return;
    const ddv = activePhase(a)?.dd ?? a.dd;
    if (!ddv) return;
    const res = evalDrawdownSim(db, l.acct, trade.id, [{ date: trade.date, net: legNet(l) }]);
    if (res.blown) out.push({ acctId: l.acct, name: a.name, curBal: res.curBal, floor: res.floor });
  });
  return out;
}

// Seal an account as blown: flip status, stamp the trade that did it, and close
// out the active phase. Returns a fresh object (immutable update).
function sealBlown(
  a: Account, blownDate: string, tradeId: string | null,
  reason: "drawdown" | "margin", debt?: number
): Account {
  const phases = acctPhases(a).map((p) => ({ ...p }));
  const ap = phases.find((p) => p.outcome === "active") ?? phases[phases.length - 1];
  if (ap) { ap.outcome = "blown"; ap.endDate = blownDate; }
  const updated: Account = {
    ...a, phases, status: "blown", blownDate,
    blownTradeId: tradeId ?? undefined, blownReason: reason,
  };
  if (debt != null) updated.debt = debt;
  return updated;
}

// POST-INSERT: scan every account touched by `trade`, flip any that the trade
// blew (drawdown for any account, margin floor for personal accounts), and
// return the updated DB plus the list of newly-blown accounts. Expects `db` to
// already contain `trade`.
export function applyTradeBlows(db: JournalDB, trade: Trade): { db: JournalDB; blown: Account[] } {
  const blown: Account[] = [];
  const touched = [...new Set((trade.legs || []).map((l) => l.acct))];
  let accounts = db.accounts;
  const live = (): JournalDB => ({ ...db, accounts });

  // 1) Drawdown blows — applies to any account with a drawdown limit.
  touched.forEach((aid) => {
    const a = accounts.find((x) => x.id === aid);
    if (!a || a.status === "blown") return;
    const ddv = activePhase(a)?.dd ?? a.dd;
    if (!ddv) return;
    const res = evalDrawdownSim(live(), aid);
    if (res.blown) {
      const sealed = sealBlown(a, trade.date, trade.id, "drawdown");
      accounts = accounts.map((x) => (x.id === aid ? sealed : x));
      blown.push(sealed);
    }
  });

  // 2) Margin-floor blows — personal accounts trading through a broker.
  touched.forEach((aid) => {
    const a = accounts.find((x) => x.id === aid);
    if (!a || a.status === "blown" || a.type !== "personal") return;
    const ms = marginSim(live(), a);
    if (ms && ms.blown) {
      const sealed = sealBlown(a, ms.hitDate || trade.date, trade.id, "margin", ms.debt);
      accounts = accounts.map((x) => (x.id === aid ? sealed : x));
      blown.push(sealed);
    }
  });

  return { db: { ...db, accounts }, blown };
}

// Full sweep used after a batch import: re-evaluate every active account and
// blow any that crossed a floor, attributing it to its most recent trade.
export function sweepAllBlows(db: JournalDB): { db: JournalDB; blown: Account[] } {
  const blown: Account[] = [];
  let accounts = db.accounts;
  const live = (): JournalDB => ({ ...db, accounts });

  const lastTradeIdFor = (aid: string): string | null => {
    let id: string | null = null, date = "";
    db.trades.forEach((t) => {
      if ((t.legs || []).some((l) => l.acct === aid) && t.date >= date) { date = t.date; id = t.id; }
    });
    return id;
  };

  accounts.forEach((acc) => {
    if (acc.status === "blown") return;
    const ddv = activePhase(acc)?.dd ?? acc.dd;
    let reason: "drawdown" | "margin" | null = null;
    let hitDate: string | null = null;
    let debt: number | undefined;

    if (ddv) {
      const res = evalDrawdownSim(live(), acc.id);
      if (res.blown) { reason = "drawdown"; }
    }
    if (!reason && acc.type === "personal") {
      const ms = marginSim(live(), acc);
      if (ms && ms.blown) { reason = "margin"; hitDate = ms.hitDate; debt = ms.debt; }
    }
    if (reason) {
      const tid = lastTradeIdFor(acc.id);
      const sealed = sealBlown(acc, hitDate || today(), tid, reason, debt);
      accounts = accounts.map((x) => (x.id === acc.id ? sealed : x));
      blown.push(sealed);
    }
  });

  return { db: { ...db, accounts }, blown };
}

// Random gallows-humor line for the blow-up popup (1:1 with index.html).
export const BLOWUP_LINES: string[] = [
  "Another day, another account blowjob. At least the candles were cute.",
  "Blew the account faster than NQ dumps on fake breakout. Send help (or tendies).",
  "Journal entry: 'I followed my plan... for 11 seconds!' RIP balance.",
  "Today's strategy: Trade like a genius, exit like a regard. Account status: Very dead.",
  "Margin called so hard I heard it in my sleep. Good morning, poverty!",
  "Blowing accounts builds character... said no rich trader ever.",
  "NQ taught me a valuable lesson today: Shut the fuck up and wait.",
  "Account balance looking like my dating history — zero and disappointed.",
  "Revenge traded so aggressively I'm now trading my rent money. 10/10 would do again.",
  "Plan was flawless. Execution was sponsored by degenerate gambler energy.",
  "Lost more today than my ex took in the divorce. At least trading doesn't ghost me.",
  "Account went from hero to zero quicker than ES on FOMC minutes.",
  "Dear diary, today I turned $2,000 into memories and a funny tweet.",
  "Blew up so fast even the prop firm is sending condolences via email.",
  "Trading rule #47: If it looks too good to be true, you're about to get heemed.",
];
export function randomBlowupLine(): string {
  return BLOWUP_LINES[Math.floor(Math.random() * BLOWUP_LINES.length)];
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
    if (!d.templates) d.templates = [];

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
      templates: [],
    };
  }
}

export function saveDB(db: JournalDB): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}
