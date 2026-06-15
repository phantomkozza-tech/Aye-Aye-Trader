"use client";

import { useState, useEffect, useRef } from "react";
import { useDB } from "@/context/DBContext";
import { fmt, legNet, legComm, today, uid } from "@/lib/db";
import { chartColors } from "@/lib/chartTheme";
import type { Account, Phase } from "@/types/journal";

// ── Phase helpers (duplicated locally to avoid circular deps) ──
function acctPhases(a: Account): Phase[] {
  return a.phases?.length ? a.phases : [];
}
function activePhase(a: Account): Phase | null {
  const ps = acctPhases(a);
  return ps.find((p) => p.outcome === "active") ?? ps[ps.length - 1] ?? null;
}
function blownPhase(a: Account): Phase | null {
  return [...acctPhases(a)].reverse().find((p) => p.outcome === "blown") ?? activePhase(a);
}

// ── Leg math ──────────────────────────────────────────────────
function legNetLocal(l: any): number {
  return (l.pnl ?? 0) - ((l.comm ?? 0) * (l.size ?? 0) * 2);
}

// ── blownInfo ────────────────────────────────────────────────
interface BlownInfo {
  a: Account;
  pnl: number;
  n: number;
  wins: number;
  wr: number;
  first: string;
  last: string;
  lifespan: number;
  kill: { t: any; net: number } | null;
}

function blownInfo(a: Account, trades: any[]): BlownInfo {
  const bp = blownPhase(a);
  const legs: { t: any; net: number }[] = [];
  trades.forEach((t) => {
    (t.legs ?? []).forEach((l: any) => {
      if (l.acct !== a.id) return;
      if (bp && l.phase && l.phase !== bp.id) return;
      legs.push({ t, net: legNetLocal(l) });
    });
  });
  legs.sort((x, y) => x.t.date.localeCompare(y.t.date));

  const pnl = legs.reduce((s, r) => s + r.net, 0);
  const n = legs.length;
  const wins = legs.filter((r) => r.net > 0).length;
  const wr = n ? Math.round((wins / n) * 100) : 0;
  const dates = legs.map((r) => r.t.date);
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const lifespan =
    first && last
      ? Math.round((new Date(last).getTime() - new Date(first).getTime()) / 86400000) + 1
      : 0;

  let kill: { t: any; net: number } | null = null;
  if (a.blownTradeId) {
    const k = legs.find((r) => r.t.id === a.blownTradeId);
    if (k) kill = k;
  }
  if (!kill && legs.length) {
    kill = legs.reduce((w, r) => (r.net < w.net ? r : w), legs[0]);
  }

  return { a, pnl, n, wins, wr, first, last, lifespan, kill };
}

// ── Chart canvas ─────────────────────────────────────────────
function useChartJS() {  const [ready, setReady] = useState(false);
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
  }, [ready, config]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%" }} />;
}

