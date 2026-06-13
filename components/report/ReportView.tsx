"use client";

import { useState, useEffect, useRef } from "react";
import { useDB } from "@/context/DBContext";
import { fmt, fmtDur, legNet, legComm } from "@/lib/db";
import type { JournalDB, Account, Trade, TradeLeg, Strategy } from "@/types/journal";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type SubTab = "perf" | "system" | "eval" | "psych" | "road";

interface FilteredTrade extends Trade {
  _legs: TradeLeg[];
  _pnl: number;
  _psy?: string;
  _psyWhy?: string[];
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const DOW_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const FORCE_TAGS = ["Chased entry","Forced","Rushed","Revenge traded"];
const TILT_TAGS  = ["Revenge traded","Frustrated","Oversized","FOMO","Chased entry"];
const PSY_STATES = ["Tilt","FOMO","Fear","Overconfidence","Discipline"] as const;
const PSY_COLOR: Record<string,string> = {
  Tilt:"#f0556d", FOMO:"#e8a13a", Fear:"#9a6cf0",
  Overconfidence:"#3b82c4", Discipline:"#26d07c", Flat:"#7d8896",
};
const PSY_NEG   = ["Tilt","FOMO","Fear","Overconfidence"];
const POS_FEEL  = ["Calm","Confident"];
const NEG_FEEL  = ["Fear","FOMO","Anxious","Frustrated","Greed"];
const MASTERY_REPS = 100;
const BASE_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: "#e6edf3" } } },
};
const CG = { grid: { color: "#1e2733" }, ticks: { color: "#7d8896" } };

// ─────────────────────────────────────────────────────────────
// Utilities (mirrors V1 helpers)
// ─────────────────────────────────────────────────────────────
function parseMin(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function fmtHour(h: number) {
  const ap = h < 12 ? "AM" : "PM"; let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ":00 " + ap;
}

function inDateRange(dateStr: string, from: string, to: string) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to   && dateStr > to)   return false;
  return true;
}

function repTagAll(t: any) {
  const a = t.tags || {};
  return [...(a.feelings||[]), ...(a.actions||[]), ...(a.execution||[])];
}
function repTagAny(t: any, names: string[]) {
  return names.some(n => repTagAll(t).includes(n));
}
function isConfirmed(t: FilteredTrade) {
  return t.plan === "Yes" && !repTagAny(t, FORCE_TAGS);
}

function repBucket(arr: FilteredTrade[]) {
  const n = arr.length, wins = arr.filter(t => t._pnl > 0).length;
  const pnl = arr.reduce((a, t) => a + t._pnl, 0);
  const rs = arr.map(t => parseFloat((t as any).r)).filter(v => !isNaN(v));
  const avgR = rs.length ? rs.reduce((a,b)=>a+b,0)/rs.length : null;
  return { n, wins, wr: n ? Math.round(wins/n*100) : 0, pnl, avgR, exp: n ? pnl/n : 0 };
}

function topCount(obj: Record<string,number>) {
  const k = Object.keys(obj); if (!k.length) return null;
  k.sort((a,b) => obj[b]-obj[a]);
  return { key: k[0], n: obj[k[0]] };
}

function trustColor(p: number) {
  return p >= 70 ? "var(--green)" : p >= 45 ? "var(--gold)" : "var(--red)";
}

// Phase helpers (mirrors V1 acctPhases / activePhase / phaseById / legPhaseId / phaseLabel)
function acctPhases(a: Account) {
  return (a as any).phases?.length ? (a as any).phases : [{ id: "p0", kind: (a as any).start ?? "eval", outcome: "active", startBal: a.bal ?? 0, startDate: null, target: a.target ?? 0, dd: a.dd ?? 0, ddtype: a.ddtype ?? "static", cost: (a as any).cost ?? 0 }];
}
function activePhase(a: Account) {
  const ps = acctPhases(a);
  return ps.find((p: any) => p.outcome === "active") || ps[ps.length - 1];
}
function phaseById(a: Account, pid: string) {
  return acctPhases(a).find((p: any) => p.id === pid) || null;
}
function legPhaseId(a: Account, leg: TradeLeg, tradeDate: string) {
  const ps = acctPhases(a).filter((p: any) => p.startDate).slice().sort((x: any, y: any) => x.startDate.localeCompare(y.startDate));
  if (!ps.length) return acctPhases(a)[0]?.id ?? null;
  let cur = ps[0];
  for (const p of ps) { if (p.startDate <= tradeDate) cur = p; else break; }
  return cur.id;
}
function phaseLabel(a: Account, p: any) {
  const idx = acctPhases(a).findIndex((x: any) => x.id === p.id);
  return p.label || (p.kind === "eval" ? `Eval${idx > 0 ? " " + (idx+1) : ""}` : p.kind === "funded" ? "Funded" : "Live");
}
function acctTotalCost(a: Account) {
  const pc = acctPhases(a).reduce((s: number, p: any) => s + (p.cost || 0), 0);
  const rc = ((a as any).resets || []).reduce((s: number, r: any) => s + (r.amount || 0), 0);
  return pc + rc;
}
function acctLegRows(db: JournalDB, id: string) {
  const rows: {net:number}[] = [];
  db.trades.forEach(t => {
    let net = 0, has = false;
    (t.legs||[]).forEach(l => { if (l.acct === id) { net += legNet(l); has = true; } });
    if (has) rows.push({ net });
  });
  return rows;
}
function acctPnl(db: JournalDB, id: string) {
  return acctLegRows(db, id).reduce((s, r) => s + r.net, 0);
}

// psychRules mirrors V1 psychRules()
function psychRules(db: JournalDB) {
  const s = db.settings as any || {};
  return {
    maxLoss:   s.maxConsecLosses != null ? +s.maxConsecLosses : 2,
    maxTrades: s.maxTradesPerDay  != null ? +s.maxTradesPerDay  : 5,
    rapidMin:  s.rapidMins        != null ? +s.rapidMins        : 5,
  };
}

// Monte Carlo (simplified, mirrors V1 monteCarloPass)
function monteCarloPass(curBal: number, floor: number, target: number, dd: number, type: string, results: {net:number}[], sims = 5000) {
  if (results.length < 8) return null;
  const L = results.length, maxSteps = 400, trailing = type === "intraday" || type === "eod";
  let pass = 0;
  for (let s = 0; s < sims; s++) {
    let bal = curBal, peak = curBal, fl = floor, steps = 0;
    while (steps < maxSteps) {
      bal += results[Math.floor(Math.random() * L)].net;
      if (trailing) { if (bal > peak) peak = bal; fl = Math.max(floor, peak - dd); }
      if (bal >= target) { pass++; break; }
      if (bal <= fl) break;
      steps++;
    }
  }
  return pass / sims;
}

function consistencyScore(daily: {net:number}[]) {
  const n = daily.length;
  if (n < 3) return { score: null, n, bestShare: null };
  const green = daily.filter(d => d.net > 0).length, greenRate = green / n;
  const gains = daily.filter(d => d.net > 0).map(d => d.net);
  const totalGain = gains.reduce((a,b)=>a+b,0), best = gains.length ? Math.max(...gains) : 0;
  const spread = totalGain > 0 ? (1 - best / totalGain) : 0;
  return { score: Math.round(100 * (0.55*spread + 0.45*greenRate)), n, bestShare: totalGain > 0 ? best/totalGain : null };
}

function evalDrawdownSim(db: JournalDB, acctId: string) {
  const a = db.accounts.find(x => x.id === acctId);
  if (!a) return { start:0, dd:0, floor:0, curBal:0, type:"static" };
  const p = activePhase(a);
  const start = p?.startBal ?? (a.bal || 0);
  const dd    = p?.dd    ?? (a as any).dd    ?? 0;
  const type  = p?.ddtype ?? (a as any).ddtype ?? "static";
  let curBal  = start;
  db.trades.forEach(t => {
    (t.legs||[]).forEach(l => {
      if (l.acct === acctId && legPhaseId(a, l, t.date) === p?.id) {
        curBal += legNet(l);
      }
    });
  });
  const floor = type === "static" ? start - dd : Math.max(0, start - dd);
  return { start, dd, floor, curBal, type };
}

function marginSim(a: Account) {
  const broker = ((a as any).broker || ""); if (!broker) return null;
  return { broker };
}

function acctTradeNets(db: JournalDB, a: Account) {
  const out: {date:string,net:number}[] = [];
  db.trades.slice().sort((x,y)=>x.date.localeCompare(y.date)).forEach(t => {
    let net = 0, has = false;
    (t.legs||[]).forEach(l => { if (l.acct === a.id) { net += legNet(l); has = true; } });
    if (has) out.push({ date: t.date, net });
  });
  return out;
}

function roadmapSim(db: JournalDB, a: Account, goalAmt: number, startBal: number) {
  const nets = acctTradeNets(db, a).map(x => x.net);
  if (nets.length < 10) return { enough: false, reps: nets.length, reach:0, ruin:0, stall:0, floor:0 };
  const floor = 0;
  const N = 4000, maxSteps = 1500; let reach = 0, ruin = 0;
  for (let i = 0; i < N; i++) {
    let bal = startBal, s = 0;
    while (s < maxSteps) {
      bal += nets[Math.floor(Math.random()*nets.length)]; s++;
      if (bal >= goalAmt) { reach++; break; }
      if (bal < floor)    { ruin++;  break; }
    }
  }
  return { enough: true, reps: nets.length, reach: reach/N*100, ruin: ruin/N*100, stall: (N-reach-ruin)/N*100, floor };
}

// Strategy mastery
function stratStable(g: FilteredTrade[]) {
  if (g.length < 60) return false;
  const W = Math.min(30, Math.floor(g.length/2)), recent = g.slice(-W);
  const wr = (a: FilteredTrade[]) => a.filter(t=>t._pnl>0).length/a.length*100;
  const ar = (a: FilteredTrade[]) => { const rs=a.map(t=>parseFloat((t as any).r)).filter(v=>!isNaN(v)); return rs.length?rs.reduce((x,y)=>x+y,0)/rs.length:null; };
  const wrStable = Math.abs(wr(recent)-wr(g)) <= 15;
  const arAll = ar(g), arRec = ar(recent);
  const arStable = (arAll==null||arRec==null) ? true : Math.abs(arRec-arAll)<=0.6;
  return wrStable && arStable;
}

