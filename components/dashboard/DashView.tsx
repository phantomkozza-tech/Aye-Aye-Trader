"use client";

import { useState, useEffect, useRef } from "react";
import { useDB } from "@/context/DBContext";
import {
  fmt, fmtDur, filteredTrades, calcDashStats,
  legNet, legComm, tradeDurMin, acctMap,
  inDateRange, type FilteredTrade,
} from "@/lib/db";

// ── Palette ──────────────────────────────────────────────────
const PALETTE = ["#26d07c","#3b82c4","#d4a948","#9b6bd4","#e8825a","#5ac8c8","#c85a9b","#7c8aef"];
const DOWS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Tiny chart renderer using Chart.js (CDN loaded by bridge / or we import) ──
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

const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: { legend: { display: false }, tooltip: { callbacks: {} } },
  scales: {
    x: { grid: { color: "rgba(255,255,255,.06)" }, ticks: { color: "#7a8a9a", font: { size: 11 } } },
    y: { grid: { color: "rgba(255,255,255,.06)" }, ticks: { color: "#7a8a9a", font: { size: 11 } } },
  },
};

function ChartCanvas({
  id, config, chartReady,
}: { id: string; config: any; chartReady: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!chartReady || !ref.current || !config) return;
    const Chart = (window as any).Chart;
    if (instanceRef.current) { instanceRef.current.destroy(); }
    instanceRef.current = new Chart(ref.current, config);
    return () => { instanceRef.current?.destroy(); instanceRef.current = null; };
  }, [chartReady, config]);

  return <canvas ref={ref} id={id} style={{ width: "100%", height: "100%" }} />;
}

