"use client";

import { useState, useEffect } from "react";
import { useDB } from "@/context/DBContext";
import {
  fmt, legNet, inDateRange,
  acctPhases, activePhase, phaseById, legPhaseId, phaseLabel,
  nextKinds, acctTotalCost, advanceAccount, applyPhaseEdit, acctPnlScoped,
  type PhaseVals,
} from "@/lib/db";
import type { Account, Phase, DDType, PhaseKind } from "@/types/journal";

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CG = { grid: { color: "#1e2733" }, ticks: { color: "#7d8896" } };
const BASE_OPTS = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 } };

const INPUT: React.CSSProperties = {
  background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8,
  color: "var(--txt)", padding: "9px 12px", fontSize: 13, width: "100%", outline: "none",
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: "var(--mut)", textTransform: "uppercase",
  letterSpacing: ".6px", fontWeight: 600, display: "block", marginBottom: 5,
};

// ── Chart.js (same loader/pattern as ReportView) ───────────────
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
  chartInstances.set(id, new (window as any).Chart(el, cfg));
}

// ── Daily balance series scoped to a phase + date range ────────
function dailyBalance(db: any, a: Account, phaseId: string | null, from: string, to: string) {
  const byDay: Record<string, number> = {};
  db.trades.forEach((t: any) => {
    if (!inDateRange(t.date, from, to)) return;
    let legs = (t.legs || []).filter((l: any) => l.acct === a.id);
    if (phaseId) legs = legs.filter((l: any) => legPhaseId(a, l, t.date) === phaseId);
    if (!legs.length) return;
    byDay[t.date] = (byDay[t.date] || 0) + legs.reduce((s: number, l: any) => s + legNet(l), 0);
  });
  const days = Object.keys(byDay).sort();
  const phase = phaseId ? phaseById(a, phaseId) : activePhase(a);
  const start = phase && phase.startBal != null ? phase.startBal : (a.bal || 0);
  let bal = start;
  const series = days.map((d) => { const open = bal; bal += byDay[d]; return { date: d, open, close: bal }; });
  return { series, start, phase };
}
function ddFloorSeries(series: { open: number; close: number }[], start: number, dd: number, type: DDType): number[] {
  if (!dd) return [];
  if (type === "static") return series.map(() => start - dd);
  let peak = start;
  return series.map((c) => { if (c.close > peak) peak = c.close; return peak - dd; });
}

interface ModalState {
  open: boolean;
  mode: "advance" | "edit";
  kinds: PhaseKind[];
  kind: PhaseKind;
  label: string;
  bal: string;
  target: string;
  dd: string;
  ddtype: DDType;
  cost: string;
  title: string;
  intro: string;
}