function strategyMastery(s: Strategy, g: FilteredTrade[]) {
  const reps = g.length, b = repBucket(g), stable = stratStable(g);
  let mathState: string;
  if (reps < MASTERY_REPS)      mathState = "Developing";
  else if (b.exp <= 0)           mathState = "No edge";
  else if (stable)               mathState = "Mastered";
  else                           mathState = "Developing";
  const surveys = (s as any).surveys || [];
  const last = surveys.length ? surveys[surveys.length-1] : null;
  const surveyDue = reps >= 25 && (!last || Math.floor(reps/25) > Math.floor((last.reps||0)/25));
  const override = (s as any).masteryOverride || null;
  return { reps, b, stable, mathState, override, state: override || mathState, surveyDue, last, progress: Math.min(100, Math.round(reps/MASTERY_REPS*100)) };
}

function masteryChip(state: string) {
  const c = state==="Mastered"?"m-master":state==="No edge"?"m-noedge":"m-dev";
  return `<span class="mchip ${c}">${state}</span>`;
}

// legMoneyKind — sim vs real
function legMoneyKind(db: JournalDB, leg: TradeLeg, dateStr: string) {
  const acct = db.accounts.find(a => a.id === leg.acct);
  if (!acct || acct.type !== "prop") return "real";
  const ps = acctPhases(acct).filter((p:any)=>p.startDate).slice().sort((a:any,b:any)=>a.startDate.localeCompare(b.startDate));
  if (!ps.length) return "real";
  let cur = ps[0];
  for (const p of ps) { if (p.startDate <= dateStr) cur = p; else break; }
  return cur.kind === "eval" ? "sim" : "real";
}

function stratMoney(db: JournalDB, g: FilteredTrade[]) {
  let sm=0, sl=0, rm=0, rl=0;
  g.forEach(t => (t._legs||[]).forEach(l => {
    const net = legNet(l), k = legMoneyKind(db, l, t.date);
    if (k==="sim")  { net>=0?sm+=net:sl+=net; } else { net>=0?rm+=net:rl+=net; }
  }));
  return { simMade:sm, simLost:sl, realMade:rm, realLost:rl };
}

// psychAssign (exact port of V1)
function psychAssign(t: FilteredTrade, ctx: any, R: any) {
  const F = (t.tags as any)?.feelings||[], A = (t.tags as any)?.actions||[], E = (t.tags as any)?.execution||[];
  const has = (arr: string[], x: string) => arr.includes(x);
  if (ctx.tiltOn) {
    const why: string[] = [];
    if (ctx.brokeLoss)   why.push("kept trading after "+ctx.consec+" straight losses (your stop is "+R.maxLoss+")");
    else if (ctx.brokeTrades) why.push("past your "+R.maxTrades+"-trade cap while losing");
    if (ctx.gap != null) why.push("rapid re-entry, "+ctx.gap+"m apart");
    if (has(A,"Revenge traded")) why.push("tagged revenge");
    if (has(A,"Oversized"))       why.push("sized up mid-spiral");
    return { state:"Tilt", why: why.slice(0,3) };
  }
  if (ctx.rapid && ctx.lossLinked && !ctx.brokeLoss && (t.plan==="No"||has(A,"Chased entry")||has(E,"Rushed")||has(E,"Forced")||has(A,"Oversized"))) {
    const why = ["rapid re-entry"+(ctx.gap!=null?" "+ctx.gap+"m after a loss":" after a loss")];
    if (has(A,"Chased entry")) why.push("chased the entry");
    else if (has(E,"Rushed")||has(E,"Forced")) why.push("forced it in");
    else if (t.plan==="No") why.push("off-plan");
    return { state:"FOMO", why: why.slice(0,3) };
  }
  if (has(A,"Chased entry") && t.plan !== "Yes") {
    const why = ["chased the entry"]; if (has(F,"FOMO")) why.push("felt FOMO"); if (has(E,"Rushed")) why.push("rushed in");
    return { state:"FOMO", why };
  }
  const skipped = (t.metCrit&&t.metCrit.length<=2)&&(t.grade==="B"||(t.grade as string)==="C");
  const ruleBreak = has(A,"Oversized")||skipped||t.plan==="No";
  if ((ctx.winStreakDays>=2||ctx.consecWins>=3)&&ruleBreak&&t._pnl<0) {
    const why: string[] = [];
    if (ctx.winStreakDays>=2) why.push(ctx.winStreakDays+" winning days in a row before this");
    else why.push(ctx.consecWins+" wins in a row before this");
    if (has(A,"Oversized")) why.push("sized up");
    else if (t.plan==="No") why.push("abandoned the plan");
    else why.push("skipped confirmation");
    return { state:"Overconfidence", why };
  }
  let fear=0, fw: string[]=[];
  if (has(A,"Hesitated"))         { fear+=30; fw.push("hesitated"); }
  if (has(A,"Cut winner short"))  { fear+=24; fw.push("cut the winner short"); }
  if (has(A,"Took profit early")) { fear+=20; fw.push("took profit early"); }
  if (has(A,"Moved stop"))        { fear+=12; fw.push("moved the stop"); }
  if (has(F,"Fear"))              { fear+=14; fw.push("felt fear"); }
  if (has(F,"Anxious"))           { fear+=10; fw.push("felt anxious"); }
  if (fear>=24&&t._pnl<=0) return { state:"Fear", why: fw.slice(0,3) };
  let disc=0, dw: string[]=[];
  if (t.plan==="Yes")             { disc+=28; dw.push("followed the plan"); }
  if (has(A,"Followed plan"))     { disc+=14; dw.push("tagged followed-plan"); }
  if (has(E,"Clean"))             { disc+=18; dw.push("clean execution"); }
  if (has(E,"Patient"))           { disc+=14; dw.push("patient"); }
  const dv = parseInt((t as any).disc); if (!isNaN(dv)&&dv>=9) { disc+=18; dw.push("high discipline score"); }
  if (t.grade==="A"||t.grade==="A+") { disc+=10; dw.push("A-grade setup"); }
  if (has(A,"Revenge traded")||has(A,"Chased entry")||has(A,"Oversized")||has(E,"Forced")||has(E,"Rushed")||has(E,"Sloppy")) disc-=45;
  if (disc>=20) return { state:"Discipline", why: dw.slice(0,3) };
  return { state:"Flat", why:[] };
}

function computePsych(T: FilteredTrade[], R: any): FilteredTrade[] {
  const sorted = [...T].sort((a,b) => {
    const c = a.date.localeCompare(b.date); if (c) return c;
    return (parseMin(a.entryTime)||0) - (parseMin(b.entryTime)||0);
  });
  const days: Record<string,FilteredTrade[]> = {};
  sorted.forEach(t => { (days[t.date] = days[t.date]||[]).push(t); });
  const dayKeys = Object.keys(days).sort();
  let priorWinDays = 0;
  const winDaysBefore: Record<string,number> = {};
  dayKeys.forEach(dk => {
    winDaysBefore[dk] = priorWinDays;
    const dnet = days[dk].reduce((a,t)=>a+t._pnl,0);
    if (dnet>0) priorWinDays++; else if (dnet<0) priorWinDays=0;
  });
  dayKeys.forEach(dk => {
    const day = days[dk].sort((a,b)=>(parseMin(a.entryTime)||0)-(parseMin(b.entryTime)||0));
    let consec=0, winRun=0, tiltOn=false;
    day.forEach((t,i) => {
      const prev = i>0?day[i-1]:null;
      let gap: number|null = null;
      if (prev) {
        const pe = parseMin(prev.exitTime)!=null?parseMin(prev.exitTime):parseMin(prev.entryTime);
        const ce = parseMin(t.entryTime);
        if (pe!=null&&ce!=null) { gap=ce-pe; if(gap<0)gap+=1440; }
      }
      const rapid     = gap!=null && gap<=R.rapidMin;
      const idx       = i+1;
      const lossLinked= (prev&&prev._pnl<0)||consec>0;
      const brokeLoss = consec>=R.maxLoss;
      const brokeTrades=idx>R.maxTrades;
      if (!rapid)  tiltOn = false;
      if (rapid&&lossLinked&&(brokeLoss||(brokeTrades&&consec>=1))) tiltOn=true;
      const d = psychAssign(t,{rapid,gap,idx,lossLinked,brokeLoss,brokeTrades,consec,tiltOn,winStreakDays:winDaysBefore[dk],consecWins:winRun},R);
      (t as any)._psy = d.state; (t as any)._psyWhy = d.why;
      if (t._pnl<0){consec++;winRun=0;}else if(t._pnl>0){consec=0;winRun++;}
    });
  });
  return sorted;
}

// ─────────────────────────────────────────────────────────────
// ChartJS helpers
// ─────────────────────────────────────────────────────────────
function useChartJS() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ((window as any).Chart) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

const chartInstances = new Map<string, any>();
function mkChart(id: string, cfg: any) {
  if (chartInstances.has(id)) { chartInstances.get(id)?.destroy(); chartInstances.delete(id); }
  const el = document.getElementById(id) as HTMLCanvasElement | null;
  if (!el) return;
  const inst = new (window as any).Chart(el, cfg);
  chartInstances.set(id, inst);
}

