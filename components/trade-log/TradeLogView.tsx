"use client";

import { useState } from "react";
import { useDB } from "@/context/DBContext";
import { fmt, fmtDur, legNet, legComm, tradeDurMin, acctMap } from "@/lib/db";
import { tagColor, pickInk } from "@/lib/instruments";
import type { Trade } from "@/types/journal";

const CAP = 300;

// ── Trade Detail ─────────────────────────────────────────────
function TradeDetail({ trade, onBack, onEdit }: {
  trade: Trade;
  onBack: () => void;
  onEdit: (id: string) => void;
}) {
  const { db } = useDB();
  const t = trade;
  const am = acctMap(db);

  const gc = t.grade === "A+" ? "aplus" : t.grade === "A" ? "a" : "b";
  const tot = (t.legs ?? []).reduce((a, l) => a + legNet(l), 0);
  const comm = (t.legs ?? []).reduce((a, l) => a + legComm(l), 0);
  const rNum = t.r !== "" && t.r != null && !isNaN(parseFloat(t.r ?? "")) ? parseFloat(t.r ?? "") : null;
  const rStr = rNum != null ? (rNum >= 0 ? "+" : "") + rNum + "R" : "—";
  const blew = db.accounts.some((a) => a.status === "blown" && (a as any).blownTradeId === t.id);
  const dur = tradeDurMin(t);

  // strategy criteria
  const strat = db.strategies.find((s) => s.id === t.setupId) ?? db.strategies.find((s) => s.name === t.setup);

  // tags
  const settingsTags = db.settings?.tags ?? { feelings: [], actions: [], execution: [] };
  const allTags = [
    ...(t.tags?.feelings ?? []).map((x) => ({ g: "feelings" as const, x })),
    ...(t.tags?.actions ?? []).map((x) => ({ g: "actions" as const, x })),
    ...(t.tags?.execution ?? []).map((x) => ({ g: "execution" as const, x })),
  ];

  return (
    <div className="wrap">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <button className="btn" onClick={onBack}>←</button>
        <h2 style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>{t.date} · {t.inst} · {t.dir}</h2>
        {!blew && (
          <button className="btn" onClick={() => onEdit(t.id)}>✎ Edit</button>
        )}
      </div>

      {/* Stats strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
        gap: 12, marginBottom: 18,
      }}>
        {[
          { l: "Net P&L", v: fmt(tot), cls: tot >= 0 ? "pos" : "neg" },
          { l: "R Multiple", v: rStr, cls: rNum != null && rNum >= 0 ? "pos" : "neg" },
          { l: "Grade", pill: true, grade: t.grade ?? "", gc },
          { l: "Strategy", v: t.setup ?? "—", small: true },
          { l: "Commissions", v: comm ? "−" + fmt(comm) : "—", small: true, mut: true },
          ...(dur != null ? [{ l: "Duration", v: fmtDur(dur), small: true }] : []),
        ].map((s: any) => (
          <div key={s.l} style={{
            background: "var(--panel2)", border: "1px solid var(--line)",
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 10, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>{s.l}</div>
            {s.pill ? (
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                <span className={`pill ${s.gc}`}>{s.grade || "—"}</span>
              </div>
            ) : (
              <div style={{
                fontSize: s.small ? 15 : 20, fontWeight: 800,
                color: s.mut ? "var(--mut)" : "inherit",
              }} className={s.cls}>{s.v}</div>
            )}
          </div>
        ))}
      </div>

      {/* Accounts legs */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--mut)", marginBottom: 12 }}>
          Accounts in this trade
        </h4>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th><th>Size</th><th>Entry</th><th>SL</th><th>Exit</th><th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {(t.legs ?? []).length === 0
                ? <tr><td colSpan={6} style={{ color: "var(--dim)" }}>none</td></tr>
                : (t.legs ?? []).map((l, i) => {
                  const acct = am[l.acct];
                  const blown = acct?.status === "blown";
                  return (
                    <tr key={i}>
                      <td>
                        <span style={{ color: "var(--blue)", fontWeight: 600 }}>
                          {acct?.name ?? "?"}{blown ? " 🪦" : ""}
                        </span>
                      </td>
                      <td>{l.size ?? "—"}</td>
                      <td>{l.entry ?? "—"}</td>
                      <td>{l.sl ?? "—"}</td>
                      <td>{l.exit ?? "—"}</td>
                      <td className={(l.pnl ?? 0) >= 0 ? "pos" : "neg"}>{fmt(l.pnl ?? 0)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategy criteria */}
      {strat && (
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--mut)", marginBottom: 12 }}>
            Strategy criteria — graded {t.grade}
          </h4>
          {strat.criteria.map((c, i) => {
            const met = (t.metCrit ?? []).includes(i);
            return (
              <div key={i} style={{ fontSize: 13, padding: "3px 0", color: met ? "var(--green)" : "var(--dim)" }}>
                {met ? "✓" : "○"} {c}
              </div>
            );
          })}
        </div>
      )}

      {/* Emotional state */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--mut)", marginBottom: 12 }}>
          Emotional state
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {allTags.length
            ? allTags.map(({ g, x }, i) => {
              const list = settingsTags[g] ?? [];
              const idx = list.indexOf(x);
              const col = tagColor(idx < 0 ? 0 : idx, list.length || 1);
              return (
                <span key={i} style={{
                  fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "default",
                  background: col, borderColor: col, color: pickInk(col), border: "1px solid",
                }}>{x}</span>
              );
            })
            : <span style={{ color: "var(--dim)", fontSize: 13 }}>no tags</span>
          }
        </div>
        <div style={{ fontSize: 13, color: "var(--mut)" }}>
          Discipline {t.disc || "—"}/12 · Followed plan: {t.plan || "—"}
        </div>
        {t.notes && (
          <div style={{
            marginTop: 10, fontSize: 14, lineHeight: 1.7, padding: 14,
            background: "var(--panel2)", borderRadius: 8,
          }}
            dangerouslySetInnerHTML={{ __html: t.notes }} />
        )}
      </div>
    </div>
  );
}

// ── Trade Log ────────────────────────────────────────────────
export default function TradeLogView({ onEditTrade }: { onEditTrade?: (id: string) => void }) {
  const { db, save } = useDB();
  const [detailId, setDetailId] = useState<string | null>(null);

  const am = acctMap(db);
  const rows = [...db.trades].reverse().slice(0, CAP);

  const delTrade = (id: string) => {
    const blewAccts = db.accounts.filter((a) => a.status === "blown" && (a as any).blownTradeId === id);
    if (blewAccts.length) {
      alert(`This trade can't be deleted.\n\nIt's the trade that blew: ${blewAccts.map((a) => a.name).join(", ")}.\n\nDeleting it would erase the record of how that account blew. It stays locked for your records.`);
      return;
    }
    if (!confirm("Delete this trade? This can't be undone.")) return;
    const next = { ...db, trades: db.trades.filter((t) => t.id !== id) };
    save(next);
  };

  // Trade detail view
  if (detailId) {
    const trade = db.trades.find((t) => t.id === detailId);
    if (trade) {
      return (
        <TradeDetail
          trade={trade}
          onBack={() => setDetailId(null)}
          onEdit={(id) => { onEditTrade?.(id); setDetailId(null); }}
        />
      );
    }
  }

  return (
    <div className="wrap">
      <div className="panel">
        <h3>All Trades</h3>

        {db.trades.length === 0 ? (
          <div className="empty-state">
            <div className="big">▦</div>
            No trades logged yet.
          </div>
        ) : (
          <div className="tbl-wrap">
            <table id="log-tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Inst</th>
                  <th>Setup</th>
                  <th>Grade</th>
                  <th>Dir</th>
                  <th>Accounts</th>
                  <th>Duration</th>
                  <th>R</th>
                  <th>Net P&L</th>
                  <th>Comm</th>
                  <th>Copy-lag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const gc = t.grade === "A+" ? "aplus" : t.grade === "A" ? "a" : "b";
                  const tot = (t.legs ?? []).reduce((a, l) => a + legNet(l), 0);
                  const commTot = (t.legs ?? []).reduce((a, l) => a + legComm(l), 0);
                  const slipTot = (t.legs ?? []).reduce((a: number, l: any) => a + (l.slip ?? 0), 0);
                  const rNum = t.r != null && t.r !== "" && !isNaN(parseFloat(t.r)) ? parseFloat(t.r) : null;
                  const rStr = rNum != null ? (rNum >= 0 ? "+" : "") + rNum + "R" : "—";
                  const dur = tradeDurMin(t);

                  return (
                    <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setDetailId(t.id)}>
                      <td>{t.date}</td>
                      <td>{t.inst}</td>
                      <td><span className="pill setup">{t.setup}</span></td>
                      <td><span className={`pill ${gc}`}>{t.grade}</span></td>
                      <td>{t.dir}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(t.legs ?? []).map((l, i) => {
                            const acct = am[l.acct];
                            return (
                              <span key={i} style={{
                                fontSize: 10, padding: "1px 7px", borderRadius: 10,
                                background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--mut)",
                              }}>
                                {acct?.name ?? "?"}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ color: "var(--mut)" }}>{fmtDur(dur)}</td>
                      <td className={rNum != null && rNum >= 0 ? "pos" : "neg"}>{rStr}</td>
                      <td className={tot >= 0 ? "pos" : "neg"}>{fmt(tot)}</td>
                      <td style={{ color: "var(--mut)" }}>{commTot ? "−" + fmt(commTot) : "—"}</td>
                      <td style={{ color: "var(--gold)" }}>{slipTot ? fmt(slipTot) : "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span style={{ color: "var(--dim)", cursor: "pointer", marginRight: 8 }}
                          onMouseOver={(e) => e.currentTarget.style.color = "var(--red)"}
                          onMouseOut={(e) => e.currentTarget.style.color = "var(--dim)"}
                          onClick={() => delTrade(t.id)}>✕</span>
                        <span style={{ color: "var(--blue)", cursor: "pointer" }}
                          onClick={() => { onEditTrade?.(t.id); }}>✎</span>
                      </td>
                    </tr>
                  );
                })}
                {db.trades.length > CAP && (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", color: "var(--dim)", padding: 16 }}>
                      Showing most recent {CAP} of {db.trades.length} trades.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
