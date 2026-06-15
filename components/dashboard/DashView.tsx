"use client";

import { useState, useEffect, useRef } from "react";
import { useDB } from "@/context/DBContext";
import {
  fmt, filteredTrades, calcDashStats, legNet, inDateRange, type FilteredTrade,
} from "@/lib/db";
import { chartColors } from "@/lib/chartTheme";

const DOWS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const PALETTE = ["#26d07c","#3b82c4","#d4a948","#9b6bd4","#e8825a","#5ac8c8","#c85a9b","#7c8aef"];

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

function ChartCanvas({ id, config, ready }: { id: string; config: any; ready: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<any>(null);
  useEffect(() => {
    if (!ready || !ref.current || !config) return;
    inst.current?.destroy();
    inst.current = new (window as any).Chart(ref.current, config);
    return () => { inst.current?.destroy(); inst.current = null; };
  }, [ready, JSON.stringify(config)]);
  return <canvas ref={ref} style={{ maxWidth: "100%" }} />;
}

// ── V1 Calendar ──────────────────────────────────────────────
function Calendar({ db, selAccts, showBlown, from, to, onDayClick }: {
  db: any; selAccts: Set<string>; showBlown: boolean;
  from: string; to: string; onDayClick: (date: string) => void;
}) {
  const [calDate, setCalDate] = useState(() => new Date());

  const allow = new Set(
    db.accounts.filter((a: any) => showBlown || a.status !== "blown").map((a: any) => a.id)
  );
  const y = calDate.getFullYear(), m = calDate.getMonth();
  const monthLabel = calDate.toLocaleString("default", { month: "long", year: "numeric" });
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const byDay: Record<number, { pnl: number; n: number }> = {};
  db.trades.forEach((t: any) => {
    const d = new Date(t.date + "T00:00");
    if (d.getFullYear() !== y || d.getMonth() !== m) return;
    if (!inDateRange(t.date, from, to)) return;
    const legs = (t.legs || []).filter((l: any) => {
      if (!allow.has(l.acct)) return false;
      return selAccts.size === 0 || selAccts.has(l.acct);
    });
    if (!legs.length) return;
    const pnl = legs.reduce((a: number, l: any) => a + legNet(l), 0);
    const k = d.getDate();
    if (!byDay[k]) byDay[k] = { pnl: 0, n: 0 };
    byDay[k].pnl += pnl;
    byDay[k].n++;
  });

  const totalCells = Math.ceil((first + days) / 7) * 7;
  const cells: React.ReactNode[] = [];
  let weekPnl = 0, weekN = 0, weekNum = 1;

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - first + 1;
    const inMonth = dayNum >= 1 && dayNum <= days;
    const info = inMonth ? byDay[dayNum] : null;
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

    let displayDay: number;
    if (dayNum < 1) displayDay = prevDays + dayNum;
    else if (dayNum > days) displayDay = dayNum - days;
    else displayDay = dayNum;

    let cellClass = "cal-cell";
    if (!inMonth) cellClass += " out";
    else if (info) cellClass += info.pnl >= 0 ? " win" : " loss";

    cells.push(
      <div key={`c${i}`} className={cellClass}
        style={{ cursor: info && inMonth ? "pointer" : "default" }}
        onClick={() => info && inMonth && onDayClick(ds)}>
        <div className="dnum">{displayDay}</div>
        {info && (
          <>
            <div className="dpnl">{fmt(info.pnl)}</div>
            <div className="dn">{info.n} trade{info.n !== 1 ? "s" : ""}</div>
          </>
        )}
      </div>
    );

    if (inMonth && info) { weekPnl += info.pnl; weekN++; }

    if (i % 7 === 6) {
      const wkClass = weekN ? (weekPnl >= 0 ? "win" : "loss") : "";
      cells.push(
        <div key={`w${weekNum}`} className="cal-week">
          <div className="wk-label">Week {weekNum}</div>
          <div className={`wk-pnl ${wkClass}`}>{fmt(weekPnl)}</div>
          <div className="wk-days">{weekN} day{weekN !== 1 ? "s" : ""}</div>
        </div>
      );
      weekPnl = 0; weekN = 0; weekNum++;
    }
  }

  return (
    <div className="panel">
      <div className="cal-head">
        <h2>{monthLabel}</h2>
        <div className="cal-nav">
          <button className="btn" onClick={() => setCalDate(new Date(y, m - 1, 1))}>‹</button>
          <button className="btn" onClick={() => setCalDate(new Date())}>Today</button>
          <button className="btn" onClick={() => setCalDate(new Date(y, m + 1, 1))}>›</button>
        </div>
      </div>
      <div className="cal-grid">
        {DOWS.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        <div className="cal-dow">Weekly</div>
      </div>
      <div className="cal-grid" style={{ marginTop: 8 }}>
        {cells}
      </div>
    </div>
  );
}

// ── Main DashView ────────────────────────────────────────────
interface DashViewProps {
  onDayClick?: (date: string) => void;
  // Lifted filter state — shared with DayDetailView
  selAccts: Set<string>;
  setSelAccts: (v: Set<string>) => void;
  showBlown: boolean;
  setShowBlown: (v: boolean) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  theme?: "dark" | "light";
}

export default function DashView({
  onDayClick,
  selAccts, setSelAccts,
  showBlown, setShowBlown,
  from, setFrom,
  to, setTo,
  theme = "dark",
}: DashViewProps) {
  const { db } = useDB();
  const chartReady = useChartJS();

  // Theme-aware chart options (soft gridlines in light mode)
  const C = chartColors(theme);
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: C.legend } } },
    scales: {
      x: { grid: { color: C.grid }, ticks: { color: C.tick } },
      y: { grid: { color: C.grid }, ticks: { color: C.tick } },
    },
  };

  const [chipsOpen, setChipsOpen] = useState(false);

  const allow = new Set(
    db.accounts.filter((a) => showBlown || a.status !== "blown").map((a) => a.id)
  );
  const trades = filteredTrades(db, selAccts, allow, from, to);
  const stats = calcDashStats(db, trades, allow, from, to);

  const toggleAcct = (id: string) => {
    const next = new Set(selAccts);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelAccts(next);
  };

  const acctLabel = selAccts.size === 0
    ? "all accounts"
    : db.accounts.filter((a) => selAccts.has(a.id)).map((a) => a.name).join(", ");

  // Chart configs — V1 base opts
  const equityConfig = chartReady ? {
    type: "line",
    data: {
      labels: stats.equityCurve.map((_, i) => i + 1),
      datasets: [{ data: stats.equityCurve, borderColor: "#26d07c", backgroundColor: "rgba(38,208,124,.1)", fill: true, tension: .25, pointRadius: 2, borderWidth: 2 }],
    },
    options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } } },
  } : null;

  const setupConfig = chartReady ? {
    type: "bar",
    data: {
      labels: stats.setupLabels,
      datasets: [{ data: stats.setupWr, backgroundColor: stats.setupLabels.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 6 }],
    },
    options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } }, scales: { ...baseOpts.scales, y: { ...baseOpts.scales.y, max: 100 } } },
  } : null;

  const gradeConfig = chartReady ? {
    type: "bar",
    data: {
      labels: ["A+", "A", "B"],
      datasets: [{ data: stats.gradeExp, backgroundColor: ["#26d07c","#3b82c4","#d4a948"], borderRadius: 6 }],
    },
    options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } } },
  } : null;

  const acctConfig = chartReady ? {
    type: "bar",
    data: {
      labels: stats.acctLabels,
      datasets: [{ data: stats.acctPnl, backgroundColor: stats.acctPnl.map((v) => v >= 0 ? "#26d07c" : "#f0556d"), borderRadius: 6 }],
    },
    options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } } },
  } : null;

  return (
    <div>

      {/* ── Filters — V1 single bar ── */}
      <div className="filters">
        <div className="fseg">
          <label
            className={`chip-toggle${chipsOpen ? "" : " collapsed"}`}
            onClick={() => setChipsOpen((v) => !v)}
            style={{ cursor: "pointer" }}
          >
            <span className="caret">▾</span> Accounts
          </label>
          {chipsOpen && (
            <div style={{ marginTop: 6 }}>
              <label className="blown-toggle">
                <input type="checkbox" checked={showBlown} onChange={(e) => setShowBlown(e.target.checked)} />
                <span className="sw" />
                show blown accounts
              </label>
              <div className="chips">
                {db.accounts
                  .filter((a) => showBlown || a.status !== "blown")
                  .map((a) => (
                    <span key={a.id}
                      className={`chip${selAccts.has(a.id) ? " on" : ""}${a.status === "blown" ? " blown-chip" : ""}`}
                      onClick={() => toggleAcct(a.id)}>
                      {a.name}{a.status === "blown" ? " ✖" : ""}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="fseg">
          <label>Date range</label>
          <div className="range-row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
            <span style={{ color: "var(--mut)" }}>→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
            <button className="btn sm" onClick={() => { setFrom(""); setTo(""); }}>All</button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-grid">
        <div className="card">
          <div className="lbl">Net P&L</div>
          <div className={`val ${stats.pnl >= 0 ? "pos" : "neg"}`}>{fmt(stats.pnl)}</div>
          <div className="sub">{stats.n} trades</div>
        </div>
        <div className="card">
          <div className="lbl">Win Rate</div>
          <div className="val">{stats.wr}%</div>
          <div className="sub">{stats.wins}W / {stats.losses}L</div>
        </div>
        <div className="card">
          <div className="lbl">Expectancy</div>
          <div className={`val ${stats.exp >= 0 ? "pos" : "neg"}`}>
            {stats.exp >= 0 ? "+" : ""}{stats.exp.toFixed(2)}R
          </div>
          <div className="sub">per trade</div>
        </div>
        <div className="card">
          <div className="lbl">Profit Factor</div>
          <div className="val">{stats.pf.toFixed(2)}</div>
          <div className="sub">gross win / loss</div>
        </div>
      </div>

      {/* ── Slip banner ── */}
      {stats.slip > 0 && (
        <div className="card" style={{ marginBottom: 18, borderColor: "var(--gold)" }}>
          <div className="lbl" style={{ color: "var(--gold)" }}>
            ↯ Copy-Lag Cost <span style={{ color: "var(--mut)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>— what copy-trade slippage cost in this view</span>
          </div>
          <div className="val" style={{ color: "var(--gold)" }}>{fmt(stats.slip)}</div>
          <div className="sub">
            {fmt(stats.slipN ? stats.slip / stats.slipN : 0)} avg per trade · {stats.slipN} trade{stats.slipN !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* ── Charts row 1: equity + win rate by setup ── */}
      <div className="chart-grid even">
        <div className="panel">
          <h3>Equity Curve <span>cumulative P&L · {acctLabel}</span></h3>
          <div className="chart-box">
            <ChartCanvas id="c-equity" config={equityConfig} ready={chartReady} />
          </div>
        </div>
        <div className="panel">
          <h3>Win Rate by Setup</h3>
          <div className="chart-box">
            <ChartCanvas id="c-setup" config={setupConfig} ready={chartReady} />
          </div>
        </div>
      </div>

      {/* ── Charts row 2: grade + acct ── */}
      <div className="chart-grid even">
        <div className="panel">
          <h3>Performance by Grade <span>avg R — does A+ win?</span></h3>
          <div className="chart-box sm">
            <ChartCanvas id="c-grade" config={gradeConfig} ready={chartReady} />
          </div>
        </div>
        <div className="panel">
          <h3>P&amp;L by Account <span>in this period</span></h3>
          <div className="chart-box sm">
            <ChartCanvas id="c-acct" config={acctConfig} ready={chartReady} />
          </div>
        </div>
      </div>

      {/* ── Calendar ── */}
      <Calendar
        db={db} selAccts={selAccts} showBlown={showBlown}
        from={from} to={to}
        onDayClick={(d) => onDayClick?.(d)}
      />
    </div>
  );
}