// ─────────────────────────────────────────────────────────────
// Sub-tab: Performance
// ─────────────────────────────────────────────────────────────
function PerfView({ T, chartReady }: { T: FilteredTrade[]; chartReady: boolean }) {
  const dowPnl = [0,0,0,0,0,0,0], dowN = [0,0,0,0,0,0,0];
  T.forEach(t => { const d = new Date(t.date+"T00:00").getDay(); dowPnl[d]+=t._pnl; dowN[d]++; });
  const dowIdx = [1,2,3,4,5].filter(i=>dowN[i]>0).concat([0,6].filter(i=>dowN[i]>0));
  const grades = ["A+","A","B"];
  const byGrade = grades.map(g => T.filter(t=>t.grade===g).reduce((a,t)=>a+t._pnl,0));
  const insts = [...new Set(T.map(t=>t.inst))].filter(Boolean);
  const byInst = insts.map(i => T.filter(t=>t.inst===i).reduce((a,t)=>a+t._pnl,0));
  const stratNames = [...new Set(T.map(t=>t.setup))].filter(Boolean);
  const byStrat = stratNames.map(s => {
    const g = T.filter(t=>t.setup===s);
    const rs = g.map(t=>parseFloat((t as any).r)).filter(v=>!isNaN(v));
    return { name:s, pnl:g.reduce((a,t)=>a+t._pnl,0), n:g.length, wins:g.filter(t=>t._pnl>0).length, rs };
  });
  const col = (v: number) => v>=0?"#26d07c":"#f0556d";

  // Insight cards data
  let maxN=-1, activeDay=-1;
  for (let i=0;i<7;i++) { if(dowN[i]>maxN){maxN=dowN[i];activeDay=i;} }
  let bestDay=-1,worstDay=-1,bestV=-Infinity,worstV=Infinity;
  for (let i=0;i<7;i++) {
    if (dowN[i]>0) {
      if (dowPnl[i]>bestV){bestV=dowPnl[i];bestDay=i;}
      if (dowPnl[i]<worstV){worstV=dowPnl[i];worstDay=i;}
    }
  }
  const longN=T.filter(t=>t.dir==="Long").length, shortN=T.length-longN;
  const dir=longN===shortN?"Even":(longN>shortN?"Long":"Short");

  // Confirmation diag
  const conf = repBucket(T.filter(isConfirmed));
  const imp  = repBucket(T.filter(t=>!isConfirmed(t)));
  const gap  = conf.wr - imp.wr;
  let showConf = conf.n>=2 && imp.n>=2;
  let confHead = gap>0
    ? `When you <span class="hi-g">waited for confirmation</span> you won <b>${conf.wr}%</b>. When you <span class="hi-r">chased or forced</span> it, just <b>${imp.wr}%</b> — a <span class="hi-g">${gap}-point</span> swing, and ${fmt(conf.exp)} vs ${fmt(imp.exp)} per trade.`
    : `Confirmation isn't separating your results yet (${conf.wr}% patient vs ${imp.wr}% forced). Keep tagging plan-followed and chase/force so this can sharpen.`;

  // Tilt diag
  const byDay: Record<string,FilteredTrade[]>={};
  T.forEach(t=>{(byDay[t.date]=byDay[t.date]||[]).push(t);});
  const loops: {t:FilteredTrade;hour:number|null;dow:number}[] = [];
  Object.keys(byDay).forEach(d => {
    const day = byDay[d].slice().sort((a,b)=>{const ma=parseMin(a.entryTime),mb=parseMin(b.entryTime);if(ma==null&&mb==null)return 0;if(ma==null)return 1;if(mb==null)return -1;return ma-mb;});
    for (let i=0;i<day.length;i++) {
      const cur=day[i], tagged=repTagAny(cur,TILT_TAGS);
      let quick=false; const ce=parseMin(cur.entryTime);
      if (i>0&&day[i-1]._pnl<0) {
        const prev=day[i-1];
        const pen=parseMin(prev.exitTime)!=null?parseMin(prev.exitTime):parseMin(prev.entryTime);
        if(pen!=null&&ce!=null){let gp=ce-pen;if(gp<0)gp+=1440;quick=gp<=20;}
      }
      if(tagged||quick) loops.push({t:cur,hour:ce!=null?Math.floor(ce/60):null,dow:new Date(d+"T00:00").getDay()});
    }
  });
  const showTilt = loops.length>=2;
  const lb = repBucket(loops.map(l=>l.t)), baseline = repBucket(T);
  const dowCount: Record<string,number>={}, hourCount: Record<string,number>={};
  loops.forEach(l=>{dowCount[l.dow]=(dowCount[l.dow]||0)+1;if(l.hour!=null)hourCount[l.hour]=(hourCount[l.hour]||0)+1;});
  const topDow=showTilt?Object.keys(dowCount).sort((a,b)=>dowCount[b]-dowCount[a])[0]:null;
  const topHour=showTilt?Object.keys(hourCount).sort((a,b)=>hourCount[b]-hourCount[a])[0]:null;
  const when=topHour!=null&&hourCount[+topHour]>=2
    ?`most often on <span class="hi-r">${DOW_NAMES[+topDow!]}s around ${fmtHour(+topHour)}</span>`
    :`most often on <span class="hi-r">${DOW_NAMES[+topDow!]}s</span>`;

  // Setup cards
  const setupNames = [...new Set(T.map(t=>t.setup))].filter(n=>n&&n!=="—");
  const setupCards = setupNames.map(name=>{
    const g=T.filter(t=>t.setup===name), b=repBucket(g);
    const pat=repBucket(g.filter(isConfirmed)), forced=repBucket(g.filter(t=>!isConfirmed(t)));
    let split;
    if(pat.n>=2&&forced.n>=2) split=`<span class="hi-g">${pat.wr}% when patient</span> · <span class="hi-r">${forced.wr}% when forced</span>`;
    else if(pat.n>=2) split=`<span class="hi-g">${pat.wr}% when patient</span> · <span style="color:var(--mut)">forced n/a</span>`;
    else if(forced.n>=2) split=`<span style="color:var(--mut)">patient n/a</span> · <span class="hi-r">${forced.wr}% when forced</span>`;
    else split=`<span style="color:var(--mut)">tag more trades to split patient vs forced</span>`;
    return {pnl:b.pnl,html:`<div class="setup-card"><div class="sc-name">${name}</div><div class="sc-net" style="color:${b.pnl>=0?"var(--green)":"var(--red)"}">${fmt(b.pnl)}</div><div class="sc-meta">${b.n} trades · ${b.wr}% win${b.avgR!=null?" · "+(b.avgR>=0?"+":"")+b.avgR.toFixed(2)+"R avg":""}</div><div class="sc-split">${split}</div></div>`};
  }).sort((a,b)=>b.pnl-a.pnl);

  // Insight spotlight
  const tradedDays=dowIdx.filter(i=>dowN[i]>=2);
  let showSpot=false, spotText="";
  if(tradedDays.length>=2){
    let worst=tradedDays[0]; tradedDays.forEach(i=>{if(dowPnl[i]<dowPnl[worst])worst=i;});
    let best=tradedDays[0];  tradedDays.forEach(i=>{if(dowPnl[i]>dowPnl[best])best=i;});
    const parts=[];
    if(dowPnl[worst]<0) parts.push(`<b style="color:var(--red)">${DOW_NAMES[worst]}s</b> are your worst day (${fmt(dowPnl[worst])} over ${dowN[worst]} trades)`);
    if(dowPnl[best]>0&&best!==worst) parts.push(`<b style="color:var(--green)">${DOW_NAMES[best]}s</b> are your best (${fmt(dowPnl[best])})`);
    if(parts.length){showSpot=true; spotText=parts.join(" · ");}
  }

  // Sort strat table
  const sortedStrat = [...byStrat].sort((a,b)=>b.pnl-a.pnl);

  useEffect(() => {
    if (!chartReady || !T.length) return;
    // Drawdown
    const sortedT = [...T].sort((a,b)=>a.date.localeCompare(b.date));
    let cum=0, peak=0; const pts: number[]=[], dlabels: string[]=[];
    sortedT.forEach(t=>{cum+=t._pnl;if(cum>peak)peak=cum;pts.push(+(cum-peak).toFixed(0));dlabels.push(t.date);});
    mkChart("r-drawdown",{type:"line",data:{labels:dlabels,datasets:[{data:pts,borderColor:"#f0556d",backgroundColor:"rgba(240,85,109,.12)",fill:true,tension:.15,pointRadius:0,borderWidth:2}]},options:{...BASE_OPTS,plugins:{legend:{display:false}},scales:{x:{...CG,ticks:{display:false}},y:CG}}});
    // Duration
    const wins2=T.filter(t=>t._pnl>0),losses2=T.filter(t=>t._pnl<0);
    const durs: {min:number;win:boolean}[]=[];
    T.forEach(t=>{const e=parseMin(t.entryTime),x=parseMin(t.exitTime);if(e!=null&&x!=null){let d=x-e;if(d<0)d+=1440;durs.push({min:d,win:t._pnl>0});}});
    const durEl=document.getElementById("r-dur"),emptyEl=document.getElementById("r-dur-empty");
    if(durEl&&emptyEl){
      if(!durs.length){(durEl as HTMLElement).style.display="none";emptyEl.style.display="block";}
      else{
        (durEl as HTMLElement).style.display="";emptyEl.style.display="none";
        const buckets=[["under 1m",0,1],["1–2m",1,2],["2–5m",2,5],["5–10m",5,10],["10–30m",10,30],["30m–1h",30,60],["1–4h",60,240],["4h+",240,Infinity]] as [string,number,number][];
        const winData=buckets.map(()=>0),lossData=buckets.map(()=>0);
        durs.forEach(d=>{const bi=buckets.findIndex(b=>d.min>=b[1]&&d.min<b[2]);if(bi>=0){if(d.win)winData[bi]++;else lossData[bi]++;}});
        mkChart("r-dur",{type:"bar",data:{labels:buckets.map(b=>b[0]),datasets:[{label:"Wins",data:winData,backgroundColor:"#26d07c",borderRadius:4},{label:"Losses",data:lossData,backgroundColor:"#f0556d",borderRadius:4}]},options:{...BASE_OPTS,indexAxis:"y",plugins:{legend:{display:true,labels:{color:"#8a93a3",font:{size:10}}}},scales:{x:{...CG,stacked:true},y:{...CG,stacked:true}}}});
      }
    }
    // Strategy
    mkChart("r-strat",{type:"bar",data:{labels:byStrat.map(s=>s.name.length>12?s.name.slice(0,11)+"…":s.name),datasets:[{data:byStrat.map(s=>+s.pnl.toFixed(0)),backgroundColor:byStrat.map(s=>col(s.pnl)),borderRadius:6}]},options:{...BASE_OPTS,plugins:{legend:{display:false}},scales:{x:CG,y:CG}}});
    // DOW
    mkChart("r-dow",{type:"bar",data:{labels:dowIdx.map(i=>DOW_NAMES[i].slice(0,3)),datasets:[{data:dowIdx.map(i=>+dowPnl[i].toFixed(0)),backgroundColor:dowIdx.map(i=>col(dowPnl[i])),borderRadius:6}]},options:{...BASE_OPTS,plugins:{legend:{display:false}},scales:{x:CG,y:CG}}});
    // Grade
    mkChart("r-grade",{type:"bar",data:{labels:grades,datasets:[{data:byGrade.map(v=>+v.toFixed(0)),backgroundColor:byGrade.map(col),borderRadius:6}]},options:{...BASE_OPTS,plugins:{legend:{display:false}},scales:{x:CG,y:CG}}});
    // Instrument
    mkChart("r-inst",{type:"bar",data:{labels:insts,datasets:[{data:byInst.map(v=>+v.toFixed(0)),backgroundColor:byInst.map(col),borderRadius:6}]},options:{...BASE_OPTS,plugins:{legend:{display:false}},scales:{x:CG,y:CG}}});
  }, [chartReady, JSON.stringify(T.map(t=>({d:t.date,p:t._pnl})))]);

  const avgWin  = T.filter(t=>t._pnl>0).reduce((a,t)=>a+t._pnl,0) / (T.filter(t=>t._pnl>0).length||1);
  const avgLoss = T.filter(t=>t._pnl<0).reduce((a,t)=>a+t._pnl,0) / (T.filter(t=>t._pnl<0).length||1);
  const dursAll: {min:number;win:boolean}[]=[];
  T.forEach(t=>{const e=parseMin(t.entryTime),x=parseMin(t.exitTime);if(e!=null&&x!=null){let d=x-e;if(d<0)d+=1440;dursAll.push({min:d,win:t._pnl>0});}});
  const avgDur = dursAll.length ? dursAll.reduce((a,d)=>a+d.min,0)/dursAll.length : null;

  return (
    <div>
      {/* Confirmation diag */}
      {showConf && (
        <div className={`diag ${gap>0?"good":""}`}>
          <div className="diag-lbl">◎ Confirmation discipline</div>
          <div className="diag-head" dangerouslySetInnerHTML={{__html:confHead}}/>
          <div className="cmp">
            <div className="cmp-col win">
              <h5>Waited · followed plan</h5>
              <div className="cmp-big" style={{color:"var(--green)"}}>{conf.wr}%<span style={{fontSize:13,color:"var(--mut)",fontWeight:600}}> win</span></div>
              <div className="cmp-row"><span>Trades</span><span>{conf.n}</span></div>
              <div className="cmp-row"><span>Net P&L</span><span style={{color:conf.pnl>=0?"var(--green)":"var(--red)"}}>{fmt(conf.pnl)}</span></div>
              <div className="cmp-row"><span>Avg / trade</span><span style={{color:conf.exp>=0?"var(--green)":"var(--red)"}}>{fmt(conf.exp)}</span></div>
              {conf.avgR!=null&&<div className="cmp-row"><span>Avg R</span><span>{(conf.avgR>=0?"+":"")+conf.avgR.toFixed(2)}R</span></div>}
            </div>
            <div className="cmp-col lose">
              <h5>Chased · forced · no plan</h5>
              <div className="cmp-big" style={{color:"var(--red)"}}>{imp.wr}%<span style={{fontSize:13,color:"var(--mut)",fontWeight:600}}> win</span></div>
              <div className="cmp-row"><span>Trades</span><span>{imp.n}</span></div>
              <div className="cmp-row"><span>Net P&L</span><span style={{color:imp.pnl>=0?"var(--green)":"var(--red)"}}>{fmt(imp.pnl)}</span></div>
              <div className="cmp-row"><span>Avg / trade</span><span style={{color:imp.exp>=0?"var(--green)":"var(--red)"}}>{fmt(imp.exp)}</span></div>
              {imp.avgR!=null&&<div className="cmp-row"><span>Avg R</span><span>{(imp.avgR>=0?"+":"")+imp.avgR.toFixed(2)}R</span></div>}
            </div>
          </div>
        </div>
      )}

      {/* Tilt diag */}
      {showTilt && (
        <div className="diag alert">
          <div className="diag-lbl">⚠ Frustration loop</div>
          <div className="diag-head" dangerouslySetInnerHTML={{__html:`<span class="hi-r">${loops.length} trades</span> carried frustration into the entry — tagged revenge/oversized/FOMO/chased, or re-entered within 20 minutes of a loss. They hit ${when}, and won only <b>${lb.wr}%</b> vs your <b>${baseline.wr}%</b> overall.`}}/>
          <div className="diag-stats">
            <div><div className="ds-l">Cost of the loop</div><b style={{color:lb.pnl>=0?"var(--green)":"var(--red)"}}>{fmt(lb.pnl)}</b></div>
            <div><div className="ds-l">Loop win rate</div><b style={{color:"var(--red)"}}>{lb.wr}%</b></div>
            <div><div className="ds-l">Avg / loop trade</div><b style={{color:lb.exp>=0?"var(--green)":"var(--red)"}}>{fmt(lb.exp)}</b></div>
          </div>
        </div>
      )}

      {/* Setup cards */}
      {setupCards.length>0&&<>
        <div className="diag-lbl" style={{display:"block",marginBottom:8}}>⚓ Setup performance — patient vs forced</div>
        <div className="setup-grid" dangerouslySetInnerHTML={{__html:setupCards.map(c=>c.html).join("")}}/>
      </>}

      {/* Pattern spotlight */}
      {showSpot&&(
        <div className="card" style={{marginBottom:14,borderColor:"var(--gold)"}}>
          <div className="lbl" style={{color:"var(--gold)"}}>⚑ Pattern spotlight</div>
          <div style={{fontSize:15,fontWeight:600,marginTop:6}} dangerouslySetInnerHTML={{__html:spotText}}/>
        </div>
      )}

      {/* Insight cards */}
      {T.length>0&&(
        <div className="ins-grid">
          <div className="ins-card"><div className="il">Most Active</div><div className="iv">{activeDay>=0?DOW_NAMES[activeDay]:"—"}</div><div className="is">{maxN} trades on those days</div></div>
          <div className="ins-card"><div className="il">Most Profitable</div><div className="iv" style={{color:"var(--green)"}}>{bestDay>=0?DOW_NAMES[bestDay]:"—"}</div><div className="is">{bestDay>=0?fmt(bestV):""}</div></div>
          <div className="ins-card"><div className="il">Least Profitable</div><div className="iv" style={{color:"var(--red)"}}>{worstDay>=0?DOW_NAMES[worstDay]:"—"}</div><div className="is">{worstDay>=0?fmt(worstV):""}</div></div>
          <div className="ins-card"><div className="il">Trade Direction</div><div className="iv">{dir}</div><div className="is">{longN} long · {shortN} short</div></div>
        </div>
      )}

      {/* Drawdown + Duration */}
      <div className="chart-grid even">
        <div className="panel">
          <h3>Drawdown Curve <span>peak-to-trough of cumulative P&L</span></h3>
          <div className="chart-box"><canvas id="r-drawdown"/></div>
        </div>
        <div className="panel">
          <h3>Duration Analysis <span>needs entry/exit times</span></h3>
          <div id="r-dur-stats" style={{display:"flex",gap:24,flexWrap:"wrap",marginBottom:12,fontSize:13}}>
            <div><span style={{color:"var(--mut)"}}>Avg Win</span> <b style={{color:"var(--green)"}}>{fmt(avgWin)}</b></div>
            <div><span style={{color:"var(--mut)"}}>Avg Loss</span> <b style={{color:"var(--red)"}}>{fmt(avgLoss)}</b></div>
            {avgDur!=null&&<div><span style={{color:"var(--mut)"}}>Avg Duration</span> <b>{Math.floor(avgDur/60)?Math.floor(avgDur/60)+"h ":""}{Math.round(avgDur%60)}m</b></div>}
          </div>
          <div className="chart-box"><canvas id="r-dur"/></div>
          <div id="r-dur-empty" style={{display:"none",color:"var(--dim)",fontSize:12,textAlign:"center",padding:20}}>Add entry &amp; exit times on your trades to see how long winners vs losers are held.</div>
        </div>
      </div>

      {/* Strategy + DOW */}
      <div className="chart-grid even">
        <div className="panel"><h3>Net P&L by Strategy</h3><div className="chart-box"><canvas id="r-strat"/></div></div>
        <div className="panel"><h3>Net P&L by Day of Week <span>spot your worst day</span></h3><div className="chart-box"><canvas id="r-dow"/></div></div>
      </div>

      {/* Grade + Instrument */}
      <div className="chart-grid even">
        <div className="panel"><h3>Net P&L by Grade <span>does A+ pay?</span></h3><div className="chart-box sm"><canvas id="r-grade"/></div></div>
        <div className="panel"><h3>Net P&L by Instrument</h3><div className="chart-box sm"><canvas id="r-inst"/></div></div>
      </div>

      {/* Strategy breakdown table */}
      <div className="panel" style={{marginTop:14}}>
        <h3>Strategy Breakdown</h3>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Strategy</th><th>Trades</th><th>Win %</th><th>Net P&L</th><th>Avg R</th><th>Expectancy</th></tr></thead>
            <tbody>
              {sortedStrat.map(s=>{
                const wr = s.n?Math.round(s.wins/s.n*100):0;
                const avgR = s.rs.length?s.rs.reduce((a,b)=>a+b,0)/s.rs.length:0;
                return (
                  <tr key={s.name}>
                    <td>{s.name}</td><td>{s.n}</td><td>{wr}%</td>
                    <td className={s.pnl>=0?"pos":"neg"}>{fmt(s.pnl)}</td>
                    <td className={avgR>=0?"pos":"neg"}>{(avgR>=0?"+":"")+avgR.toFixed(2)}R</td>
                    <td className={avgR>=0?"pos":"neg"}>{(avgR>=0?"+":"")+avgR.toFixed(2)}R</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-tab: Trading System
// ─────────────────────────────────────────────────────────────
function SystemView({ db, T, onOpenStrat }: { db: JournalDB; T: FilteredTrade[]; onOpenStrat: (id: string) => void }) {
  const strats = db.strategies || [];
  const all = T;
  const trust = all.length ? Math.round(all.filter(isConfirmed).length/all.length*100) : 0;
  const word  = trust>=70?"strong":trust>=45?"mixed":"shaky";
  const head  = all.length
    ? `Across every logged trade you took your system <b>${trust}%</b> of the time with confirmation and the plan followed — that's <b style="color:${trustColor(trust)}">${word}</b> trust in your edge. The rest were chased, forced, or off-plan.`
    : "No trades logged yet. Once you start logging, this page shows whether you actually wait for and trust each setup.";
  const R = psychRules(db);

  function stratTrades(s: Strategy) { return T.filter(t=>t.setupId===s.id||t.setup===s.name); }

  const masteries = strats.map(s => ({s, m:strategyMastery(s, stratTrades(s))}));
  const started   = masteries.filter(x=>x.m.reps>0);
  const anyDeep   = masteries.some(x=>x.m.reps>=25);

  return (
    <div>
      <div className="coach-strip">
        <span>🏴‍☠️ <b>Your committed rules</b></span>
        <span>stop after <b>{R.maxLoss}</b> losses</span>
        <span>max <b>{R.maxTrades}</b> trades/day</span>
        <span>rapid = <b>≤{R.rapidMin}m</b></span>
        <span style={{opacity:.6}}>— the lens every verdict is measured against</span>
      </div>

      {started.length>=3&&!anyDeep&&(
        <div className="hop-banner">⚓ You've started <b>{started.length}</b> setups and none has even 25 reps. Mastery comes from depth, not collection — a setup needs ~100 clean reps before you can trust it. Pick one and put the reps in.</div>
      )}

      <div className="card" style={{marginBottom:18}}>
        <div className="diag-head" style={{margin:0}} dangerouslySetInnerHTML={{__html:head}}/>
      </div>

      <div className="sd-section" style={{marginTop:0}}>Your setups</div>
      <div className="sys-cards">
        {masteries.map(({s,m})=>{
          const g = stratTrades(s), b = m.b;
          const tr = g.length ? Math.round(g.filter(isConfirmed).length/g.length*100) : null;
          const meta = g.length ? `${b.n} trades · ${b.wr}% win${b.avgR!=null?" · "+(b.avgR>=0?"+":"")+b.avgR.toFixed(2)+"R":""}` : "No trades logged yet";
          return (
            <div key={s.id} className="scard" onClick={()=>onOpenStrat(s.id)}>
              <div className="sh">
                <h4>{s.name}</h4>
                {g.length
                  ? <span className="mchip" style={{background:m.state==="Mastered"?"rgba(38,208,124,.16)":m.state==="No edge"?"rgba(240,85,109,.16)":"rgba(212,169,72,.16)",color:m.state==="Mastered"?"var(--green)":m.state==="No edge"?"var(--red)":"var(--gold)"}}>{m.state}</span>
                  : <span className="trust-pill" style={{background:"var(--panel2)",color:"var(--mut)"}}>no data</span>
                }
              </div>
              <div className="snet" style={{color:b.pnl>=0?"var(--green)":"var(--red)"}}>{g.length?fmt(b.pnl):"—"}</div>
              <div className="smeta">{meta}</div>
              {m.state==="Developing"&&g.length>0&&<>
                <div className="m-prog"><i style={{width:m.progress+"%"}}/></div>
                <div style={{fontSize:11,color:"var(--mut)",marginTop:5}}>{m.reps} / {MASTERY_REPS} reps to mastered</div>
              </>}
              <div className="strust">
                <span style={{color:"var(--mut)"}}>{g.length?(tr+"% trusted"):(s.criteria?s.criteria.length+" criteria":"")}</span>
                <span style={{color:"var(--mut)"}}>view details →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-tab: Strat Detail (drilled from System)
// ─────────────────────────────────────────────────────────────
function StratDetailView({ db, T, stratId, onBack }: { db: JournalDB; T: FilteredTrade[]; stratId: string; onBack: ()=>void }) {
  const s = (db.strategies||[]).find(x=>x.id===stratId);
  if (!s) return null;
  const g = T.filter(t=>t.setupId===s.id||t.setup===s.name);
  const b = repBucket(g);
  const m = strategyMastery(s, g);
  const M = stratMoney(db, g);
  const driftWarn = (m.last&&(m.last as any).drift)?" Your last check-in said the criteria have loosened — that's comfort, not mastery. Tighten back up.":"";
  let mbTxt="", cls="";
  if(m.state==="Mastered"){cls="master";mbTxt=`<b>Mastered.</b> ${m.reps} reps with steady results — you know this setup. Over-trading it now is churn, not learning. Protect the edge, don't dilute it.`;}
  else if(m.state==="No edge"){cls="noedge";mbTxt=`<b>No edge found.</b> ${m.reps} reps and it's still ${fmt(m.b.exp)}/trade. That isn't a discipline problem — the setup isn't producing. Test a different approach instead of grinding a ${m.reps+1}th rep.`;}
  else{cls="dev";mbTxt=`<b>Developing — ${m.reps} of ${MASTERY_REPS} reps.</b> At this stage, volume can be deliberate practice, not over-trading. So far ${m.b.wr}% win, ${m.b.exp>=0?"+":""}${fmt(m.b.exp)}/trade.${driftWarn}`;}
  const disagree = (m.override&&m.override!==m.mathState)?`<div class="m-override" style="color:var(--gold)">⚑ You marked this <b>${m.override}</b>; the data reads <b>${m.mathState}</b> (${m.reps} reps${m.stable?"":", results still swinging"}).</div>`:"";
  const trust = g.length?Math.round(g.filter(isConfirmed).length/g.length*100):0;
  const discVals=g.map(t=>parseInt((t as any).disc)).filter(v=>!isNaN(v));
  const avgDisc=discVals.length?(discVals.reduce((a,b)=>a+b,0)/discVals.length):null;
  const critLen=s.criteria?s.criteria.length:0;
  const fullCrit=critLen?g.filter(t=>(t.metCrit||[]).length>=critLen).length:0;
  const fullCritPct=g.length?Math.round(fullCrit/g.length*100):0;
  const cleanN=g.filter(t=>!repTagAny(t,["Forced","Rushed","Sloppy","Chased entry"])).length;
  const cleanPct=g.length?Math.round(cleanN/g.length*100):0;
  const execTags: Record<string,number>={};
  g.forEach(t=>(t.tags as any)?.execution?.forEach((x:string)=>execTags[x]=(execTags[x]||0)+1));
  const topExec=topCount(execTags);
  const emo: Record<string,number>={};
  g.forEach(t=>(t.tags as any)?.feelings?.forEach((f:string)=>emo[f]=(emo[f]||0)+1));
  const topEmo=topCount(emo);
  const instNet: Record<string,number>={},instN: Record<string,number>={},instW: Record<string,number>={};
  g.forEach(t=>{instNet[t.inst]=(instNet[t.inst]||0)+t._pnl;instN[t.inst]=(instN[t.inst]||0)+1;if(t._pnl>0)instW[t.inst]=(instW[t.inst]||0)+1;});
  const instsK=Object.keys(instNet);
  const bestInst=instsK.length?instsK.slice().sort((a,b)=>instNet[b]-instNet[a])[0]:null;
  const worstInst=instsK.length?instsK.slice().sort((a,b)=>instNet[a]-instNet[b])[0]:null;
  const wins2=g.filter(t=>t._pnl>0),losses2=g.filter(t=>t._pnl<0);
  const grossWin=wins2.reduce((a,t)=>a+t._pnl,0),grossLoss=losses2.reduce((a,t)=>a+t._pnl,0);
  const worstLoss=losses2.length?Math.min(...losses2.map(t=>t._pnl)):0;
  const avgLoss2=losses2.length?grossLoss/losses2.length:0;
  const pf=grossLoss<0?(grossWin/Math.abs(grossLoss)):(grossWin>0?Infinity:0);

  const stat=(l:string,v:string,sub?:string,vc?:string)=>(
    <div className="sd-stat" key={l}>
      <div className="l">{l}</div>
      <div className="v" style={vc?{color:vc} as any:{}}>{v}</div>
      {sub&&<div className="s">{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
        <button className="btn" onClick={onBack}>←</button>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>{s.name}</h2>
        <span style={{flex:1}}/>
        {g.length>0&&<span style={{fontSize:22,fontWeight:800,color:b.pnl>=0?"var(--green)":"var(--red)"}}>{fmt(b.pnl)}</span>}
      </div>

      {g.length===0?(
        <div className="diag-empty">No trades logged for <b>{s.name}</b> yet.</div>
      ):(
        <>
          <div className={`m-banner ${cls}`} dangerouslySetInnerHTML={{__html:mbTxt+`<div class="m-override">Mastery call: <span style="color:var(--gold)">${m.state}</span><span style="opacity:.6"> — override in Strategies view</span></div>${disagree}`}}/>
          <div className="sd-grid">
            {stat("Win rate",b.wr+"%",b.wins+" of "+b.n+" trades")}
            {stat("Net P&L",fmt(b.pnl),"all accounts",b.pnl>=0?"var(--green)":"var(--red)")}
            {stat("Expectancy",fmt(b.exp),"per trade",b.exp>=0?"var(--green)":"var(--red)")}
            {stat("Avg R",b.avgR!=null?(b.avgR>=0?"+":"")+b.avgR.toFixed(2)+"R":"—","realized reward")}
            {stat("Profit factor",pf===Infinity?"∞":pf.toFixed(2),"gross win ÷ loss")}
            {stat("Trust",trust+"%","taken with confirmation",trustColor(trust))}
          </div>
          <div className="sd-section">Money — real vs sim</div>
          <div className="sd-grid">
            {stat("Real made",fmt(M.realMade),"funded · live · personal","var(--green)")}
            {stat("Real lost",fmt(M.realLost),"funded · live · personal","var(--red)")}
            {stat("Sim made",fmt(M.simMade),"evaluation phase")}
            {stat("Sim lost",fmt(M.simLost),"evaluation phase")}
          </div>
          <div className="sd-section">Preparation — did you wait for it?</div>
          <div className="sd-grid">
            {stat("Confirmation",trust+"%","followed plan, no chase",trustColor(trust))}
            {stat("Full checklist",fullCritPct+"%","met all "+critLen+" criteria")}
            {stat("Avg discipline",avgDisc!=null?avgDisc.toFixed(1)+" /12":"—","self-scored")}
          </div>
          <div className="sd-section">Execution</div>
          <div className="sd-grid">
            {stat("Clean execution",cleanPct+"%","no forced/rushed/sloppy",cleanPct>=70?"var(--green)":"")}
            {stat("Most common note",topExec?topExec.key:"—",topExec?topExec.n+" times":"no execution tags")}
            {stat("Top emotion",topEmo?topEmo.key:"—",topEmo?topEmo.n+" trades felt this":"no feelings tagged")}
          </div>
          <div className="sd-section">Loss</div>
          <div className="sd-grid">
            {stat("Total lost",fmt(grossLoss),losses2.length+" losing trades","var(--red)")}
            {stat("Avg loss",fmt(avgLoss2),"per losing trade","var(--red)")}
            {stat("Worst loss",fmt(worstLoss),"single trade","var(--red)")}
          </div>
          <div className="sd-section">Alpha — where the edge lives</div>
          <div className="sd-grid">
            {stat("Best market",bestInst||"—",bestInst?fmt(instNet[bestInst])+" · "+Math.round((instW[bestInst]||0)/instN[bestInst]*100)+"% win":"")}
            {stat("Weakest market",(worstInst&&worstInst!==bestInst)?worstInst:"—",(worstInst&&worstInst!==bestInst)?fmt(instNet[worstInst]):"")}
            {stat("Gross profit",fmt(grossWin),wins2.length+" winning trades","var(--green)")}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-tab: Eval Gauntlet
// ─────────────────────────────────────────────────────────────
function EvalView({ db }: { db: JournalDB }) {
  const props = (db.accounts||[]).filter(a=>a.type==="prop");
  const evals = props.filter(a=>{
    if(a.status==="blown")return false;
    const p=activePhase(a); return p&&(p as any).kind==="eval";
  });

  // House board
  let fees=0, payouts=0;
  props.forEach(a=>{fees+=acctTotalCost(a);payouts+=((a as any).payouts||[]).reduce((s:number,r:any)=>s+(r.amount||0),0);});
  const losses2=props.filter(a=>a.status==="blown").length;
  const wins2=props.filter(a=>{const p=activePhase(a);return a.status!=="blown"&&p&&((p as any).kind==="funded"||(p as any).kind==="live");}).length;
  const houseNet=fees-payouts;
  let quip="";
  if(houseNet<=0) quip=`<span class="hi-g">You're up ${fmt(-houseNet)} on the house.</span> Rare air — protect it, don't get cute with size.`;
  else if(losses2===0&&wins2>0) quip=`<span class="hi-g">First blood is yours.</span> The house is still up ${fmt(houseNet)} in fees — clear a payout and flip this board.`;
  else if(losses2>0&&wins2===0) quip=`Blown <b class="hi-r">${losses2}</b>, cleared <b>0</b>. The house is up <b class="hi-r">${fmt(houseNet)}</b> on you. Back to boot camp — smallest size, cleanest setups, one rep at a time.`;
  else quip=`House is up <b class="hi-r">${fmt(houseNet)}</b>. You've cleared <b>${wins2}</b> and blown <b class="hi-r">${losses2}</b> — grind the edge, not the size.`;

  return (
    <div>
      {fees>0||payouts>0?(
        <div className={`house-board${houseNet<=0?" up":""}`}>
          <div className="hb-top">🏴‍☠️ House vs. you — lifetime</div>
          <div className="hb-row">
            <div className="hb-stat">
              <div className="hl">{houseNet>0?"The house is up":"You're up on the house"}</div>
              <div className="hv" style={{color:houseNet>0?"var(--red)":"var(--green)"}}>{houseNet>0?fmt(houseNet):fmt(-houseNet)}</div>
            </div>
            <div className="hb-stat">
              <div className="hl">Record</div>
              <div className="hb-rec"><b className="hi-g">{wins2}</b><span style={{color:"var(--mut)"}}> W</span> – <b className="hi-r">{losses2}</b><span style={{color:"var(--mut)"}}> L</span></div>
            </div>
            <div className="hb-stat"><div className="hl">Fees fed to the house</div><div className="hv">{fmt(fees)}</div></div>
            {payouts>0&&<div className="hb-stat"><div className="hl">Clawed back</div><div className="hv" style={{color:"var(--green)"}}>{fmt(payouts)}</div></div>}
          </div>
          <div className="hb-quip" dangerouslySetInnerHTML={{__html:quip}}/>
        </div>
      ):null}

      {evals.length===0?(
        <div className="diag-empty">
          {props.length?"No <b>active</b> evaluation accounts right now — your evals are passed or blown. Start a new eval and the gauntlet lights back up.":"No prop evaluation account yet. The gauntlet is where you see how the house tilts the odds, your real pass probability, and the size that keeps you alive. <b>Go grab an eval</b> — add a Prop account on the Accounts page and start the fight."}
        </div>
      ):(
        evals.map(a=><EvalPanel key={a.id} db={db} a={a}/>)
      )}
    </div>
  );
}

function EvalPanel({ db, a }: { db: JournalDB; a: Account }) {
  const sim = evalDrawdownSim(db, a.id);
  const p = activePhase(a);
  const { start, dd, floor, curBal, type } = sim;
  const target = (p as any)?.target || (a as any).target || 0;
  if (!target||!dd) {
    return (
      <div className="gpanel">
        <div className="ghdr"><h3>{a.name}</h3></div>
        <div className="diag-empty">Set this eval's profit target and max drawdown (edit the account) and the gauntlet appears.</div>
      </div>
    );
  }
  const res: {net:number}[] = [];
  db.trades.forEach(t=>{
    let net=0,has=false;
    (t.legs||[]).forEach(l=>{if(l.acct===a.id&&legPhaseId(a,l,t.date)===p?.id){net+=legNet(l);has=true;}});
    if(has)res.push({net});
  });
  const resArr=res;
  const winsR=resArr.filter(r=>r.net>0),lossesR=resArr.filter(r=>r.net<0);
  const avgWin=winsR.length?winsR.reduce((s,r)=>s+r.net,0)/winsR.length:0;
  const avgLoss=lossesR.length?Math.abs(lossesR.reduce((s,r)=>s+r.net,0)/lossesR.length):0;
  const winRate=resArr.length?Math.round(winsR.length/resArr.length*100):0;
  const rr=avgLoss>0?avgWin/avgLoss:0;
  const breakeven=rr>0?Math.round(1/(1+rr)*100):null;
  const byDate: Record<string,{net:number}> = {};
  resArr.forEach((_,i)=>{}); // placeholder — we need date-keyed
  // We need date for consistency; fetch from trades again
  const daily: {net:number}[] = [];
  const byDateMap: Record<string,number> = {};
  db.trades.forEach(t=>{
    let net=0,has=false;
    (t.legs||[]).forEach(l=>{if(l.acct===a.id&&legPhaseId(a,l,t.date)===p?.id){net+=legNet(l);has=true;}});
    if(has){byDateMap[t.date]=(byDateMap[t.date]||0)+net;}
  });
  Object.values(byDateMap).forEach(net=>daily.push({net}));
  const cons=consistencyScore(daily);
  const cushion=Math.max(0,curBal-floor);
  const f=cons.score==null?0.07:(cons.score>=70?0.10:cons.score>=45?0.07:0.05);
  const riskPer=cushion*f, rope=riskPer>0?Math.floor(cushion/riskPer):0;
  const toTarget=Math.max(0,target-curBal);
  const rMult=rr>0?rr:1.5;
  const tradesToTarget=(riskPer>0&&toTarget>0)?Math.ceil(toTarget/(riskPer*rMult)):0;
  const targetDist=target-start, ropeDist=dd, skew=ropeDist>0?targetDist/ropeDist:0;
  const odds=monteCarloPass(curBal,floor,target,dd,type,resArr);
  const span=target-floor, posRaw=span>0?(curBal-floor)/span*100:50;
  const pos=Math.max(2,Math.min(98,posRaw)), pct=Math.max(0,Math.min(100,Math.round(posRaw)));
  const tiltMsg=skew>1
    ?`The house set the target at <b class="hi-g">+${fmt(targetDist)}</b> but the trapdoor at <b class="hi-r">−${fmt(ropeDist)}</b> — you must earn <b>${skew.toFixed(2)}×</b> what you're allowed to lose. That's the silent edge. Survive the math; don't gamble it.`
    :`This eval is unusually fair — target <b>+${fmt(targetDist)}</b> vs rope <b>−${fmt(ropeDist)}</b> (${skew.toFixed(2)}×). Don't hand the edge back with oversize.`;
  const oddsColor=odds==null?"var(--mut)":(odds>=0.5?"var(--green)":odds>=0.25?"var(--gold)":"var(--red)");
  const consColor=cons.score==null?"var(--mut)":trustColor(cons.score);
  const consLabel=cons.score==null?"building":(cons.score>=70?"Sharp":cons.score>=45?"Building":"Erratic");
  const edgeLine=breakeven!=null
    ?`You win <b>${winRate}%</b> at <b>${rr.toFixed(2)}:1</b> reward-to-risk — break-even is <b>${breakeven}%</b>. ${winRate>breakeven?'<span class="hi-g">Your edge is real; the job is to size so variance can\'t blow you before it plays out.</span>':'<span class="hi-r">You\'re under break-even right now — sharpen the setup before you size up.</span>'}`
    :`Log a few more eval trades and this reads your real win rate, edge, and pass odds.`;

  return (
    <div className={`gpanel${skew>1?" tilt":""}`}>
      <div className="ghdr">
        <h3>{a.name}</h3>
        <span className="phase-tag k-eval">Evaluation</span>
        <span style={{flex:1}}/>
        <span style={{fontWeight:800}}>{fmt(curBal)}</span>
      </div>
      <div className="gcall" dangerouslySetInnerHTML={{__html:tiltMsg}}/>
      <div className="road">
        <div className="road-cur" style={{left:pos+"%"}}>{fmt(curBal)} · {pct}%</div>
        <div className="road-mark" style={{left:pos+"%"}}/>
      </div>
      <div className="road-ends">
        <span className="hi-r">⚠ BLOWN {fmt(floor)}</span>
        <span className="hi-g">PASS {fmt(target)} ⚑</span>
      </div>
      <div className="gstat-grid">
        <div className="gstat" style={{gridColumn:"span 2"}}>
          <div className="l">Your odds of passing</div>
          <div className="odds-big" style={{color:oddsColor}}>{odds==null?"—":Math.round(odds*100)+"%"}</div>
          <div className="s">{odds==null?"need ≥8 eval trades to simulate":"5,000 sims bootstrapped from your own results, current style"}</div>
        </div>
        <div className="gstat">
          <div className="l">Consistency</div>
          <div className="v" style={{color:consColor}}>{cons.score==null?"—":cons.score+"%"}</div>
          <div className="s">{consLabel}{cons.bestShare!=null?" · best day "+Math.round(cons.bestShare*100)+"% of gains":""}</div>
        </div>
        <div className="gstat">
          <div className="l">Suggested size</div>
          <div className="v">{fmt(riskPer)}</div>
          <div className="s">risk / trade · survives {rope} straight losses</div>
        </div>
        <div className="gstat">
          <div className="l">Road to target</div>
          <div className="v">{fmt(toTarget)}</div>
          <div className="s">{tradesToTarget?"~"+tradesToTarget+" clean trades at "+rMult.toFixed(1)+"R":"target reached"}</div>
        </div>
        <div className="gstat">
          <div className="l">Room to blow</div>
          <div className="v" style={{color:"var(--red)"}}>{fmt(cushion)}</div>
          <div className="s">{type} drawdown floor</div>
        </div>
      </div>
      <div className="gcall" style={{margin:"18px 0 0",fontSize:13,fontWeight:500,color:"var(--txt)"}} dangerouslySetInnerHTML={{__html:edgeLine}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-tab: Psychology
// ─────────────────────────────────────────────────────────────
function PsychView({ db, T }: { db: JournalDB; T: FilteredTrade[] }) {
  const R  = psychRules(db);
  const ST = computePsych(T, R);
  if (ST.length < 3) {
    return <div className="diag-empty">Log a few more trades — with feelings, actions and execution tagged — and this page reads your behavior and tells you the state you were actually in, whether you admit it or not.</div>;
  }
  const agg: Record<string,{n:number;pnl:number}> = {};
  [...PSY_STATES,"Flat"].forEach(k=>agg[k]={n:0,pnl:0});
  ST.forEach(t=>{agg[(t as any)._psy].n++;agg[(t as any)._psy].pnl+=t._pnl;});
  const total=ST.length;
  const neg=ST.filter(t=>PSY_NEG.includes((t as any)._psy));
  const negLoss=neg.filter(t=>t._pnl<0);
  const owned=negLoss.filter(t=>((t.tags as any)?.feelings||[]).some((f:string)=>NEG_FEEL.includes(f))).length;
  const denied=negLoss.filter(t=>{const F=((t.tags as any)?.feelings||[]);return F.some((f:string)=>POS_FEEL.includes(f));}).length;
  const honesty=negLoss.length?Math.round(owned/negLoss.length*100):null;
  let dom: string|null=null,domN=0;
  PSY_NEG.forEach(k=>{if(agg[k].n>domN){domN=agg[k].n;dom=k;}});
  let verdict="";
  if(dom&&domN>0){
    const a2=agg[dom],domLoss=negLoss.filter(t=>(t as any)._psy===dom);
    const ownedDom=domLoss.filter(t=>((t.tags as any)?.feelings||[]).some((f:string)=>NEG_FEEL.includes(f))).length;
    const deniedDom=domLoss.filter(t=>((t.tags as any)?.feelings||[]).some((f:string)=>POS_FEEL.includes(f))).length;
    verdict=`<div class="diag-lbl">⚑ The read</div><div class="diag-head">Your hand this period was <b style="color:${PSY_COLOR[dom]}">${dom}</b>. It ran <b>${a2.n}</b> of your ${total} trades and ${a2.pnl>=0?"somehow made":"cost you"} <b class="${a2.pnl>=0?"hi-g":"hi-r"}">${fmt(a2.pnl)}</b>${a2.pnl>=0?" — that's variance, not a green light":""}. You owned it <b>${ownedDom}</b> ${ownedDom===1?"time":"times"}. ${deniedDom>0?`The other <b class="hi-r">${deniedDom}</b> you logged yourself as calm or confident. That was the lie.`:""}</div>`;
  } else {
    const dn=agg.Discipline;
    verdict=`<div class="diag-lbl">⚑ The read</div><div class="diag-head"><b class="hi-g">Discipline</b> led your trades — ${dn.n} of ${total}, ${fmt(dn.pnl)}. The math backs what you felt. Keep trading like this and stop reading this page.</div>`;
  }
  const lies=negLoss.filter(t=>((t.tags as any)?.feelings||[]).some((f:string)=>POS_FEEL.includes(f))).sort((a,b)=>a._pnl-b._pnl).slice(0,5);
  const honestyColor=honesty==null?"var(--mut)":(honesty>=70?"var(--green)":honesty>=40?"var(--gold)":"var(--red)");

  return (
    <div>
      <div className={`diag ${dom?"alert":"good"}`} dangerouslySetInnerHTML={{__html:verdict}}/>
      <div className="sd-grid" style={{marginBottom:14}}>
        <div className="sd-stat"><div className="l">Self-honesty</div><div className="v" style={{color:honestyColor}}>{honesty==null?"—":honesty+"%"}</div><div className="s">{negLoss.length?"you owned "+owned+" of "+negLoss.length+" losing off-state trades":"no costly off-states detected"}</div></div>
        <div className="sd-stat"><div className="l">Times you lied to yourself</div><div className="v" style={{color:denied>0?"var(--red)":"var(--green)"}}>{denied}</div><div className="s">logged calm/confident while the math read a negative state</div></div>
        <div className="sd-stat"><div className="l">Clean state</div><div className="v" style={{color:"var(--green)"}}>{Math.round(agg.Discipline.n/total*100)}%</div><div className="s">{agg.Discipline.n} of {total} trades read as Discipline</div></div>
      </div>
      <div className="sd-section">State ledger — what you were actually in</div>
      <div className="panel">
        <div className="tbl-wrap">
          <table className="psy-table">
            <thead><tr><th>State</th><th>Trades</th><th>Net P&L</th><th>Avg / trade</th></tr></thead>
            <tbody>
              {PSY_STATES.map(k=>{
                const a2=agg[k]; if(!a2.n) return null;
                const pct=Math.round(a2.n/total*100);
                return (
                  <tr key={k}>
                    <td><span className="psy-name" style={{color:PSY_COLOR[k]}}>{k}</span><div className="psy-bar"><i style={{width:pct+"%",background:PSY_COLOR[k],display:"block",height:"100%",borderRadius:4}}/></div></td>
                    <td>{a2.n} <span style={{color:"var(--mut)"}}>({pct}%)</span></td>
                    <td className={a2.pnl>=0?"pos":"neg"}>{fmt(a2.pnl)}</td>
                    <td className={a2.n&&a2.pnl/a2.n>=0?"pos":"neg"}>{fmt(a2.n?a2.pnl/a2.n:0)}</td>
                  </tr>
                );
              })}
              {agg.Flat.n>0&&(
                <tr>
                  <td><span className="psy-name" style={{color:PSY_COLOR.Flat}}>Unread</span><div className="psy-bar"><i style={{width:Math.round(agg.Flat.n/total*100)+"%",background:PSY_COLOR.Flat,display:"block",height:"100%",borderRadius:4}}/></div><div style={{fontSize:10,color:"var(--mut)"}}>not enough tagged to read</div></td>
                  <td>{agg.Flat.n} <span style={{color:"var(--mut)"}}>({Math.round(agg.Flat.n/total*100)}%)</span></td>
                  <td>{fmt(agg.Flat.pnl)}</td>
                  <td>{fmt(agg.Flat.n?agg.Flat.pnl/agg.Flat.n:0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {lies.length>0&&<>
        <div className="sd-section">Where you lied to yourself</div>
        {lies.map((t,i)=>{
          const said=((t.tags as any)?.feelings||[]).filter((f:string)=>POS_FEEL.includes(f)).join(" & ");
          const why=((t as any)._psyWhy||[]).slice(0,2).join(", ");
          return (
            <div key={i} className="lie">
              <div className="when">{t.date}{t.inst?" · "+t.inst:""}{t.setup&&t.setup!=="—"?" · "+t.setup:""}</div>
              <div className="said">You logged <span style={{color:"var(--green)"}}>{said}</span>. It was <span style={{color:PSY_COLOR[(t as any)._psy]}}>{(t as any)._psy}</span>.</div>
              <div className="truth">{why?"What gave it away: "+why+". ":""}<span className={t._pnl>=0?"hi-g":"hi-r"}>{fmt(t._pnl)}</span></div>
            </div>
          );
        })}
      </>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-tab: Roadmap
// ─────────────────────────────────────────────────────────────
function RoadmapView({ db }: { db: JournalDB }) {
  const [goals, setGoals] = useState<Record<string,number>>({});
  const personals = (db.accounts||[]).filter(a=>a.type==="personal"&&a.status!=="blown");
  if (!personals.length) {
    return <div className="diag-empty">No active personal account yet. The Roadmap is your self-funded journey — deposit to goal, the real size your balance actually supports, an honest ETA at your own pace, and your risk of busting before you arrive. Add a <b>Personal (futures)</b> account on the Accounts page to chart the course.</div>;
  }
  return <>{personals.map(a=><RoadmapPanel key={a.id} db={db} a={a} pct={goals[a.id]||25} setPct={p=>setGoals(g=>({...g,[a.id]:p}))}/>)}</>;
}

function RoadmapPanel({ db, a, pct, setPct }: { db: JournalDB; a: Account; pct: number; setPct: (p:number)=>void }) {
  const start = +(a.bal||0), realized = acctPnl(db, a.id), bal = start+realized;
  const ms = marginSim(a);
  const goalAmt = start*(1+pct/100), toGo = goalAmt-bal;
  const span = goalAmt-start, progress = span>0?Math.max(0,Math.min(100,Math.round((bal-start)/span*100))):0;
  const losers: number[] = [];
  db.trades.forEach(t=>(t.legs||[]).forEach(l=>{if(l.acct===a.id){const net=legNet(l);if(net<0&&(l as any).size>0)losers.push(Math.abs(net)/(l as any).size);}}));
  const riskC=losers.length?losers.reduce((x,y)=>x+y,0)/losers.length:null;
  const rPct=(riskC&&bal>0)?(riskC/bal*100):null;
  let sizing="";
  if(!riskC){sizing="Log a few losing trades with contract size and this shows the real dollars you put at risk per contract — the number that decides how many you can responsibly hold.";}
  else{const lump=(n:number)=>`${n}: <b>${fmt(riskC*n)}</b> (${(rPct!*n).toFixed(1)}%)`;
    sizing=`Your average losing trade risks about <b>${fmt(riskC)}</b> per contract — <b>${rPct!.toFixed(1)}%</b> of this balance. Risk comes in lumps, not a clean 1%: ${lump(1)}, ${lump(2)}, ${lump(3)}. Add size only as the balance earns the right to it.`;}
  const nets=acctTradeNets(db,a);
  const exp=nets.length?nets.reduce((s,x)=>s+x.net,0)/nets.length:0;
  const days=new Set(nets.map(x=>x.date)).size||1, tpd=nets.length/days;
  let eta="";
  if(toGo<=0) eta=`You've already cleared the <b>${pct}%</b> mark. Bank it, withdraw, or set a higher target — don't invent reasons to give it back.`;
  else if(exp<=0) eta=`Your expectancy is <b>${fmt(exp)}/trade</b> — not positive yet. The ${pct}% goal isn't reachable on current results. This is an edge problem, not a size problem; fix the edge before chasing the number.`;
  else{const tn=Math.ceil(toGo/exp),dn=tpd>0?Math.ceil(tn/tpd):null;
    eta=`At your real pace — <b>${fmt(exp)}/trade</b>, ~${tpd.toFixed(1)} trades/day — the <b>${pct}%</b> goal is about <b>${tn} trades</b>${dn?` (~${dn} trading days)`:""} away. That's the honest timeline. Forcing it faster is how the FOMO starts.`;}
  const sim=roadmapSim(db,a,goalAmt,bal);
  let ruin="";
  if(!sim.enough) ruin=`Need ~10 trades on this account to simulate this (have ${sim.reps}).`;
  else{const rc=sim.ruin>=40?"var(--red)":sim.ruin>=15?"var(--gold)":"var(--green)";
    ruin=`Running your own results forward 4,000 times: <b style="color:${rc}">${sim.ruin.toFixed(0)}% chance of busting</b> (hitting the ${fmt(sim.floor)} margin floor) before reaching the goal, <b style="color:var(--green)">${sim.reach.toFixed(0)}% chance of getting there</b>${sim.stall>5?`, ${sim.stall.toFixed(0)}% still grinding`:""}. `;}

  return (
    <div className="rm-panel">
      <div className="rm-head"><h3>{a.name}</h3><span className="acct-type">Personal{ms?" · "+ms.broker:""}</span></div>
      <div className="rm-bal">Deposited <b style={{color:"var(--txt)"}}>{fmt(start)}</b> → now <b style={{color:realized>=0?"var(--green)":"var(--red)"}}>{fmt(bal)}</b> <span style={{color:realized>=0?"var(--green)":"var(--red)"}}>({realized>=0?"+":""}{fmt(realized)})</span></div>
      <div className="rm-miles">
        {[25,50,100].map(p=>(
          <button key={p} className={`rm-mile${p===pct?" on":""}`} onClick={()=>setPct(p)}>
            <div className="rp">+{p}%</div>
            <div className="ra">{fmt(start*(1+p/100))}</div>
          </button>
        ))}
      </div>
      <div className="rm-hint">25% is the grown-up target — a serious, compoundable year. The bigger numbers are there, but they're how accounts get over-risked.</div>
      <div className="rm-prog"><i style={{width:progress+"%"}}/></div>
      <div style={{fontSize:12,color:"var(--mut)"}}>{progress}% of the way to {fmt(goalAmt)}{toGo>0?` · ${fmt(toGo)} to go`:" · cleared"}</div>
      <div className="rm-sec"><div className="rl">Sizing reality</div><span dangerouslySetInnerHTML={{__html:sizing}}/></div>
      <div className="rm-sec"><div className="rl">Honest ETA</div><span dangerouslySetInnerHTML={{__html:eta}}/></div>
      <div className="rm-sec"><div className="rl">Risk of ruin</div><span dangerouslySetInnerHTML={{__html:ruin}}/></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main ReportView
// ─────────────────────────────────────────────────────────────
export default function ReportView() {
  const { db } = useDB();
  const chartReady = useChartJS();
  const [sub, setSub]     = useState<SubTab>("perf");
  const [stratId, setStratId] = useState<string|null>(null);
  const [selAccts, setSelAccts] = useState<Set<string>>(new Set());
  const [showBlown, setShowBlown] = useState(false);
  const [from, setFrom]   = useState("");
  const [to,   setTo]     = useState("");
  const [chipsOpen, setChipsOpen] = useState(false);

  // Build filtered trades for the report (mirrors repTrades())
  const allow = new Set(db.accounts.filter(a=>showBlown||a.status!=="blown").map(a=>a.id));
  const T: FilteredTrade[] = db.trades
    .filter(t=>inDateRange(t.date,from,to))
    .map(t=>{
      const legs=(t.legs||[]).filter(l=>{
        if(!allow.has(l.acct))return false;
        return selAccts.size===0||selAccts.has(l.acct);
      });
      return {...t,_legs:legs,_pnl:legs.reduce((a,l)=>a+legNet(l),0)};
    })
    .filter(t=>t._legs.length>0);

  function goSub(name: SubTab) { setSub(name); setStratId(null); }

  function renderContent() {
    if (sub==="system"&&stratId) {
      return <StratDetailView db={db} T={T} stratId={stratId} onBack={()=>setStratId(null)}/>;
    }
    switch(sub) {
      case "perf":   return <PerfView T={T} chartReady={chartReady}/>;
      case "system": return <SystemView db={db} T={T} onOpenStrat={id=>{setStratId(id);}}/>;
      case "eval":   return <EvalView db={db}/>;
      case "psych":  return <PsychView db={db} T={T}/>;
      case "road":   return <RoadmapView db={db}/>;
    }
  }

  return (
    <div>
      {/* Filters — same pattern as DashView */}
      <div className="filters">
        <div className="fseg">
          <label className={`chip-toggle${chipsOpen?"":" collapsed"}`} onClick={()=>setChipsOpen(v=>!v)} style={{cursor:"pointer"}}>
            <span className="caret">▾</span> Accounts
          </label>
          {chipsOpen&&(
            <div style={{marginTop:6}}>
              <label className="blown-toggle">
                <input type="checkbox" checked={showBlown} onChange={e=>{setShowBlown(e.target.checked);if(!e.target.checked){setSelAccts(prev=>{const next=new Set(prev);db.accounts.filter(a=>a.status==="blown").forEach(a=>next.delete(a.id));return next;});}}}/>
                <span className="sw"/>
                show blown accounts
              </label>
              <div className="chips">
                <span className={`chip${selAccts.size===0?" on":""}`} onClick={()=>setSelAccts(new Set())}>All</span>
                {db.accounts.filter(a=>showBlown||a.status!=="blown").map(a=>(
                  <span key={a.id} className={`chip${selAccts.has(a.id)?" on":""}${a.status==="blown"?" blown-chip":""}`} onClick={()=>{const next=new Set(selAccts);next.has(a.id)?next.delete(a.id):next.add(a.id);setSelAccts(next);}}>
                    {a.name}{a.status==="blown"?" ✖":""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="fseg">
          <label>Date range</label>
          <div className="range-row">
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} title="From"/>
            <span style={{color:"var(--mut)"}}>→</span>
            <input type="date" value={to}   onChange={e=>setTo(e.target.value)}   title="To"/>
            <button className="btn sm" onClick={()=>{setFrom("");setTo("");}}>All</button>
          </div>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="repnav">
        <div className="repnav-tabs">
          {(["perf","system","psych","eval","road"] as SubTab[]).map(s=>(
            <button key={s} className={`reptab${sub===s?" on":""}`} onClick={()=>goSub(s)}>
              {s==="perf"?"Performance":s==="system"?"Trading System":s==="psych"?"Psychology":s==="eval"?"Eval Gauntlet":"Roadmap"}
            </button>
          ))}
        </div>
        <button className="btn sm" onClick={()=>window.print()} title="Save the current report as a PDF">⤓ Export PDF</button>
      </div>

      {/* Active sub-view */}
      {renderContent()}
    </div>
  );
}
