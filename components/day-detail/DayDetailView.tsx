"use client";

import { useDB } from "@/context/DBContext";
import { fmt, fmtDur, legNet, legComm, tradeDurMin, acctMap, filteredTrades } from "@/lib/db";

interface Props {
  date: string;       // YYYY-MM-DD
  onBack: () => void;
  onTradeClick?: (id: string) => void;
  // filters inherited from DashView
  selAccts: Set<string>;
  showBlown: boolean;
  from: string;
  to: string;
}

export default function DayDetailView({ date, onBack, onTradeClick, selAccts, showBlown, from, to }: Props) {
  const { db } = useDB();

  const allow = new Set(
    db.accounts.filter((a) => showBlown || a.status !== "blown").map((a) => a.id)
  );

  // All trades on this date matching current filters
  const trades = filteredTrades(db, selAccts, allow, date, date);
  const am = acctMap(db);

  const d = new Date(date + "T12:00");
  const title = d.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const tot = trades.reduce((a, t) => a + t._pnl, 0);
  const wins = trades.filter((t) => t._pnl > 0).length;

  return (
    <div>
      {/* Header — matches V1 exactly */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <button className="btn" onClick={onBack}>←</button>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{title}</h2>
      </div>

      {trades.length === 0 ? (
        <div className="empty-state">
          <div className="big">▦</div>
          No trades on this day for the current account filter.
        </div>
      ) : (
        <>
          {/* V1 td-stats */}
          <div className="td-stats">
            <div className="td-stat">
              <div className="l">Day P&amp;L</div>
              <div className={`v ${tot >= 0 ? "pos" : "neg"}`}>{fmt(tot)}</div>
            </div>
            <div className="td-stat">
              <div className="l">Trades</div>
              <div className="v">{trades.length}</div>
            </div>
            <div className="td-stat">
              <div className="l">Win Rate</div>
              <div className="v">{Math.round((wins / trades.length) * 100)}%</div>
            </div>
          </div>

          {/* V1 td-section table */}
          <div className="td-section">
            <h4>Trades this day</h4>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Inst</th>
                    <th>Dir</th>
                    <th>Grade</th>
                    <th>Setup</th>
                    <th>Accounts</th>
                    <th>Duration</th>
                    <th>P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => {
                    const gc = t.grade === "A+" ? "aplus" : t.grade === "A" ? "a" : "b";
                    const accts = (t._legs || [])
                      .map((l) => am[l.acct]?.name ?? "?")
                      .join(", ");
                    return (
                      <tr
                        key={t.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => onTradeClick?.(t.id)}
                      >
                        <td>{t.entryTime || "—"}</td>
                        <td>{t.inst}</td>
                        <td>{t.dir}</td>
                        <td><span className={`pill ${gc}`}>{t.grade}</span></td>
                        <td><span className="pill setup">{t.setup}</span></td>
                        <td style={{ color: "var(--mut)" }}>{accts}</td>
                        <td>{fmtDur(tradeDurMin(t))}</td>
                        <td className={t._pnl >= 0 ? "pos" : "neg"}>{fmt(t._pnl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