// ── Blown account card ────────────────────────────────────────
function BlownCard({ info, onReset }: { info: BlownInfo; onReset: () => void }) {
  const { a } = info;
  const gradeClass = info.kill?.t.grade === "A+" ? "aplus" : info.kill?.t.grade === "A" ? "a" : "b";
  const acctCost = acctPhases(a).reduce((s, p) => s + (p.cost ?? 0), 0) +
    (a.resets ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 20px" }}>
      {/* Name row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>🪦 {a.name}</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
          background: "rgba(240,85,109,.15)", color: "var(--red)", border: "1px solid rgba(240,85,109,.3)" }}>BLOWN</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14 }}>
        {a.firm ? `${a.firm} · ` : ""}
        {a.bal ? `${fmt(a.bal)} account · ` : ""}
        blew {a.blownDate ?? "—"}
        {(a as any).resetCount ? ` · ↻ reset ${(a as any).resetCount}×` : ""}
      </div>

      {/* Margin blown note */}
      {(a as any).blownReason === "margin" && (
        <div style={{ fontSize: 12.5, color: "var(--red)", fontWeight: 700, marginBottom: 14 }}>
          ⚓ Margin called{(a as any).debt > 0 ? ` — owes broker ${fmt((a as any).debt)}` : " — out of margin"}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        {[
          { label: "Final P&L", val: fmt(info.pnl), cls: info.pnl >= 0 ? "pos" : "neg" },
          { label: "Win Rate", val: `${info.wr}%`, sub: `${info.wins}W/${info.n - info.wins}L` },
          { label: "Spent on it", val: acctCost ? fmt(acctCost) : "—", gold: true },
          { label: "Lifespan", val: `${info.lifespan}d` },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.gold ? "var(--gold)" : "inherit" }}
              className={s.cls}>{s.val}</div>
            {s.sub && <div style={{ fontSize: 10, color: "var(--mut)" }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Kill trade */}
      {info.kill && (
        <div style={{ background: "rgba(240,85,109,.07)", border: "1px solid rgba(240,85,109,.2)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: ".6px", marginBottom: 6 }}>✖ The trade that did it</div>
          <div style={{ fontSize: 13 }}>
            {info.kill.t.date} · {info.kill.t.inst} ·{" "}
            <span className={`pill ${gradeClass}`}>{info.kill.t.grade}</span>{" "}
            {info.kill.t.setup}
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="neg" style={{ fontWeight: 800 }}>{fmt(info.kill.net)}</span>
            {" "}on this account
          </div>
        </div>
      )}

      {/* Reset action */}
      <div style={{ paddingTop: 10, borderTop: "1px solid var(--line)", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 700, cursor: "pointer" }}
          onClick={onReset}>↻ Reset this account</span>
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────
export default function BlownView({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const { db, save } = useDB();
  const chartReady = useChartJS();

  const C = chartColors(theme);
  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 } } },
      y: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 }, precision: 0 } },
    },
  };

  const [selAccts, setSelAccts]   = useState<Set<string>>(new Set());
  const [chipsOpen, setChipsOpen] = useState(false);
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");

  const inPeriod = (dateStr: string) => {
    if (!from && !to) return true;
    if (!dateStr) return false;
    if (from && dateStr < from) return false;
    if (to && dateStr > to) return false;
    return true;
  };

  const allBlown = db.accounts.filter((a) => a.status === "blown");
  const filtered = allBlown
    .filter((a) => inPeriod(a.blownDate ?? ""))
    .filter((a) => selAccts.size === 0 || selAccts.has(a.id));

  const infos = filtered.map((a) => blownInfo(a, db.trades));

  // Aggregates
  const totSpent = filtered.reduce((s, a) => {
    return s + acctPhases(a).reduce((x, p) => x + (p.cost ?? 0), 0) +
      (a.resets ?? []).reduce((x, r) => x + (r.amount ?? 0), 0);
  }, 0);
  const totPnl = infos.reduce((s, i) => s + i.pnl, 0);
  const net = totPnl - totSpent;
  const lifes = infos.map((i) => i.lifespan).filter((v) => v > 0);
  const avgLife = lifes.length ? Math.round(lifes.reduce((a, b) => a + b, 0) / lifes.length) : 0;

  // Insight
  const killGrades: Record<string, number> = {};
  const killSetups: Record<string, number> = {};
  infos.forEach((i) => {
    if (!i.kill) return;
    const g = i.kill.t.grade ?? "?";
    killGrades[g] = (killGrades[g] ?? 0) + 1;
    const s = i.kill.t.setup ?? "?";
    killSetups[s] = (killSetups[s] ?? 0) + 1;
  });
  const topEntry = (o: Record<string, number>) => {
    const e = Object.entries(o).sort((a, b) => b[1] - a[1]);
    return e.length ? e[0] : null;
  };
  const tg = topEntry(killGrades), ts = topEntry(killSetups);
  const insightParts: string[] = [];
  if (tg && filtered.length >= 2 && tg[1] >= 2)
    insightParts.push(`${tg[1]} of ${filtered.length} blew on a **${tg[0]}**-grade trade`);
  else if (tg)
    insightParts.push(`Last blow-up was a **${tg[0]}**-grade trade`);
  if (ts && ts[1] >= 2)
    insightParts.push(`most common killing setup: **${ts[0]}** (${ts[1]}×)`);
  if (totSpent > 0)
    insightParts.push(`you've spent **${fmt(totSpent)}** on accounts that didn't survive`);

  // Charts
  const grades = ["A+", "A", "B"];
  const gradeData = grades.map((g) => infos.filter((i) => i.kill?.t.grade === g).length);
  const setupKeys = [...new Set(infos.map((i) => i.kill?.t.setup).filter(Boolean))] as string[];
  const setupData = setupKeys.map((s) => infos.filter((i) => i.kill?.t.setup === s).length);

  const gradeConfig = chartReady && infos.length ? {
    type: "bar",
    data: { labels: grades, datasets: [{ data: gradeData, backgroundColor: ["#26d07c","#3b82c4","#d4a948"], borderRadius: 6 }] },
    options: baseOpts,
  } : null;

  const setupConfig = chartReady && infos.length ? {
    type: "bar",
    data: {
      labels: setupKeys.map((s) => s.length > 10 ? s.slice(0, 9) + "…" : s),
      datasets: [{ data: setupData, backgroundColor: "#f0556d", borderRadius: 6 }],
    },
    options: baseOpts,
  } : null;

  // Reset handler
  const resetAccount = (id: string) => {
    const a = db.accounts.find((x) => x.id === id);
    if (!a || a.status !== "blown") return;
    const costStr = prompt(
      `Reset "${a.name}"\n\nHow much did this reset cost? (enter $ amount, or 0 if free)`
    );
    if (costStr === null) return;
    const cost = parseFloat(costStr) || 0;

    const next = { ...db };
    next.accounts = next.accounts.map((x) => {
      if (x.id !== id) return x;
      const updated = { ...x };
      if (!updated.resets) updated.resets = [];
      updated.resets = [...updated.resets, { date: today(), amount: cost }];
      (updated as any).resetCount = ((updated as any).resetCount ?? 0) + 1;

      const ps = acctPhases(updated);
      const prev = ps[ps.length - 1];
      if (prev && prev.outcome === "active") { prev.outcome = "blown"; prev.endDate = updated.blownDate ?? today(); }

      const fresh = {
        id: uid(), kind: prev?.kind ?? "eval" as const, label: null,
        startDate: today(), endDate: null,
        startBal: prev?.startBal ?? updated.bal ?? 0,
        target: prev?.target ?? updated.target ?? 0,
        dd: prev?.dd ?? updated.dd ?? 0,
        ddtype: prev?.ddtype ?? updated.ddtype ?? "static" as const,
        cost: 0, outcome: "active" as const,
      };
      updated.phases = [...(updated.phases ?? []), fresh];
      updated.status = "active";
      updated.blownDate = undefined;
      (updated as any).blownTradeId = null;

      // sync top-level from active phase
      updated.bal = fresh.startBal;
      updated.target = fresh.target;
      updated.dd = fresh.dd;
      updated.ddtype = fresh.ddtype;

      return updated;
    });
    save(next);
    alert(`Account reset. The blown attempt is kept in history.${cost ? ` $${cost} reset fee logged.` : ""}`);
  };

  const toggleAcct = (id: string) => {
    setSelAccts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Filters ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        {/* Account chips */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", minWidth: 160 }}>
          <div style={{ fontSize: 12, color: "var(--mut)", cursor: "pointer", userSelect: "none",
            display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setChipsOpen((v) => !v)}>
            <span style={{ fontSize: 10 }}>{chipsOpen ? "▾" : "▸"}</span> Accounts
          </div>
          {chipsOpen && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allBlown.length === 0
                ? <span style={{ color: "var(--dim)", fontSize: 12 }}>— no blown accounts —</span>
                : allBlown.map((a) => (
                  <button key={a.id} onClick={() => toggleAcct(a.id)} style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid",
                    borderColor: selAccts.has(a.id) ? "var(--red)" : "var(--line)",
                    background: selAccts.has(a.id) ? "rgba(240,85,109,.15)" : "transparent",
                    color: selAccts.has(a.id) ? "var(--red)" : "var(--mut)", cursor: "pointer",
                  }}>{a.name}</button>
                ))
              }
            </div>
          )}
        </div>

        {/* Date range */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 8 }}>
            Date range <span style={{ fontWeight: 400 }}>(by blow date)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 6,
                color: "var(--txt)", padding: "4px 8px", fontSize: 12 }} />
            <span style={{ color: "var(--mut)" }}>→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 6,
                color: "var(--txt)", padding: "4px 8px", fontSize: 12 }} />
            <button className="btn sm" onClick={() => { setFrom(""); setTo(""); }}>All</button>
          </div>
        </div>
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="big">⊘</div>
          No blown accounts in this view. Keep it that way.
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* ── Stat cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { lbl: "Accounts Blown", val: String(filtered.length), sub: selAccts.size > 0 ? "selected" : "in this view" },
              { lbl: "Capital Burned", val: fmt(totSpent), sub: "eval / reset fees", cls: "neg" },
              { lbl: "Net Outcome", val: fmt(net), sub: `realized ${fmt(totPnl)} − fees ${fmt(totSpent)}`, cls: net >= 0 ? "pos" : "neg" },
              { lbl: "Avg Lifespan", val: `${avgLife}d`, sub: "first to last trade" },
            ].map((c) => (
              <div key={c.lbl} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 6 }}>{c.lbl}</div>
                <div className={`val ${c.cls ?? ""}`} style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{c.val}</div>
                <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 6 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Insight banner ── */}
          {insightParts.length > 0 && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--red)", borderRadius: 12,
              padding: "14px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 6 }}>
                ⚠ What's killing your accounts
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.7 }}>
                {insightParts.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span style={{ color: "var(--dim)" }}> · </span>}
                    {p.split("**").map((seg, j) =>
                      j % 2 === 1 ? <b key={j}>{seg}</b> : seg
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Charts ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>
                Blowing Trade by Grade <span style={{ color: "var(--mut)", fontWeight: 400 }}>which grade kills you</span>
              </h3>
              <div style={{ height: 160, position: "relative" }}>
                <ChartCanvas id="b-grade" config={gradeConfig} ready={chartReady} />
              </div>
            </div>
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Blowing Trade by Setup</h3>
              <div style={{ height: 160, position: "relative" }}>
                <ChartCanvas id="b-setup" config={setupConfig} ready={chartReady} />
              </div>
            </div>
          </div>

          {/* ── Blown account cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {infos.map((info) => (
              <BlownCard key={info.a.id} info={info} onReset={() => resetAccount(info.a.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
