"use client";

import { useState, useCallback, useEffect } from "react";
import { useDB } from "@/context/DBContext";
import { uid, fmt, legComm, commRateFor, simulateDdBlows, applyTradeBlows, activePhase } from "@/lib/db";
import { instPt, calcLegPnl, calcR, tagColor, pickInk, INST_KEYS } from "@/lib/instruments";
import type { Trade, TradeLeg, Grade } from "@/types/journal";

// ── Types ────────────────────────────────────────────────────
interface LegDraft {
  acctId: string;
  checked: boolean;
  size: string;
  entry: string;
  sl: string;
  exit: string;
  pnl: string;
  slip: string;
}

interface TagState {
  feelings: string[];
  actions: string[];
  execution: string[];
}

const STEPS = ["Method", "Trade", "Strategy", "Emotion", "Review"];

const INPUT: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--txt)",
  padding: "9px 12px",
  fontSize: 13,
  width: "100%",
  outline: "none",
};
const SELECT: React.CSSProperties = { ...INPUT, cursor: "pointer" };
const LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "var(--mut)",
  textTransform: "uppercase",
  letterSpacing: ".6px",
  fontWeight: 600,
  display: "block",
  marginBottom: 5,
};

// ── Step pills ───────────────────────────────────────────────
function StepPills({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {STEPS.map((lbl, i) => (
        <span key={i} style={{
          fontSize: 11, padding: "3px 10px", borderRadius: 20,
          fontWeight: i === step ? 700 : 400,
          background: i === step ? "rgba(38,208,124,.15)" : i < step ? "rgba(38,208,124,.07)" : "transparent",
          color: i === step ? "var(--green)" : i < step ? "var(--green)" : "var(--dim)",
          border: `1px solid ${i <= step ? "rgba(38,208,124,.3)" : "var(--line)"}`,
        }}>
          {i + 1}. {lbl}
        </span>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function AddTradeView({ onDone, onCsvImport, editTradeId }: { onDone: (blewUp?: boolean) => void; onCsvImport?: () => void; editTradeId?: string | null }) {
  const { db, save } = useDB();

  const [step, setStep] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);

  // Step 1 — trade data
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inst, setInst] = useState("NQ");
  const [dir, setDir] = useState<"Long" | "Short">("Long");
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [rMultiple, setRMultiple] = useState("");

  // Bulk apply params
  const [apSize, setApSize] = useState("");
  const [apEntry, setApEntry] = useState("");
  const [apSl, setApSl] = useState("");
  const [apExit, setApExit] = useState("");

  // Legs
  const activeAccts = db.accounts.filter((a) => a.status !== "blown");
  const [legs, setLegs] = useState<LegDraft[]>(() =>
    activeAccts.map((a) => ({ acctId: a.id, checked: false, size: "", entry: "", sl: "", exit: "", pnl: "", slip: "" }))
  );

  // Step 2 — strategy
  const [setupId, setSetupId] = useState(() => db.strategies[0]?.id ?? "");
  const [metCrit, setMetCrit] = useState<Set<number>>(new Set());
  const [grade, setGrade] = useState<Grade>("");

  // Step 3 — emotion
  const [tags, setTags] = useState<TagState>({ feelings: [], actions: [], execution: [] });
  const [disc, setDisc] = useState("");
  const [plan, setPlan] = useState("Yes");
  const [notes, setNotes] = useState("");

  // ── Load an existing trade for editing ─────────────────────
  // Mirrors V1 editTrade(): the trade that blew an account stays locked.
  useEffect(() => {
    if (!editTradeId) return;
    const t = db.trades.find((x) => x.id === editTradeId);
    if (!t) return;
    const blew = db.accounts.filter((a) => a.status === "blown" && a.blownTradeId === t.id);
    if (blew.length) {
      alert(
        `This trade can't be edited.\n\nIt's the trade that blew: ${blew.map((a) => a.name).join(", ")}. ` +
        `It stays locked to preserve the record of the blow.`
      );
      onDone();
      return;
    }
    setEditId(t.id);
    setDate(t.date);
    setInst(t.inst);
    setDir(t.dir);
    setEntryTime(t.entryTime ?? "");
    setExitTime(t.exitTime ?? "");
    setRMultiple(t.r ?? "");
    setSetupId(t.setupId || db.strategies.find((s) => s.name === t.setup)?.id || db.strategies[0]?.id || "");
    setMetCrit(new Set(t.metCrit ?? []));
    setGrade(t.grade ?? "");
    setTags({
      feelings: [...(t.tags?.feelings ?? [])],
      actions: [...(t.tags?.actions ?? [])],
      execution: [...(t.tags?.execution ?? [])],
    });
    setDisc(t.disc ?? "");
    setPlan(t.plan ?? "Yes");
    setNotes(t.notes ?? "");
    setLegs(
      db.accounts
        .filter((a) => a.status !== "blown" || (t.legs ?? []).some((l) => l.acct === a.id))
        .map((a) => {
          const leg = (t.legs ?? []).find((l) => l.acct === a.id);
          return leg
            ? {
                acctId: a.id, checked: true,
                size: leg.size != null ? String(leg.size) : "",
                entry: leg.entry != null ? String(leg.entry) : "",
                sl: leg.sl != null ? String(leg.sl) : "",
                exit: leg.exit != null ? String(leg.exit) : "",
                pnl: leg.pnl != null ? String(leg.pnl) : "",
                slip: leg.slip != null ? String(leg.slip) : "",
              }
            : { acctId: a.id, checked: false, size: "", entry: "", sl: "", exit: "", pnl: "", slip: "" };
        })
    );
    setStep(1); // skip the method picker straight into the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTradeId]);

  // ── Leg recalc ─────────────────────────────────────────────
  const recalcLeg = useCallback((idx: number, updated: Partial<LegDraft>) => {
    setLegs((prev) => {
      const next = prev.map((l, i) => i === idx ? { ...l, ...updated } : l);
      const leg = next[idx];
      const size = parseFloat(leg.size);
      const entry = parseFloat(leg.entry);
      const exit = parseFloat(leg.exit);
      if (!isNaN(size) && !isNaN(entry) && !isNaN(exit)) {
        const pnl = calcLegPnl(inst, dir, size, entry, exit);
        next[idx] = { ...next[idx], pnl: pnl.toFixed(2) };
      } else {
        next[idx] = { ...next[idx], pnl: "" };
      }
      return next;
    });
    recalcR();
  }, [inst, dir]);

  const recalcR = useCallback(() => {
    for (const leg of legs) {
      if (!leg.checked) continue;
      const entry = parseFloat(leg.entry);
      const sl = parseFloat(leg.sl);
      const exit = parseFloat(leg.exit);
      if (!isNaN(entry) && !isNaN(sl) && !isNaN(exit)) {
        setRMultiple(calcR(dir, entry, sl, exit));
        return;
      }
    }
    setRMultiple("");
  }, [legs, dir]);

  const applyBulk = () => {
    setLegs((prev) => prev.map((leg) => {
      if (!leg.checked) return leg;
      const updated = { ...leg };
      if (apSize) updated.size = apSize;
      if (apEntry) updated.entry = apEntry;
      if (apSl) updated.sl = apSl;
      if (apExit) updated.exit = apExit;
      const size = parseFloat(updated.size);
      const entry = parseFloat(updated.entry);
      const exit = parseFloat(updated.exit);
      if (!isNaN(size) && !isNaN(entry) && !isNaN(exit)) {
        updated.pnl = calcLegPnl(inst, dir, size, entry, exit).toFixed(2);
      }
      return updated;
    }));
    recalcR();
  };

  // ── Auto grade ─────────────────────────────────────────────
  const autoGrade = (newMetCrit: Set<number>): Grade => {
    const strat = db.strategies.find((s) => s.id === setupId);
    if (!strat) return "";
    const met = newMetCrit.size;
    if (met >= strat.thresholds.aplus) return "A+";
    if (met >= strat.thresholds.a) return "A";
    return "B";
  };

  const toggleCrit = (i: number) => {
    setMetCrit((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      setGrade(autoGrade(next));
      return next;
    });
  };

  // ── Tag toggle ─────────────────────────────────────────────
  const toggleTag = (group: keyof TagState, t: string) => {
    setTags((prev) => {
      const arr = prev[group];
      return {
        ...prev,
        [group]: arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t],
      };
    });
  };

  // ── Save ───────────────────────────────────────────────────
  const saveTrade = () => {
    if (!date) { alert("Add a date for the trade."); return; }

    const checkedLegs = legs.filter((l) => l.checked);
    if (checkedLegs.length === 0 && activeAccts.length > 0) {
      if (!confirm("No accounts ticked for this trade. Save anyway?")) return;
    }

    const rate = commRateFor(inst, db.settings);
    const builtLegs: TradeLeg[] = checkedLegs.map((l) => {
      const acct = db.accounts.find((a) => a.id === l.acctId);
      return {
        acct: l.acctId,
        size: parseFloat(l.size) || undefined,
        entry: parseFloat(l.entry) || undefined,
        sl: parseFloat(l.sl) || undefined,
        exit: parseFloat(l.exit) || undefined,
        pnl: parseFloat(l.pnl) || 0,
        slip: parseFloat(l.slip) || 0,
        comm: rate,
        phase: acct ? activePhase(acct)?.id ?? undefined : undefined,
      };
    });

    const strat = db.strategies.find((s) => s.id === setupId);
    const trade: Trade = {
      id: editId ?? uid(),
      date,
      inst,
      dir,
      setup: strat?.name ?? setupId,
      setupId,
      metCrit: [...metCrit],
      grade,
      r: rMultiple.replace(/[+R]/g, ""),
      entryTime,
      exitTime,
      disc,
      plan,
      notes,
      tags: { feelings: [...tags.feelings], actions: [...tags.actions], execution: [...tags.execution] },
      legs: builtLegs,
    };

    // ── Blow-up detection ──────────────────────────────────────
    // Warn BEFORE committing if this trade pushes any account past its
    // drawdown floor. evalDrawdownSim excludes this trade's id, so it works
    // for both new trades and edits.
    const ddBlows = simulateDdBlows(db, trade);
    if (ddBlows.length) {
      const names = ddBlows
        .map((b) => `• ${b.name} (balance would hit ${fmt(b.curBal)}, floor ${fmt(b.floor)})`)
        .join("\n");
      if (!confirm(
        `⚠ This trade BLOWS the following account(s):\n\n${names}\n\n` +
        `Logging it will permanently mark them blown (locked, removed from new trades, kept for records).\n\nProceed?`
      )) return;
    }

    const working = { ...db, trades: [...db.trades] };
    const ix = working.trades.findIndex((t) => t.id === trade.id);
    if (ix >= 0) working.trades[ix] = trade;
    else working.trades.push(trade);
    working.trades.sort((a, b) => a.date.localeCompare(b.date));

    // Apply the blow-up (drawdown + personal-account margin floor) now that the
    // trade is in the DB, flipping accounts to "blown" and sealing their phase.
    const { db: nextDB, blown } = applyTradeBlows(working, trade);

    save(nextDB);
    onDone(blown.length > 0);
  };

  const reset = () => {
    setStep(0); setDate(new Date().toISOString().slice(0, 10));
    setInst("NQ"); setDir("Long"); setEntryTime(""); setExitTime(""); setRMultiple("");
    setLegs(activeAccts.map((a) => ({ acctId: a.id, checked: false, size: "", entry: "", sl: "", exit: "", pnl: "", slip: "" })));
    setSetupId(db.strategies[0]?.id ?? ""); setMetCrit(new Set()); setGrade("");
    setTags({ feelings: [], actions: [], execution: [] }); setDisc(""); setPlan("Yes"); setNotes("");
    setEditId(null);
  };

  // ── Render steps ────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 18 }}>How do you want to log this trade?</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 500 }}>
        {[
          { icon: "✍️", title: "Manual entry", sub: "Enter the trade by hand, step by step.", action: () => setStep(1) },
          { icon: "📄", title: "CSV import", sub: "Import from TopstepX, Quantower, Motivewave or Sierra Chart.", action: () => onCsvImport?.() },
        ].map((c) => (
          <div key={c.title} onClick={c.action} style={{
            background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 12,
            padding: "22px 18px", cursor: "pointer", transition: ".12s",
          }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: "var(--mut)" }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div>
      {/* Core fields */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
        <div>
          <label style={LABEL}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Instrument</label>
          <select value={inst} onChange={(e) => { setInst(e.target.value); }} style={SELECT}>
            {INST_KEYS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Direction</label>
          <select value={dir} onChange={(e) => setDir(e.target.value as "Long" | "Short")} style={SELECT}>
            <option>Long</option>
            <option>Short</option>
          </select>
        </div>
        <div>
          <label style={LABEL}>Entry time <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          <input type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Exit time <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          <input type="time" value={exitTime} onChange={(e) => setExitTime(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>R Multiple (auto)</label>
          <input type="text" value={rMultiple} readOnly placeholder="from entry/exit/SL"
            style={{ ...INPUT, background: "var(--panel)", color: "var(--green)", fontWeight: 700 }} />
        </div>
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Accounts in this trade</h3>

      {activeAccts.length === 0 ? (
        <p style={{ color: "var(--mut)", fontSize: 12 }}>No accounts yet — add them in the Accounts tab first.</p>
      ) : (
        <>
          {/* Bulk apply */}
          <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
              <button className="btn sm" onClick={() => setLegs((p) => p.map((l) => ({ ...l, checked: true })))}>☑ Check all</button>
              <button className="btn sm" onClick={() => setLegs((p) => p.map((l) => ({ ...l, checked: false })))}>☐ Uncheck all</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 10 }}>Apply same parameters to all ticked accounts:</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              {[
                { label: "Size", val: apSize, set: setApSize },
                { label: "Entry", val: apEntry, set: setApEntry },
                { label: "SL", val: apSl, set: setApSl },
                { label: "Exit", val: apExit, set: setApExit },
              ].map(({ label, val, set }) => (
                <div key={label} style={{ minWidth: 80 }}>
                  <label style={{ ...LABEL, marginBottom: 3 }}>{label}</label>
                  <input type="number" step="any" value={val} onChange={(e) => set(e.target.value)}
                    placeholder={label.toLowerCase()} style={{ ...INPUT, width: 90 }} />
                </div>
              ))}
              <button className="btn sm" style={{ marginBottom: 1, background: "rgba(38,208,124,.15)", borderColor: "var(--green)", color: "var(--green)" }}
                onClick={applyBulk}>Apply to ticked</button>
            </div>
          </div>

          {/* Leg table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>{["In?","Account","Size","Entry","SL","Exit","P&L (auto)","Copy-lag $"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--mut)", fontWeight: 600, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {legs.map((leg, idx) => {
                  const acct = db.accounts.find((a) => a.id === leg.acctId);
                  if (!acct) return null;
                  return (
                    <tr key={leg.acctId}>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="checkbox" checked={leg.checked}
                          onChange={(e) => recalcLeg(idx, { checked: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: "var(--green)", cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{acct.name}</td>
                      {(["size","entry","sl","exit"] as const).map((field) => (
                        <td key={field} style={{ padding: "4px 6px" }}>
                          <input type="number" step="any" value={leg[field]} placeholder={field}
                            onChange={(e) => recalcLeg(idx, { [field]: e.target.value })}
                            style={{ ...INPUT, width: 80, padding: "5px 8px" }} />
                        </td>
                      ))}
                      <td style={{ padding: "4px 6px" }}>
                        <input type="text" value={leg.pnl} readOnly placeholder="auto"
                          style={{ ...INPUT, width: 80, padding: "5px 8px", background: "var(--panel)",
                            color: leg.pnl ? (parseFloat(leg.pnl) >= 0 ? "var(--green)" : "var(--red)") : "var(--dim)",
                            fontWeight: 700 }} />
                      </td>
                      <td style={{ padding: "4px 6px" }}>
                        <input type="number" step="any" value={leg.slip} placeholder="lag $"
                          onChange={(e) => setLegs((p) => p.map((l, i) => i === idx ? { ...l, slip: e.target.value } : l))}
                          style={{ ...INPUT, width: 70, padding: "5px 8px" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  const renderStep2 = () => {
    const strat = db.strategies.find((s) => s.id === setupId);
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, maxWidth: 500, marginBottom: 20 }}>
          <div>
            <label style={LABEL}>Strategy</label>
            <select value={setupId} onChange={(e) => { setSetupId(e.target.value); setMetCrit(new Set()); setGrade("B"); }} style={SELECT}>
              {db.strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Grade (auto)</label>
            <input type="text" value={grade} readOnly placeholder="tick criteria →"
              style={{ ...INPUT, background: "var(--panel)", fontWeight: 800, textAlign: "center",
                color: grade === "A+" ? "var(--aplus)" : grade === "A" ? "var(--a)" : grade === "B" ? "var(--b)" : "var(--mut)" }} />
          </div>
        </div>

        <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Tick the criteria that were met</h3>
          {strat && (
            <p style={{ color: "var(--mut)", fontSize: 12, marginBottom: 14 }}>
              Grades A+ at {strat.thresholds.aplus}+ met · A at {strat.thresholds.a}+ · B below (of {strat.criteria.length})
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {strat?.criteria.map((c, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer",
                padding: "8px 12px", borderRadius: 8, background: metCrit.has(i) ? "rgba(38,208,124,.1)" : "transparent",
                border: `1px solid ${metCrit.has(i) ? "rgba(38,208,124,.3)" : "var(--line)"}`, transition: ".12s" }}>
                <input type="checkbox" checked={metCrit.has(i)} onChange={() => toggleCrit(i)}
                  style={{ width: 15, height: 15, accentColor: "var(--green)", cursor: "pointer", flexShrink: 0 }} />
                <span style={{ color: metCrit.has(i) ? "var(--txt)" : "var(--mut)" }}>{c}</span>
              </label>
            ))}
          </div>
          {grade && (
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--mut)" }}>
              <b style={{ color: grade === "A+" ? "var(--aplus)" : grade === "A" ? "var(--a)" : "var(--b)" }}>{grade}</b>
              {" "}— {metCrit.size} of {strat?.criteria.length ?? 0} criteria met
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    const settingsTags = db.settings?.tags ?? { feelings: [], actions: [], execution: [] };
    const groups: { key: keyof TagState; title: string; sub: string }[] = [
      { key: "feelings", title: "Feelings", sub: "hot (negative) → cool (good)" },
      { key: "actions",  title: "Actions",  sub: "hot (negative) → cool (good)" },
      { key: "execution", title: "Execution", sub: "hot (negative) → cool (good)" },
    ];

    return (
      <div>
        <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 18 }}>
          Tag what was true for this trade. Three kinds of thing — keep them separate, it's where the real insight comes from.
        </p>

        {groups.map(({ key, title, sub }) => {
          const list = settingsTags[key] ?? [];
          return (
            <div key={key} style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{title}</h4>
              <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 10 }}>{sub}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {list.map((t, i) => {
                  const col = tagColor(i, list.length);
                  const on = tags[key].includes(t);
                  return (
                    <span key={t} onClick={() => toggleTag(key, t)} style={{
                      fontSize: 12, padding: "5px 14px", borderRadius: 20, cursor: "pointer",
                      border: `1px solid ${col}`,
                      background: on ? col : "transparent",
                      color: on ? pickInk(col) : "var(--txt)",
                      transition: ".1s",
                    }}>{t}</span>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 400, marginBottom: 18 }}>
          <div>
            <label style={LABEL}>Discipline /12</label>
            <input type="number" min={0} max={12} value={disc} onChange={(e) => setDisc(e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Followed plan?</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} style={SELECT}>
              <option>Yes</option>
              <option>No</option>
              <option>Partial</option>
            </select>
          </div>
        </div>

        <div>
          <label style={LABEL}>Notes / reflection</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened, what you learned, the one honest line…"
            rows={5}
            style={{ ...INPUT, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
        </div>
      </div>
    );
  };

  const renderStep4 = () => {
    const strat = db.strategies.find((s) => s.id === setupId);
    const checkedLegs = legs.filter((l) => l.checked);
    const settingsTags = db.settings?.tags ?? { feelings: [], actions: [], execution: [] };
    const allTagKeys: (keyof TagState)[] = ["feelings", "actions", "execution"];
    const allTags = allTagKeys.flatMap((g) => tags[g].map((t) => ({ g, t })));

    return (
      <div>
        <p style={{ color: "var(--mut)", fontSize: 13, marginBottom: 18 }}>
          Final check. Jump back to edit anything. Nothing is saved until you submit.
        </p>

        {/* Trade block */}
        <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700 }}>Trade</h4>
            <span style={{ fontSize: 12, color: "var(--green)", cursor: "pointer" }} onClick={() => setStep(1)}>edit</span>
          </div>
          <div style={{ fontSize: 14 }}>{date} · {inst} · {dir}{rMultiple ? ` · R ${rMultiple}` : ""}</div>
          {checkedLegs.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 6 }}>
              {checkedLegs.map((l) => {
                const a = db.accounts.find((x) => x.id === l.acctId);
                return `${a?.name ?? "?"}: ${l.pnl ? fmt(parseFloat(l.pnl)) : "—"}`;
              }).join(" · ")}
            </div>
          )}
        </div>

        {/* Strategy block */}
        <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700 }}>Strategy</h4>
            <span style={{ fontSize: 12, color: "var(--green)", cursor: "pointer" }} onClick={() => setStep(2)}>edit</span>
          </div>
          <div style={{ fontSize: 14 }}>
            {strat?.name ?? "—"} · grade{" "}
            <b style={{ color: grade === "A+" ? "var(--aplus)" : grade === "A" ? "var(--a)" : "var(--b)" }}>{grade || "—"}</b>
          </div>
        </div>

        {/* Emotion block */}
        <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700 }}>Emotional state</h4>
            <span style={{ fontSize: 12, color: "var(--green)", cursor: "pointer" }} onClick={() => setStep(3)}>edit</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {allTags.length ? allTags.map(({ g, t }, i) => {
              const list = settingsTags[g as keyof typeof settingsTags] ?? [];
              const idx = list.indexOf(t);
              const col = tagColor(idx < 0 ? 0 : idx, list.length || 1);
              return (
                <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20,
                  background: col, borderColor: col, color: pickInk(col), border: "1px solid" }}>{t}</span>
              );
            }) : <span style={{ color: "var(--dim)", fontSize: 12 }}>none</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)" }}>
            Discipline {disc || "—"}/12 · Followed plan: {plan}
            {notes && ` · "${notes.slice(0, 80).replace(/\n/g, " ")}${notes.length > 80 ? "…" : ""}"`}
          </div>
        </div>
      </div>
    );
  };

  // ── Nav validation ─────────────────────────────────────────
  const handleNext = () => {
    if (step === 1 && !date) { alert("Add a date for the trade."); return; }
    setStep((s) => Math.min(4, s + 1));
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 24 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
            {editId ? "Edit Trade" : "Log a Trade"}
          </h3>
          <StepPills step={step} />
        </div>

        {/* Step content */}
        <div style={{ minHeight: 300 }}>
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          {step > 0 && (
            <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>
          )}
          <button className="btn" onClick={() => { reset(); onDone(); }}>Cancel</button>
          <span style={{ flex: 1 }} />
          {step > 0 && step < 4 && (
            <button className="btn" style={{ background: "rgba(38,208,124,.15)", borderColor: "var(--green)", color: "var(--green)", fontWeight: 700 }}
              onClick={handleNext}>Next →</button>
          )}
          {step === 4 && (
            <button className="btn" style={{ background: "var(--green)", color: "#04140b", border: "none", fontWeight: 700 }}
              onClick={saveTrade}>✓ Submit trade</button>
          )}
        </div>
      </div>
    </div>
  );
}