export default function AccountDashView({ acctId, onBack }: { acctId: string; onBack: () => void }) {
  const { db, save } = useDB();
  const chartReady = useChartJS();

  const a = db.accounts.find((x) => x.id === acctId);
  const ap = a ? activePhase(a) : null;
  const [phaseId, setPhaseId] = useState<string | null>(ap?.id ?? null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);

  // Keep the scoped phase valid if the account changes underneath us.
  useEffect(() => {
    if (!a) return;
    if (phaseId && !phaseById(a, phaseId)) setPhaseId(activePhase(a)?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id, db.accounts]);

  // Build scoped trades + stats
  const T = a ? db.trades
    .filter((t) => inDateRange(t.date, from, to))
    .map((t) => {
      let legs = (t.legs || []).filter((l) => l.acct === a.id);
      if (phaseId) legs = legs.filter((l) => legPhaseId(a, l, t.date) === phaseId);
      if (!legs.length) return null;
      const gross = legs.reduce((s, l) => s + (l.pnl || 0), 0);
      const net = legs.reduce((s, l) => s + legNet(l), 0);
      return { ...t, _legs: legs, _gross: gross, _pnl: net };
    })
    .filter(Boolean) as any[] : [];

  const n = T.length;
  const pnl = T.reduce((s, t) => s + t._pnl, 0);
  const wins = T.filter((t) => t._pnl > 0);
  const losses = T.filter((t) => t._pnl < 0);
  const wr = n ? Math.round((wins.length / n) * 100) : 0;
  const rs = T.map((t) => parseFloat((t as any).r)).filter((v) => !isNaN(v));
  const exp = rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : 0;
  const gw = wins.reduce((s, t) => s + t._pnl, 0);
  const gl = Math.abs(losses.reduce((s, t) => s + t._pnl, 0));
  const pf = gl ? gw / gl : 0;

  // Charts
  useEffect(() => {
    if (!chartReady || !a) return;
    const phase = phaseId ? phaseById(a, phaseId) : activePhase(a);
    const { series, start } = dailyBalance(db, a, phaseId, from, to);
    const target = phase ? phase.target || 0 : a.target || 0;
    const targetBal = target > 0 ? start + target : null;
    const dd = phase ? phase.dd || 0 : a.dd || 0;
    const ddtype = ((phase ? phase.ddtype : a.ddtype) || "static") as DDType;
    const dllRaw = a.dll || a.pdll || 0;
    const labels = series.length ? series.map((c) => { const p = c.date.slice(5).split("-"); return p[1] + "/" + p[0]; }) : ["—"];
    const ddArr = ddFloorSeries(series, start, dd, ddtype);
    const datasets: any[] = [
      { label: "Balance", data: series.map((c) => +c.close.toFixed(0)), borderColor: "#26d07c", backgroundColor: "rgba(38,208,124,.10)", fill: true, tension: .15, pointRadius: 0, borderWidth: 2 },
    ];
    if (targetBal != null) datasets.push({ label: "Target", data: labels.map(() => targetBal), borderColor: "#3b82c4", borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, fill: false });
    if (ddArr.length) datasets.push({ label: ddtype === "static" ? "Max DD" : ddtype === "eod" ? "Max DD (EOD trail)" : "Max DD (intraday trail)", data: ddArr.map((v) => +v.toFixed(0)), borderColor: "#f0556d", borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, fill: false });
    if (dllRaw) datasets.push({ label: "Daily limit", data: series.map((c) => +(c.open - dllRaw).toFixed(0)), borderColor: "#d4a948", borderDash: [2, 3], pointRadius: 0, borderWidth: 1.5, fill: false });
    mkChart("ad-equity", { type: "line", data: { labels, datasets }, options: { ...BASE_OPTS, plugins: { legend: { display: true, labels: { color: "#8a93a3", font: { size: 10 }, boxWidth: 12 } } }, scales: { x: { ...CG, ticks: { ...CG.ticks, maxTicksLimit: 10 } }, y: CG } } });

    const palette = ["#26d07c", "#3b82c4", "#d4a948", "#9b6bd4", "#e8825a", "#5ac8c8", "#c85a9b", "#7c8aef"];
    const setups = [...new Set(T.map((t) => t.setup))].filter(Boolean) as string[];
    const swr = setups.map((s) => { const g = T.filter((t) => t.setup === s); return g.length ? Math.round((g.filter((t) => t._pnl > 0).length / g.length) * 100) : 0; });
    mkChart("ad-setup", { type: "bar", data: { labels: setups.map((s) => s.length > 10 ? s.slice(0, 9) + "…" : s), datasets: [{ data: swr, backgroundColor: setups.map((_, i) => palette[i % palette.length]), borderRadius: 6 }] }, options: { ...BASE_OPTS, plugins: { legend: { display: false } }, scales: { x: CG, y: { ...CG, max: 100 } } } });

    const grades = ["A+", "A", "B"];
    const gexp = grades.map((gr) => { const r = T.filter((t) => t.grade === gr).map((t) => parseFloat((t as any).r)).filter((v) => !isNaN(v)); return r.length ? +(r.reduce((x, y) => x + y, 0) / r.length).toFixed(2) : 0; });
    mkChart("ad-grade", { type: "bar", data: { labels: grades, datasets: [{ data: gexp, backgroundColor: ["#26d07c", "#3b82c4", "#d4a948"], borderRadius: 6 }] }, options: { ...BASE_OPTS, plugins: { legend: { display: false } }, scales: { x: CG, y: CG } } });

    const dowPnl = [0, 0, 0, 0, 0, 0, 0], dowN = [0, 0, 0, 0, 0, 0, 0];
    T.forEach((t) => { const d = new Date(t.date + "T00:00").getDay(); dowPnl[d] += t._pnl; dowN[d]++; });
    const dowIdx = [1, 2, 3, 4, 5].filter((i) => dowN[i] > 0).concat([0, 6].filter((i) => dowN[i] > 0));
    const col = (v: number) => v >= 0 ? "#26d07c" : "#f0556d";
    mkChart("ad-dow", { type: "bar", data: { labels: dowIdx.map((i) => DOW_NAMES[i].slice(0, 3)), datasets: [{ data: dowIdx.map((i) => +dowPnl[i].toFixed(0)), backgroundColor: dowIdx.map((i) => col(dowPnl[i])), borderRadius: 6 }] }, options: { ...BASE_OPTS, plugins: { legend: { display: false } }, scales: { x: CG, y: CG } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, acctId, phaseId, from, to, db.trades, db.accounts]);

  if (!a) {
    return (
      <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <button className="btn" onClick={onBack}>← Back to accounts</button>
        <div className="empty-state" style={{ marginTop: 20 }}>Account not found.</div>
      </div>
    );
  }

  const isBlown = a.status === "blown";
  const scopeP = phaseId ? phaseById(a, phaseId) : null;
  const ps = acctPhases(a);
  const showStrip = !(a.type !== "prop" && ps.length <= 1);
  const cur = activePhase(a);
  const canAdvance = !isBlown && cur && nextKinds(cur.kind).length > 0;
  const canEdit = !isBlown && !!cur;

  // ── Phase modal openers ──────────────────────────────────────
  const openAdvance = () => {
    if (!cur) return;
    const kinds = nextKinds(cur.kind);
    if (!kinds.length) { alert("This account is already at its final stage (Live)."); return; }
    setModal({
      open: true, mode: "advance", kinds, kind: kinds[0],
      label: "", bal: String(cur.startBal || ""), target: "",
      dd: String(cur.dd || ""), ddtype: (cur.ddtype || "static") as DDType, cost: "",
      title: "Advance from " + phaseLabel(a, cur),
      intro: `Passing ${phaseLabel(a, cur)} closes it as passed and opens a fresh phase. Enter the new phase's rules — they're independent, so a funded account can reset its balance and drawdown.`,
    });
  };
  const openEdit = () => {
    if (!cur) return;
    setModal({
      open: true, mode: "edit", kinds: ["eval", "funded", "live"], kind: cur.kind,
      label: cur.label || "", bal: String(cur.startBal || ""), target: String(cur.target || ""),
      dd: String(cur.dd || ""), ddtype: (cur.ddtype || "static") as DDType, cost: String(cur.cost || ""),
      title: "Edit " + phaseLabel(a, cur) + " phase",
      intro: "Fix this phase's stage or rules. Use this if a migrated account was mislabeled (e.g. it's really Funded, not Eval).",
    });
  };
  const savePhaseModal = () => {
    if (!modal || !cur) { setModal(null); return; }
    const vals: PhaseVals = {
      kind: modal.kind, label: modal.label.trim() || null,
      startBal: parseFloat(modal.bal) || 0, target: parseFloat(modal.target) || 0,
      dd: parseFloat(modal.dd) || 0, ddtype: modal.ddtype, cost: parseFloat(modal.cost) || 0,
    };
    if (modal.mode === "advance") {
      const next = advanceAccount(db, a.id, vals);
      save(next);
      const updated = next.accounts.find((x) => x.id === a.id);
      setPhaseId(updated ? activePhase(updated)?.id ?? null : null);
    } else {
      save(applyPhaseEdit(db, a.id, cur.id, vals));
    }
    setModal(null);
  };

  const stat = (label: string, value: string, sub?: string, color?: string) => (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "var(--txt)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const ico = (o: string) =>
    o === "passed" ? <span className="ps-ico" style={{ color: "var(--green)" }}>✓</span> :
    o === "blown" ? <span className="ps-ico" style={{ color: "var(--red)" }}>✖</span> :
    <span className="ps-ico" style={{ color: "var(--blue)" }}>●</span>;

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <button className="btn" onClick={onBack} title="Back to accounts">←</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{a.name}</h2>
      </div>
      <div style={{ fontSize: 13, color: "var(--mut)", marginBottom: 18 }}>
        {a.type}
        {a.bal ? " · " + fmt(a.bal) + " account" : ""}
        {acctTotalCost(a) ? " · spent " + fmt(acctTotalCost(a)) : ""}
        {isBlown && <span style={{ color: "var(--red)" }}> · ✖ blown {a.blownDate || ""}</span>}
        {a.type === "prop" && (scopeP
          ? <span style={{ color: "var(--blue)" }}> · {phaseLabel(a, scopeP)} phase</span>
          : <span style={{ color: "var(--mut)" }}> · all phases</span>)}
      </div>

      {/* Phase strip (Journey) */}
      {showStrip && (
        <div className="phase-strip">
          <div className="phase-head">
            <span className="t">Journey</span>
            <span className="phase-actions">
              {canEdit && <button className="btn sm" onClick={openEdit} title="Fix this phase's stage or rules">✎ Stage</button>}
              {canAdvance && <button className="btn sm" style={{ background: "rgba(59,130,196,.15)", borderColor: "var(--blue)", color: "var(--blue)" }} onClick={openAdvance}>↑ Advance</button>}
            </span>
          </div>
          <div className="phase-steps">
            {ps.map((p, i) => {
              const pp = acctPnlScoped(db, a.id, p.id);
              return (
                <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <div className={`phase-step o-${p.outcome}${phaseId === p.id ? " sel" : ""}`} onClick={() => setPhaseId(p.id)} title="View this phase's stats">
                    <div className="ps-top">{ico(p.outcome)} {phaseLabel(a, p)}</div>
                    <div className={`ps-pnl ${pp >= 0 ? "pos" : "neg"}`}>{fmt(pp)}</div>
                    <div className="ps-meta">{p.cost ? fmt(p.cost) + " fee · " : ""}{p.outcome}</div>
                  </div>
                  {i < ps.length - 1 && <span className="phase-arrow">→</span>}
                </span>
              );
            })}
            <span className="phase-arrow">·</span>
            <div className={`phase-life${phaseId ? "" : " sel"}`} onClick={() => setPhaseId(null)} title="Combined across all phases">Lifetime</div>
          </div>
        </div>
      )}

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".5px" }}>Range</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...INPUT, width: "auto" }} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...INPUT, width: "auto" }} />
        {(from || to) && <button className="btn sm" onClick={() => { setFrom(""); setTo(""); }}>All</button>}
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 22 }}>
        {stat("Net P&L", fmt(pnl), n + " trades", pnl >= 0 ? "var(--green)" : "var(--red)")}
        {stat("Win Rate", wr + "%", wins.length + "W / " + losses.length + "L")}
        {stat("Expectancy", (exp >= 0 ? "+" : "") + exp.toFixed(2) + "R", "avg R per trade", exp >= 0 ? "var(--green)" : "var(--red)")}
        {stat("Profit Factor", pf.toFixed(2), "gross win ÷ loss")}
      </div>

      {/* Equity */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <h3>Daily balance <span>levels: target · max DD · daily limit</span></h3>
        <div className="chart-box"><canvas id="ad-equity" /></div>
      </div>

      {/* Analytics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div className="panel"><h3>Win rate by setup</h3><div className="chart-box sm"><canvas id="ad-setup" /></div></div>
        <div className="panel"><h3>Avg R by grade</h3><div className="chart-box sm"><canvas id="ad-grade" /></div></div>
        <div className="panel"><h3>P&amp;L by day of week</h3><div className="chart-box sm"><canvas id="ad-dow" /></div></div>
      </div>

      {n === 0 && (
        <div className="empty-state" style={{ marginTop: 18 }}>
          No trades in this {phaseId ? "phase" : "view"} for the current range.
        </div>
      )}

      {/* Phase modal */}
      {modal?.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{modal.title}</h3>
              <span style={{ cursor: "pointer", fontSize: 18, color: "var(--mut)" }} onClick={() => setModal(null)}>✕</span>
            </div>
            <p style={{ color: "var(--mut)", fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>{modal.intro}</p>

            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Stage</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {modal.kinds.map((k) => (
                  <div key={k} className={`pk-opt${modal.kind === k ? " on" : ""}`} onClick={() => setModal({ ...modal, kind: k })}>
                    {k === "eval" ? "Eval" : k === "funded" ? "Funded" : "Live"}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Custom label <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
              <input value={modal.label} onChange={(e) => setModal({ ...modal, label: e.target.value })} placeholder="e.g. XFA Step 2" style={INPUT} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LABEL}>Starting balance</label>
                <input type="number" value={modal.bal} onChange={(e) => setModal({ ...modal, bal: e.target.value })} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Profit target $</label>
                <input type="number" value={modal.target} onChange={(e) => setModal({ ...modal, target: e.target.value })} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Max drawdown $</label>
                <input type="number" value={modal.dd} onChange={(e) => setModal({ ...modal, dd: e.target.value })} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Drawdown type</label>
                <select value={modal.ddtype} onChange={(e) => setModal({ ...modal, ddtype: e.target.value as DDType })} style={{ ...INPUT, cursor: "pointer" }}>
                  <option value="static">Static</option>
                  <option value="eod">Trailing (EOD)</option>
                  <option value="intraday">Trailing (intraday)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={LABEL}>{modal.mode === "advance" ? "Cost $ (activation / fee)" : "Cost $ (fee for this phase)"}</label>
              <input type="number" value={modal.cost} onChange={(e) => setModal({ ...modal, cost: e.target.value })} style={INPUT} />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn" style={{ background: "var(--green)", color: "#04140b", border: "none", fontWeight: 700 }} onClick={savePhaseModal}>
                {modal.mode === "advance" ? "Advance" : "Save phase"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