// ── Calendar ─────────────────────────────────────────────────
function Calendar({
  db, selAccts, showBlown, from, to,
  onDayClick,
}: {
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

  // P&L by day
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

    const cellStyle: React.CSSProperties = {
      background: !inMonth ? "rgba(255,255,255,.02)"
        : info ? (info.pnl >= 0 ? "rgba(38,208,124,.13)" : "rgba(240,85,109,.13)") : "var(--panel2)",
      borderRadius: 8,
      border: "1px solid var(--line)",
      padding: "7px 8px",
      minHeight: 68,
      cursor: info ? "pointer" : "default",
      opacity: !inMonth ? 0.35 : 1,
    };

    let displayDay: number;
    if (dayNum < 1) displayDay = prevDays + dayNum;
    else if (dayNum > days) displayDay = dayNum - days;
    else displayDay = dayNum;

    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

    cells.push(
      <div
        key={`cell-${i}`}
        style={cellStyle}
        onClick={() => info && inMonth && onDayClick(ds)}
      >
        <div style={{ fontSize: 11, color: "var(--mut)", fontWeight: 600 }}>{displayDay}</div>
        {info && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: info.pnl >= 0 ? "var(--green)" : "var(--red)", marginTop: 4 }}>
              {fmt(info.pnl)}
            </div>
            <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
              {info.n} trade{info.n !== 1 ? "s" : ""}
            </div>
          </>
        )}
      </div>
    );

    if (inMonth && info) { weekPnl += info.pnl; weekN++; }

    if (i % 7 === 6) {
      const cls = weekN ? (weekPnl >= 0 ? "var(--green)" : "var(--red)") : "var(--dim)";
      cells.push(
        <div key={`week-${weekNum}`} style={{
          background: "var(--panel)", borderRadius: 8, border: "1px solid var(--line)",
          padding: "7px 8px", minHeight: 68, display: "flex", flexDirection: "column", justifyContent: "center",
        }}>
          <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 4 }}>Week {weekNum}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: cls }}>{fmt(weekPnl)}</div>
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{weekN} day{weekN !== 1 ? "s" : ""}</div>
        </div>
      );
      weekPnl = 0; weekN = 0; weekNum++;
    }
  }

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{monthLabel}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setCalDate(new Date(y, m - 1, 1))}>‹</button>
          <button className="btn" onClick={() => setCalDate(new Date())}>Today</button>
          <button className="btn" onClick={() => setCalDate(new Date(y, m + 1, 1))}>›</button>
        </div>
      </div>
      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 1.15fr", gap: 7, marginBottom: 7 }}>
        {DOWS.map((d) => (
          <div key={d} style={{ fontSize: 11, color: "var(--mut)", textAlign: "center", fontWeight: 600 }}>{d}</div>
        ))}
        <div style={{ fontSize: 11, color: "var(--mut)", textAlign: "center", fontWeight: 600 }}>Weekly</div>
      </div>
      {/* Calendar cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 1.15fr", gap: 7 }}>
        {cells}
      </div>
    </div>
  );
}

// ── Main DashView ────────────────────────────────────────────
export default function DashView({ onDayClick }: { onDayClick?: (date: string) => void }) {
  const { db } = useDB();
  const chartReady = useChartJS();

  const [selAccts, setSelAccts] = useState<Set<string>>(new Set());
  const [showBlown, setShowBlown] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const allow = new Set(
    db.accounts.filter((a) => showBlown || a.status !== "blown").map((a) => a.id)
  );

  const trades = filteredTrades(db, selAccts, allow, from, to);
  const stats = calcDashStats(db, trades, allow, from, to);

  const toggleAcct = (id: string) => {
    setSelAccts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Chart configs
  const equityConfig = chartReady ? {
    type: "line",
    data: {
      labels: stats.equityCurve.map((_, i) => i + 1),
      datasets: [{
        data: stats.equityCurve,
        borderColor: "#26d07c",
        backgroundColor: "rgba(38,208,124,.1)",
        fill: true, tension: 0.25, pointRadius: 2, borderWidth: 2,
      }],
    },
    options: { ...BASE_OPTS },
  } : null;

  const setupConfig = chartReady ? {
    type: "bar",
    data: {
      labels: stats.setupLabels,
      datasets: [{
        data: stats.setupWr,
        backgroundColor: stats.setupLabels.map((_, i) => PALETTE[i % PALETTE.length]),
        borderRadius: 6,
      }],
    },
    options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales, y: { ...BASE_OPTS.scales.y, max: 100 } } },
  } : null;

  const gradeConfig = chartReady ? {
    type: "bar",
    data: {
      labels: ["A+", "A", "B"],
      datasets: [{
        data: stats.gradeExp,
        backgroundColor: ["#26d07c", "#3b82c4", "#d4a948"],
        borderRadius: 6,
      }],
    },
    options: { ...BASE_OPTS },
  } : null;

  const acctConfig = chartReady ? {
    type: "bar",
    data: {
      labels: stats.acctLabels,
      datasets: [{
        data: stats.acctPnl,
        backgroundColor: stats.acctPnl.map((v) => (v >= 0 ? "#26d07c" : "#f0556d")),
        borderRadius: 6,
      }],
    },
    options: { ...BASE_OPTS },
  } : null;

  const acctLabel = selAccts.size === 0
    ? "all accounts"
    : db.accounts.filter((a) => selAccts.has(a.id)).map((a) => a.name).join(", ");

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

      {/* ── Filters ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "flex-start" }}>

        {/* Account chips */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", minWidth: 180 }}>
          <div
            style={{ fontSize: 12, color: "var(--mut)", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setChipsOpen((v) => !v)}
          >
            <span style={{ fontSize: 10 }}>{chipsOpen ? "▾" : "▸"}</span> Accounts
          </div>
          {chipsOpen && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--mut)", marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={showBlown} onChange={(e) => setShowBlown(e.target.checked)} />
                show blown
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {db.accounts
                  .filter((a) => showBlown || a.status !== "blown")
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => toggleAcct(a.id)}
                      style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 20,
                        border: "1px solid",
                        borderColor: selAccts.has(a.id) ? "var(--green)" : "var(--line)",
                        background: selAccts.has(a.id) ? "rgba(38,208,124,.15)" : "transparent",
                        color: selAccts.has(a.id) ? "var(--green)" : "var(--mut)",
                        cursor: "pointer",
                      }}
                    >
                      {a.name}{a.status === "blown" ? " ✖" : ""}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Date range */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 8 }}>Date range</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--txt)", padding: "4px 8px", fontSize: 12 }} />
            <span style={{ color: "var(--mut)" }}>→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--txt)", padding: "4px 8px", fontSize: 12 }} />
            <button className="btn sm" onClick={() => { setFrom(""); setTo(""); }}>All</button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { lbl: "Net P&L", val: fmt(stats.pnl), sub: `${stats.n} trades`, cls: stats.pnl >= 0 ? "pos" : "neg" },
          { lbl: "Win Rate", val: `${stats.wr}%`, sub: `${stats.wins}W / ${stats.losses}L`, cls: "" },
          { lbl: "Expectancy", val: `${stats.exp >= 0 ? "+" : ""}${stats.exp.toFixed(2)}R`, sub: "per trade", cls: stats.exp >= 0 ? "pos" : "neg" },
          { lbl: "Profit Factor", val: stats.pf.toFixed(2), sub: "gross win / loss", cls: "" },
        ].map((c) => (
          <div key={c.lbl} className="card" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>{c.lbl}</div>
            <div className={`val ${c.cls}`} style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{c.val}</div>
            <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 6 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Slip banner ── */}
      {stats.slip > 0 && (
        <div className="card" style={{ background: "var(--panel)", border: "1px solid var(--gold)", borderRadius: 12, padding: "14px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>
            ↯ Copy-Lag Cost <span style={{ color: "var(--mut)" }}>— what copy-trade slippage cost in this view</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--gold)" }}>{fmt(stats.slip)}</div>
          <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 4 }}>
            {fmt(stats.n ? stats.slip / stats.n : 0)} avg per trade · {stats.n} trades
          </div>
        </div>
      )}

      {/* ── Charts row 1 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px", color: "var(--txt)" }}>
            Equity Curve <span style={{ color: "var(--mut)", fontWeight: 400 }}>· {acctLabel}</span>
          </h3>
          <div style={{ height: 200, position: "relative" }}>
            <ChartCanvas id="c-equity" config={equityConfig} chartReady={chartReady} />
          </div>
        </div>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px", color: "var(--txt)" }}>Win Rate by Setup</h3>
          <div style={{ height: 200, position: "relative" }}>
            <ChartCanvas id="c-setup" config={setupConfig} chartReady={chartReady} />
          </div>
        </div>
      </div>

      {/* ── Charts row 2 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px", color: "var(--txt)" }}>
            Performance by Grade <span style={{ color: "var(--mut)", fontWeight: 400 }}>avg R — does A+ win?</span>
          </h3>
          <div style={{ height: 160, position: "relative" }}>
            <ChartCanvas id="c-grade" config={gradeConfig} chartReady={chartReady} />
          </div>
        </div>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px", color: "var(--txt)" }}>
            P&L by Account <span style={{ color: "var(--mut)", fontWeight: 400 }}>in this period</span>
          </h3>
          <div style={{ height: 160, position: "relative" }}>
            <ChartCanvas id="c-acct" config={acctConfig} chartReady={chartReady} />
          </div>
        </div>
      </div>

      {/* ── Calendar ── */}
      <Calendar
        db={db}
        selAccts={selAccts}
        showBlown={showBlown}
        from={from}
        to={to}
        onDayClick={(date) => onDayClick?.(date)}
      />
    </div>
  );
}
