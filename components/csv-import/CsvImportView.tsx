"use client";

import { useRef, useState } from "react";
import { useDB } from "@/context/DBContext";
import { uid, acctMap, legComm } from "@/lib/db";
import { tagColor, pickInk } from "@/lib/instruments";
import {
  SUPPORTED, parseTradeFile, importKey, impHhmm, rootToInst, impSummary,
  type ParsedTrade, type PlatformId,
} from "@/lib/importEngine";

const IMP_LABELS = ["CSV upload", "Strategy", "Emotion", "Review"];

interface StratState  { sid: string; met: number[]; grade: string; sl: number | null; r: string; }
interface EmoState    { feelings: string[]; actions: string[]; execution: string[]; disc: string; plan: string; notes: string; }

function defaultStrat(): StratState  { return { sid: "", met: [], grade: "", sl: null, r: "" }; }
function defaultEmo():   EmoState    { return { feelings: [], actions: [], execution: [], disc: "", plan: "Yes", notes: "" }; }

interface Props { onDone?: () => void; }

export default function CsvImportView({ onDone }: Props) {
  const { db, save } = useDB();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLLabelElement>(null);

  const [step, setStep]           = useState(0);
  const [platform, setPlatform]   = useState<PlatformId | "">("");
  const [preview, setPreview]     = useState<React.ReactNode>(null);
  const [fresh, setFresh]         = useState<ParsedTrade[]>([]);
  const [parsed, setParsed]       = useState<{ platform: string; name: string } | null>(null);
  const [showAccts, setShowAccts] = useState(false);
  const [tickedAccts, setTickedAccts] = useState<Set<string>>(new Set());
  const [strat, setStrat]   = useState<Record<number, StratState>>({});
  const [emo, setEmo]       = useState<Record<number, EmoState>>({});
  const [expandedS, setExpandedS] = useState<Set<number>>(new Set());
  const [expandedE, setExpandedE] = useState<Set<number>>(new Set());
  const [hot, setHot] = useState(false);

  function impGate(pv: string) {
    setPlatform(pv as PlatformId | "");
    setPreview(null);
    setShowAccts(false);
    setFresh([]);
  }

  function handleFiles(files: FileList | null) {
    if (!platform || platform === "__other__") return;
    const f = files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => impPreview(f.name, r.result as string, platform);
    r.readAsText(f);
  }

  function fmt(n: number) {
    const s = n < 0 ? "-" : "";
    return s + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function impPreview(name: string, text: string, pv: string) {
    const res = parseTradeFile(name, text, pv);
    if (res.error) {
      setPreview(<div style={{ color: "var(--red)", fontSize: 13, padding: "8px 0" }}>{res.error}</div>);
      setShowAccts(false); setFresh([]); return;
    }
    const existing = new Set(db.trades.map((t) => t.importKey).filter(Boolean));
    const withKey = res.trades.map((t) => ({ ...t, _key: importKey(t, pv), _dupe: existing.has(importKey(t, pv)) }));
    const newFresh = withKey.filter((t) => !t._dupe && !t.open);
    const dupes    = withKey.filter((t) => t._dupe).length;
    const open     = withKey.filter((t) => t.open).length;
    const net      = newFresh.reduce((a, t) => a + (t.netPnL || 0), 0);
    setParsed({ platform: pv, name });
    setFresh(newFresh);
    // init strat/emo state
    const s: Record<number, StratState> = {};
    const e: Record<number, EmoState>   = {};
    newFresh.forEach((_, i) => { s[i] = defaultStrat(); e[i] = defaultEmo(); });
    setStrat(s); setEmo(e);
    setExpandedS(new Set()); setExpandedE(new Set());
    setPreview(
      <div style={{ fontSize: 13 }}>
        <b style={{ color: "var(--green)" }}>{newFresh.length}</b> new trade{newFresh.length !== 1 ? "s" : ""} · net {fmt(net)}
        {dupes > 0 && <> · <span style={{ color: "var(--gold)" }}>{dupes} duplicate{dupes !== 1 ? "s" : ""} (skipped)</span></>}
        {open > 0  && <> · <span style={{ color: "var(--mut)"  }}>{open} still-open (skipped)</span></>}
      </div>
    );
    setShowAccts(newFresh.length > 0);
  }

  function toggleAcct(id: string) {
    setTickedAccts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function checkAll(state: boolean) {
    const active = db.accounts.filter((a) => a.status !== "blown").map((a) => a.id);
    setTickedAccts(state ? new Set(active) : new Set());
  }

  /* ── Strategy panel ── */
  function StratPanel({ i }: { i: number }) {
    const st = strat[i] ?? defaultStrat();
    const t  = fresh[i];
    const stt = db.strategies.find((s) => s.id === st.sid);

    function calcR(sl: number | null) {
      if (sl == null || t.entryPrice == null || t.exitPrice == null) return "";
      const risk = Math.abs(t.entryPrice - sl);
      if (!risk) return "";
      const sign = t.direction === "Long" ? 1 : -1;
      const r = ((t.exitPrice - t.entryPrice) * sign) / risk;
      return (r >= 0 ? "+" : "") + r.toFixed(2);
    }

    function pickGrade(met: number[], stt: any) {
      if (!stt) return "";
      if (met.length >= stt.thresholds.aplus) return "A+";
      if (met.length >= stt.thresholds.a)     return "A";
      return "B";
    }

    function update(patch: Partial<StratState>) {
      setStrat((prev) => ({ ...prev, [i]: { ...(prev[i] ?? defaultStrat()), ...patch } }));
    }

    const gradeColor = st.grade === "A+" ? "var(--aplus)" : st.grade === "A" ? "var(--a)" : "var(--b)";

    return (
      <div style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <div className="fld" style={{ minWidth: 120 }}>
            <label>Stop loss <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(for R)</span></label>
            <input type="number" step="any" value={st.sl ?? ""} placeholder="SL price"
              onChange={(e) => {
                const sl = e.target.value ? parseFloat(e.target.value) : null;
                update({ sl, r: sl != null ? calcR(sl) : "" });
              }} />
          </div>
          <div className="fld" style={{ maxWidth: 120 }}>
            <label>R (auto)</label>
            <input readOnly value={st.r ? (parseFloat(st.r) >= 0 ? "+" : "") + st.r + "R" : ""}
              placeholder="needs SL" style={{ background: "var(--panel)", color: "var(--green)", fontWeight: 700 }} />
          </div>
          <div className="fld" style={{ minWidth: 200 }}>
            <label>Strategy</label>
            <select value={st.sid} onChange={(e) => {
              const sid = e.target.value;
              const s2 = db.strategies.find((s) => s.id === sid);
              const grade = s2 ? pickGrade([], s2) : "";
              update({ sid, met: [], grade });
            }}>
              <option value="">— none —</option>
              {db.strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="fld" style={{ maxWidth: 110 }}>
            <label>Grade</label>
            <input readOnly value={st.grade || ""} placeholder="—"
              style={{ background: "var(--panel)", fontWeight: 800, textAlign: "center", color: gradeColor }} />
          </div>
        </div>
        {stt && (
          <div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 6 }}>
              Criteria met (A+ at {stt.thresholds.aplus}+, A at {stt.thresholds.a}+, of {stt.criteria.length}):
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0 6px" }}>
              {stt.criteria.map((c: string, ci: number) => (
                <label key={ci} className="leg-chip" style={{ margin: "0 0 6px" }}>
                  <input type="checkbox" checked={st.met.includes(ci)}
                    onChange={(e) => {
                      const met = e.target.checked
                        ? [...st.met, ci]
                        : st.met.filter((x) => x !== ci);
                      const grade = pickGrade(met, stt);
                      update({ met, grade });
                    }} />
                  {c}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Emotion panel ── */
  function EmoPanel({ i }: { i: number }) {
    const em = emo[i] ?? defaultEmo();
    const tags = db.settings?.tags ?? { feelings: [], actions: [], execution: [] };

    function update(patch: Partial<EmoState>) {
      setEmo((prev) => ({ ...prev, [i]: { ...(prev[i] ?? defaultEmo()), ...patch } }));
    }

    function toggleTag(group: "feelings" | "actions" | "execution", tag: string) {
      const arr = [...(em[group] ?? [])];
      const ix = arr.indexOf(tag);
      if (ix >= 0) arr.splice(ix, 1); else arr.push(tag);
      update({ [group]: arr });
    }

    const groups: { key: "feelings" | "actions" | "execution"; label: string; cls: string }[] = [
      { key: "feelings", label: "Feelings", cls: "tg-feel" },
      { key: "actions",  label: "Actions",  cls: "tg-act"  },
      { key: "execution",label: "Execution",cls: "tg-exec" },
    ];

    return (
      <div style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
        {groups.map(({ key, label, cls }) => (
          <div key={key} className={`tag-group ${cls}`}>
            <h4>{label}</h4>
            <div className="tag-row">
              {(tags[key] ?? []).map((tag: string, idx: number) => {
                const col = tagColor(idx, (tags[key] ?? []).length);
                const on = em[key].includes(tag);
                return (
                  <span key={tag} className={`tag-chip${on ? " on" : ""}`}
                    style={on ? { background: col, borderColor: col, color: pickInk(col) } : { borderColor: col }}
                    onClick={() => toggleTag(key, tag)}>{tag}</span>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div className="fld" style={{ maxWidth: 130 }}>
            <label>Discipline /12</label>
            <input type="number" min={0} max={12} value={em.disc}
              onChange={(e) => update({ disc: e.target.value })} />
          </div>
          <div className="fld" style={{ maxWidth: 150 }}>
            <label>Followed plan?</label>
            <select value={em.plan} onChange={(e) => update({ plan: e.target.value })}>
              <option>Yes</option><option>No</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600 }}>Notes</label>
          <textarea value={em.notes} onChange={(e) => update({ notes: e.target.value })}
            placeholder="What happened on this trade…"
            style={{ width: "100%", minHeight: 56, marginTop: 6, background: "var(--panel2)", color: "var(--txt)", border: "1px solid var(--line)", borderRadius: 8, padding: 8, fontFamily: "inherit", resize: "vertical" }} />
        </div>
      </div>
    );
  }

  /* ── Collapsible trade card ── */
  function TradeCard({ i, mode }: { i: number; mode: "strat" | "emo" }) {
    const t = fresh[i];
    const expanded = mode === "strat" ? expandedS.has(i) : expandedE.has(i);
    const toggle = () => {
      if (mode === "strat") setExpandedS((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
      else setExpandedE((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
    };
    const st = strat[i] ?? defaultStrat();
    const em = emo[i]   ?? defaultEmo();
    const stt = db.strategies.find((s) => s.id === st.sid);
    const badge = mode === "strat"
      ? [stt ? stt.name + (st.grade ? " " + st.grade : "") : "", st.r ? (parseFloat(st.r) >= 0 ? "+" : "") + st.r + "R" : ""].filter(Boolean).join(" · ")
      : (() => { const tg = em.feelings.length + em.actions.length + em.execution.length; const bits = [tg ? tg + " tag" + (tg > 1 ? "s" : "") : "", em.disc ? "disc " + em.disc : ""].filter(Boolean); return bits.join(" · "); })();

    return (
      <div style={{ border: "1px solid var(--line)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
        <div onClick={toggle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", background: "var(--panel2)" }}>
          <span style={{ color: "var(--mut)" }}>{expanded ? "▾" : "▸"}</span>
          <span style={{ fontSize: 12.5 }} dangerouslySetInnerHTML={{ __html: impSummary(t) }} />
          {badge && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--green)" }}>✓ {badge}</span>}
        </div>
        {expanded && (mode === "strat" ? <StratPanel i={i} /> : <EmoPanel i={i} />)}
      </div>
    );
  }

  /* ── Review step ── */
  function ReviewStep() {
    const am = acctMap(db);
    const tickedNames = [...tickedAccts].map((id) => am[id]?.name ?? "?");
    return (
      <div>
        <div className="rev-block">
          <div className="rb-head">
            <h4>Accounts ({tickedAccts.size})</h4>
            <span className="rev-edit" onClick={() => setStep(0)}>edit</span>
          </div>
          <div style={{ fontSize: 13 }}>
            {tickedNames.length ? tickedNames.join(" · ") : <span style={{ color: "var(--red)" }}>none ticked</span>}
          </div>
        </div>
        <div className="rev-block">
          <div className="rb-head">
            <h4>{fresh.length} trade{fresh.length !== 1 ? "s" : ""}</h4>
            <div style={{ display: "flex", gap: 10 }}>
              <span className="rev-edit" onClick={() => setStep(1)}>strategy</span>
              <span className="rev-edit" onClick={() => setStep(2)}>emotion</span>
            </div>
          </div>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--mut)" }}>
                  {["Date","Sym","Dir","Net","Strategy","Grade","R","Tags"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", position: "sticky", top: 0, background: "var(--panel)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fresh.map((t, i) => {
                  const st2 = strat[i] ?? defaultStrat();
                  const em2 = emo[i]   ?? defaultEmo();
                  const stt2 = db.strategies.find((s) => s.id === st2.sid);
                  const tg = em2.feelings.length + em2.actions.length + em2.execution.length;
                  return (
                    <tr key={i}>
                      <td style={{ padding: "6px 10px", color: "var(--mut)" }}>{(t.entryTime || "").slice(0, 10)}</td>
                      <td style={{ padding: "6px 10px" }}>{t.symbol}</td>
                      <td style={{ padding: "6px 10px", color: t.direction === "Long" ? "var(--green)" : "var(--red)" }}>{t.direction}</td>
                      <td style={{ padding: "6px 10px", color: (t.netPnL ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(t.netPnL ?? 0)}</td>
                      <td style={{ padding: "6px 10px" }}>{stt2 ? stt2.name : "—"}</td>
                      <td style={{ padding: "6px 10px", fontWeight: 700 }}>{st2.grade || "—"}</td>
                      <td style={{ padding: "6px 10px" }}>{st2.r ? (parseFloat(st2.r) >= 0 ? "+" : "") + st2.r + "R" : "—"}</td>
                      <td style={{ padding: "6px 10px", color: "var(--mut)" }}>{tg || "—"}</td>
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

  /* ── Import ── */
  function doImport() {
    if (!parsed) return;
    const targetIds = [...tickedAccts];
    if (!targetIds.length) { alert("Tick at least one account to import these trades into."); setStep(0); return; }
    const existing = new Set(db.trades.map((t) => t.importKey).filter(Boolean));
    const am = acctMap(db);
    let added = 0;
    const newTrades = [...db.trades];
    fresh.forEach((tr, i) => {
      const key = importKey(tr, parsed.platform);
      if (existing.has(key)) return;
      const inst = rootToInst(tr.symbol);
      const date = (tr.entryTime || "").slice(0, 10);
      if (!date) return;
      const st2 = strat[i] ?? defaultStrat();
      const em2 = emo[i]   ?? defaultEmo();
      const stt2 = db.strategies.find((s) => s.id === st2.sid);
      const legs = targetIds.map((aid) => {
        const a = am[aid];
        let rate = 0;
        if (a) {
          const isMicro = ["MNQ","MES","M2K","M6A","MBT","MGC","MCL"].includes((inst || "").toUpperCase());
          rate = isMicro ? (db.settings?.commMicro ?? 0.74) : (db.settings?.commMini ?? 2.10);
        }
        return {
          acct: aid, size: tr.size,
          entry: tr.entryPrice, sl: st2.sl ?? null, exit: tr.exitPrice,
          pnl: tr.grossPnL ?? 0, slip: 0, comm: rate, phase: null,
        };
      });
      const notesHtml = `<p><em>Imported from ${parsed.platform}</em></p>` +
        (em2.notes.trim() ? `<p>${em2.notes.trim().replace(/[<>]/g, "")}</p>` : "");
      newTrades.push({
        id: uid(), date, inst, setupId: st2.sid || "", setup: stt2 ? stt2.name : "—",
        metCrit: st2.met, grade: st2.grade || "",
        dir: tr.direction, entryTime: impHhmm(tr.entryTime), exitTime: impHhmm(tr.exitTime),
        r: st2.r || "", disc: em2.disc || "", plan: em2.plan || "Yes",
        notes: notesHtml,
        tags: { feelings: [...em2.feelings], actions: [...em2.actions], execution: [...em2.execution] },
        shots: [], legs, importKey: key, importSource: parsed.platform,
      } as any);
      existing.add(key);
      added++;
    });
    newTrades.sort((a, b) => a.date.localeCompare(b.date));
    save({ ...db, trades: newTrades });
    alert(`Imported ${added} trade${added !== 1 ? "s" : ""} across ${targetIds.length} account${targetIds.length !== 1 ? "s" : ""}.`);
    onDone?.();
  }

  /* ── Nav ── */
  function canAdvance(): boolean {
    if (step === 0) {
      if (!fresh.length) return false;
      if (!tickedAccts.size) return false;
    }
    return true;
  }

  function advance() {
    if (step === 0 && !fresh.length) { alert("Upload a file with at least one new trade first."); return; }
    if (step === 0 && !tickedAccts.size) { alert("Tick at least one account for this import."); return; }
    setStep((s) => Math.min(3, s + 1));
  }

  const active = db.accounts.filter((a) => a.status !== "blown");

  return (
    <div className="panel">
      {/* Wizard head */}
      <div className="wiz-head">
        <h3 style={{ margin: 0 }}>Import trades from CSV</h3>
        <div className="wiz-steps">
          {IMP_LABELS.map((lbl, i) => (
            <span key={i} className={`ws${i === step ? " active" : i < step ? " done" : ""}`}>
              {i + 1}. {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* STEP 0: upload */}
      {step === 0 && (
        <div>
          <p style={{ color: "var(--mut)", fontSize: 13, margin: "4px 0 16px" }}>
            Pick your platform and drop the export file, then choose which accounts these trades apply to.
            Strategy and psychology come next — one trade at a time, just like manual entry. Commissions are applied automatically from your global Settings rates.
          </p>

          <div className="form-grid" style={{ gridTemplateColumns: "1fr", maxWidth: 380 }}>
            <div className="fld">
              <label>Platform</label>
              <select value={platform} onChange={(e) => impGate(e.target.value)}>
                <option value="">— Select platform —</option>
                {SUPPORTED.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}  ({p.ext})</option>
                ))}
                <option value="__other__">My platform isn't listed…</option>
              </select>
            </div>
          </div>

          {platform === "__other__" && (
            <div style={{ marginTop: 14, maxWidth: 780, background: "#1a1410", border: "1px solid #3a2e1a", borderRadius: 10, padding: "12px 14px", color: "var(--gold)", fontSize: 13 }}>
              <b style={{ color: "var(--txt)" }}>That platform isn't supported yet.</b> Send the export file to get it added — once the format is mapped, imports will work here.
            </div>
          )}

          {platform && platform !== "__other__" && (
            <label
              ref={dropRef}
              style={{
                display: "block", marginTop: 16, maxWidth: 780,
                border: `1.5px dashed ${hot ? "var(--green)" : "var(--line)"}`,
                borderRadius: 12, padding: 30, textAlign: "center",
                color: "var(--mut)", cursor: "pointer", background: "var(--panel2)", transition: ".15s",
              }}
              onDragOver={(e) => { e.preventDefault(); setHot(true); }}
              onDragLeave={() => setHot(false)}
              onDrop={(e) => { e.preventDefault(); setHot(false); handleFiles(e.dataTransfer.files); }}
            >
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" style={{ display: "none" }}
                onChange={(e) => handleFiles(e.target.files)} />
              <span>
                Drop your <b style={{ color: "var(--gold)" }}>
                  {SUPPORTED.find((p) => p.id === platform)?.label}
                </b> export here or click to browse
              </span>
              {!preview && <div style={{ marginTop: 8, fontSize: 12, color: "var(--dim)" }}>
                {SUPPORTED.find((p) => p.id === platform)?.ext} file
              </div>}
            </label>
          )}

          {preview && <div style={{ marginTop: 18, maxWidth: 980 }}>{preview}</div>}

          {showAccts && (
            <div style={{ marginTop: 18, maxWidth: 980 }}>
              <h3 style={{ marginTop: 24, fontSize: 13 }}>Accounts in this import</h3>
              {!active.length
                ? <p style={{ color: "var(--mut)", fontSize: 12, marginBottom: 12 }}>No accounts yet — add them in the Accounts tab first.</p>
                : <p style={{ color: "var(--mut)", fontSize: 12, marginBottom: 12 }}>Tick every account these trades should be logged to.</p>
              }
              {active.length > 0 && (
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12, padding: 12, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8 }}>
                    <button className="btn sm" onClick={() => checkAll(true)}>☑ Check all</button>
                    <button className="btn sm" onClick={() => checkAll(false)}>☐ Uncheck all</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {active.map((a) => (
                      <label key={a.id} className="leg-chip">
                        <input type="checkbox" checked={tickedAccts.has(a.id)} onChange={() => toggleAcct(a.id)}
                          style={{ width: 18, height: 18, accentColor: "var(--green)" }} />
                        <span>{a.name}</span>
                        <span style={{ color: "var(--mut)", fontSize: 11, marginLeft: "auto", textTransform: "capitalize" }}>{a.type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STEP 1: strategy */}
      {step === 1 && (
        <div>
          <p style={{ color: "var(--mut)", fontSize: 13, margin: "4px 0 12px" }}>
            Click a trade to set its stop-loss (for R-multiple), strategy and grade. Each trade is independent — anything left blank imports like a blank manual trade.
          </p>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={() => setExpandedS(new Set(fresh.map((_, i) => i)))}>▾ Expand all</button>
            <button className="btn sm" onClick={() => setExpandedS(new Set())}>▸ Collapse all</button>
            <button className="btn sm" onClick={() => {
              const src = strat[0] ?? defaultStrat();
              setStrat((prev) => {
                const next = { ...prev };
                fresh.forEach((_, i) => { if (i > 0) next[i] = { ...src, met: [...src.met] }; });
                return next;
              });
              alert(`Copied trade #1's strategy & grade to all ${fresh.length} trades. Stop-loss stays per-trade.`);
            }} title="Copy trade #1's strategy & grade onto every trade">⎘ Copy trade #1 → all</button>
          </div>
          <div style={{ maxWidth: 980 }}>
            {fresh.map((_, i) => <TradeCard key={i} i={i} mode="strat" />)}
          </div>
        </div>
      )}

      {/* STEP 2: emotion */}
      {step === 2 && (
        <div>
          <p style={{ color: "var(--mut)", fontSize: 13, margin: "4px 0 12px" }}>
            Click a trade to tag the state that was true: feelings, actions, execution, discipline, plan and notes.
          </p>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={() => setExpandedE(new Set(fresh.map((_, i) => i)))}>▾ Expand all</button>
            <button className="btn sm" onClick={() => setExpandedE(new Set())}>▸ Collapse all</button>
            <button className="btn sm" onClick={() => {
              const src = emo[0] ?? defaultEmo();
              setEmo((prev) => {
                const next = { ...prev };
                fresh.forEach((_, i) => { if (i > 0) next[i] = { ...src, feelings: [...src.feelings], actions: [...src.actions], execution: [...src.execution] }; });
                return next;
              });
              alert(`Copied trade #1's psychology to all ${fresh.length} trades.`);
            }}>⎘ Copy trade #1 → all</button>
          </div>
          <div style={{ maxWidth: 980 }}>
            {fresh.map((_, i) => <TradeCard key={i} i={i} mode="emo" />)}
          </div>
        </div>
      )}

      {/* STEP 3: review */}
      {step === 3 && (
        <div>
          <p style={{ color: "var(--mut)", fontSize: 13, margin: "4px 0 14px" }}>
            Final check. Jump back to a step to edit. Nothing is saved until you import.
          </p>
          <div style={{ maxWidth: 980 }}>
            <ReviewStep />
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="wiz-nav" style={{ maxWidth: 980 }}>
        {step > 0 && <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>}
        <button className="btn" onClick={() => onDone?.()}>Cancel</button>
        <span style={{ flex: 1 }} />
        {step < 3 && <button className="btn primary" onClick={advance}>Next →</button>}
        {step === 3 && <button className="btn primary" onClick={doImport}>✓ Import</button>}
      </div>
    </div>
  );
}
