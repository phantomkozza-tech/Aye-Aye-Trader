"use client";

import { useRef, useState } from "react";
import { useDB } from "@/context/DBContext";
import { uid, defaultStrategies } from "@/lib/db";
import EmojiPicker from "@/components/settings/EmojiPicker";
import type { Broker } from "@/types/journal";

const INPUT: React.CSSProperties = {
  background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8,
  color: "var(--txt)", padding: "9px 12px", fontSize: 13, outline: "none",
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: "var(--mut)", textTransform: "uppercase",
  letterSpacing: ".6px", fontWeight: 600, display: "block", marginBottom: 5,
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mut)", textTransform: "uppercase",
      letterSpacing: "1px", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
      {children}
    </div>
  );
}

function SetCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 12,
      padding: "18px 20px", marginBottom: 14 }}>
      {children}
    </div>
  );
}

interface SettingsProps {
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

export default function SettingsView({ theme = "dark", onToggleTheme }: SettingsProps) {
  const { db, save } = useDB();
  const s = db.settings;
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Backup: export the whole journal to a JSON file (1:1 with V1 doExport)
  const doExport = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ayeaye_journal_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Restore: replace the journal from a JSON file (1:1 with V1 doImport)
  const doImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d: any = JSON.parse(String(r.result));
        if (d && d.accounts && d.trades) {
          if (confirm(`Import ${d.trades.length} trades & ${d.accounts.length} accounts? Replaces current data.`)) {
            if (!d.groups) d.groups = [];
            if (!d.strategies) d.strategies = defaultStrategies();
            if (!d.notes) d.notes = [];
            (d.accounts as any[]).forEach((a) => { if (!a.status) a.status = "active"; if (!a.ddtype) a.ddtype = "static"; if (!a.phases) a.phases = []; });
            save(d);
          }
        } else if (Array.isArray(d)) {
          if (confirm(`Old-format file (${d.length} trades). Import into one default account?`)) {
            save({
              accounts: [{ id: "legacy", name: "Imported", type: "personal", firm: "", broker: "", bal: 0, target: 0, dd: 0, ddtype: "static", cost: 0, copy: "no", comm: 0, dll: 0, pdll: 0, status: "active", phases: [] } as any],
              trades: (d as any[]).map((t) => ({ ...t, legs: [{ acct: "legacy", pnl: t.pnl || 0 }] })),
              groups: [], strategies: defaultStrategies(), settings: db.settings, notes: [], templates: db.templates ?? [],
            } as any);
          }
        } else {
          alert("Unrecognized file");
        }
      } catch {
        alert("Invalid file");
      }
    };
    r.readAsText(f);
    e.target.value = "";
  };

  // Local state mirrors settings fields
  const [commMini, setCommMini]   = useState(String(s.commMini ?? 2.10));
  const [commMicro, setCommMicro] = useState(String(s.commMicro ?? 0.74));
  const [maxLoss, setMaxLoss]     = useState(String(s.maxConsecLosses ?? 2));
  const [maxTrades, setMaxTrades] = useState(String(s.maxTradesPerDay ?? 5));
  const [rapidMins, setRapidMins] = useState(String(s.rapidMins ?? 5));
  const [onenote, setOnenote]     = useState(s.onenote ?? "");
  const [emoji, setEmoji]         = useState(s.emoji ?? "😮‍💨");
  const [saved, setSaved]         = useState(false);

  // Firms
  const [firmInput, setFirmInput] = useState("");

  // Brokers
  const [brokerInput, setBrokerInput]   = useState("");
  const [brokerTiming, setBrokerTiming] = useState<"intraday" | "eod">("intraday");

  // Per-broker instrument inputs (keyed by broker id)
  const [instInputs, setInstInputs] = useState<Record<string, { sym: string; margin: string; fee: string }>>({});

  // Journaling accts
  const [journalAccts, setJournalAccts] = useState<Set<string>>(new Set(s.journalAccts ?? []));

  const getInstInput = (brokerId: string) =>
    instInputs[brokerId] ?? { sym: "", margin: "", fee: "" };
  const setInstInput = (brokerId: string, patch: Partial<{ sym: string; margin: string; fee: string }>) =>
    setInstInputs((prev) => ({ ...prev, [brokerId]: { ...getInstInput(brokerId), ...patch } }));

  // ── Save all settings ──────────────────────────────────────
  const saveSettings = () => {
    const next = { ...db };
    next.settings = {
      ...next.settings,
      commMini: parseFloat(commMini) || 0,
      commMicro: parseFloat(commMicro) || 0,
      maxConsecLosses: Math.max(1, parseInt(maxLoss) || 2),
      maxTradesPerDay: Math.max(1, parseInt(maxTrades) || 5),
      rapidMins: Math.max(1, parseInt(rapidMins) || 5),
      onenote: onenote.trim(),
      emoji: emoji || "😮‍💨",
      journalAccts: [...journalAccts],
    };
    save(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // ── Firms ──────────────────────────────────────────────────
  const addFirm = () => {
    const name = firmInput.trim(); if (!name) return;
    if (db.settings.firms?.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      alert("That firm is already in your list."); return;
    }
    const next = { ...db };
    next.settings = { ...next.settings, firms: [...(next.settings.firms ?? []), { id: uid(), name }] };
    save(next); setFirmInput("");
  };

  const delFirm = (id: string) => {
    const n = db.accounts.filter((a) => a.firm === id).length;
    if (!confirm(`Delete this firm?${n ? ` ${n} account(s) will become unassigned.` : ""}`)) return;
    const next = { ...db };
    next.settings = { ...next.settings, firms: next.settings.firms?.filter((f) => f.id !== id) ?? [] };
    next.accounts = next.accounts.map((a) => a.firm === id ? { ...a, firm: "" } : a);
    save(next);
  };

  const renameFirm = (id: string, current: string) => {
    const name = prompt("Rename firm:", current); if (!name) return;
    const t = name.trim(); if (!t) return;
    const next = { ...db };
    next.settings = {
      ...next.settings,
      firms: next.settings.firms?.map((f) => f.id === id ? { ...f, name: t } : f) ?? [],
    };
    save(next);
  };

  // ── Brokers ────────────────────────────────────────────────
  const addBroker = () => {
    const name = brokerInput.trim(); if (!name) return;
    if (db.settings.brokers?.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      alert("That broker is already in your list."); return;
    }
    const next = { ...db };
    const newBroker: Broker & { feeTiming?: string; insts?: any[] } = {
      id: uid(), name, timing: brokerTiming, commMini: 0, commMicro: 0,
      feeTiming: brokerTiming, insts: [],
    };
    next.settings = { ...next.settings, brokers: [...(next.settings.brokers ?? []), newBroker as any] };
    save(next); setBrokerInput("");
  };

  const delBroker = (id: string) => {
    const b = db.settings.brokers?.find((x) => x.id === id); if (!b) return;
    if (!confirm(`Remove broker "${(b as any).name}" and its margins?`)) return;
    const next = { ...db };
    next.settings = { ...next.settings, brokers: next.settings.brokers?.filter((x) => x.id !== id) ?? [] };
    save(next);
  };

  const setBrokerTimingById = (id: string, val: "intraday" | "eod") => {
    const next = { ...db };
    next.settings = {
      ...next.settings,
      brokers: next.settings.brokers?.map((b) => b.id === id ? { ...b, feeTiming: val } : b) ?? [],
    };
    save(next);
  };

  const addInst = (brokerId: string) => {
    const inp = getInstInput(brokerId);
    const sym = inp.sym.trim().toUpperCase();
    const margin = parseFloat(inp.margin);
    const fee = parseFloat(inp.fee);
    if (!sym) { alert("Enter an instrument symbol (e.g. MNQ)."); return; }
    if (!(margin > 0)) { alert("Enter the margin per contract (must be > 0)."); return; }
    const next = { ...db };
    next.settings = {
      ...next.settings,
      brokers: next.settings.brokers?.map((b) => {
        if (b.id !== brokerId) return b;
        const insts = (b as any).insts ?? [];
        if (insts.some((i: any) => i.sym === sym)) { alert(`${sym} is already defined for this broker.`); return b; }
        return { ...b, insts: [...insts, { sym, margin, fee: isNaN(fee) ? 0 : fee }] };
      }) ?? [],
    };
    save(next);
    setInstInput(brokerId, { sym: "", margin: "", fee: "" });
  };

  const delInst = (brokerId: string, sym: string) => {
    const next = { ...db };
    next.settings = {
      ...next.settings,
      brokers: next.settings.brokers?.map((b) => b.id !== brokerId ? b : {
        ...b, insts: ((b as any).insts ?? []).filter((i: any) => i.sym !== sym),
      }) ?? [],
    };
    save(next);
  };

  const toggleJournalAcct = (id: string) => {
    setJournalAccts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const firms = db.settings.firms ?? [];
  const brokers = db.settings.brokers ?? [];
  const activeAccts = db.accounts.filter((a) => a.status !== "blown");

  return (
    <div style={{ padding: "20px 24px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Settings</h2>
          <p style={{ color: "var(--mut)", fontSize: 13, marginTop: 4 }}>Configure your journal. Changes apply across the app.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saved && <span style={{ fontSize: 12, color: "var(--green)" }}>✓ Saved</span>}
          <button className="btn" style={{ background: "var(--green)", color: "#04140b", border: "none", fontWeight: 700 }}
            onClick={saveSettings}>Save changes</button>
        </div>
      </div>

      {/* ── Appearance ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Appearance</SectionTitle>
        <SetCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Theme</div>
              <div style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.6 }}>
                Switch between dark and light mode. Your preference is saved automatically.
              </div>
            </div>
            <button
              className="btn"
              onClick={onToggleTheme}
              style={{ fontSize: 15, padding: "8px 16px", flexShrink: 0 }}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode"}
            </button>
          </div>
        </SetCard>
      </div>

      {/* ── Account marker ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Account marker</SectionTitle>
        <SetCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Account marker emoji</div>
              <div style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.6 }}>
                Marks your position on the path-to-passing bar on each account card. Search or pick a category.
              </div>
            </div>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </div>
        </SetCard>
      </div>

      {/* ── Backup & data ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Backup &amp; data</SectionTitle>
        <SetCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Export / import journal</div>
              <div style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.6 }}>
                Download a full JSON backup of every account, trade, strategy and note — or restore one. Importing replaces all current data.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <button className="btn" onClick={doExport}>⬇ Export</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Import</button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={doImport} />
            </div>
          </div>
        </SetCard>
      </div>

      {/* ── Trading costs ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Trading costs</SectionTitle>
        <SetCard>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Commissions</div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14, lineHeight: 1.6 }}>
              Per contract, per side. The journal applies the right rate automatically based on instrument (mini vs micro).
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <label style={LABEL}>Mini $ / side</label>
                <input type="number" step="any" value={commMini} onChange={(e) => setCommMini(e.target.value)}
                  placeholder="2.10" style={{ ...INPUT, width: 120 }} />
              </div>
              <div>
                <label style={LABEL}>Micro $ / side</label>
                <input type="number" step="any" value={commMicro} onChange={(e) => setCommMicro(e.target.value)}
                  placeholder="0.74" style={{ ...INPUT, width: 120 }} />
              </div>
            </div>
          </div>
        </SetCard>

        <SetCard>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Discipline guardrails</div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14, lineHeight: 1.6 }}>
            Your own rules. The Psychology report uses these to flag tilt — trading rapidly after hitting your loss limit.
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { label: "Stop after N losses", val: maxLoss, set: setMaxLoss, placeholder: "2", width: 100 },
              { label: "Max trades / day", val: maxTrades, set: setMaxTrades, placeholder: "5", width: 100 },
              { label: '"Rapid" = within (min)', val: rapidMins, set: setRapidMins, placeholder: "5", width: 100 },
            ].map(({ label, val, set, placeholder, width }) => (
              <div key={label}>
                <label style={LABEL}>{label}</label>
                <input type="number" step="1" min="1" value={val} onChange={(e) => set(e.target.value)}
                  placeholder={placeholder} style={{ ...INPUT, width }} />
              </div>
            ))}
          </div>
        </SetCard>
      </div>

      {/* ── Prop firms ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Prop firms</SectionTitle>
        <SetCard>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14, lineHeight: 1.6 }}>
            Add the firms you trade with. Assign accounts to a firm and the Report page breaks down spend by firm.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <input value={firmInput} onChange={(e) => setFirmInput(e.target.value)}
              placeholder="e.g. Topstep" style={{ ...INPUT, flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && addFirm()} />
            <button className="btn" style={{ background: "rgba(38,208,124,.15)", borderColor: "var(--green)", color: "var(--green)", fontWeight: 700 }}
              onClick={addFirm}>+ Add firm</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {firms.length === 0 && <div style={{ color: "var(--dim)", fontSize: 12 }}>No firms yet.</div>}
            {firms.map((f) => {
              const n = db.accounts.filter((a) => a.firm === f.id).length;
              return (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10,
                  background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 14px" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: "var(--mut)" }}>{n} account{n !== 1 ? "s" : ""}</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
                    <span style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }} onClick={() => renameFirm(f.id, f.name)}>✎</span>
                    <span style={{ fontSize: 12, color: "var(--red)", cursor: "pointer" }} onClick={() => delFirm(f.id)}>✕</span>
                  </span>
                </div>
              );
            })}
          </div>
        </SetCard>
      </div>

      {/* ── Brokers & margins ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Brokers &amp; margins</SectionTitle>
        <SetCard>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14, lineHeight: 1.6 }}>
            Add the brokers you clear through and define margin + round-trip fee per instrument. Personal accounts use these to know when a margin call hits.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={brokerInput} onChange={(e) => setBrokerInput(e.target.value)}
              placeholder="e.g. AMP Futures" style={{ ...INPUT, flex: 1, minWidth: 150 }}
              onKeyDown={(e) => e.key === "Enter" && addBroker()} />
            <select value={brokerTiming} onChange={(e) => setBrokerTiming(e.target.value as any)}
              style={{ ...INPUT, cursor: "pointer" }}>
              <option value="intraday">Fees: intraday (per trade)</option>
              <option value="eod">Fees: end-of-day (gross)</option>
            </select>
            <button className="btn" style={{ background: "rgba(38,208,124,.15)", borderColor: "var(--green)", color: "var(--green)", fontWeight: 700 }}
              onClick={addBroker}>+ Add broker</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {brokers.length === 0 && <div style={{ color: "var(--dim)", fontSize: 12 }}>No brokers yet.</div>}
            {brokers.map((b: any) => {
              const inp = getInstInput(b.id);
              return (
                <div key={b.id} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{b.name}</span>
                    <select value={b.feeTiming ?? "intraday"} onChange={(e) => setBrokerTimingById(b.id, e.target.value as any)}
                      style={{ ...INPUT, padding: "4px 8px", fontSize: 11.5, cursor: "pointer" }}>
                      <option value="intraday">fees: intraday</option>
                      <option value="eod">fees: end-of-day</option>
                    </select>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--red)", cursor: "pointer" }} onClick={() => delBroker(b.id)}>✕ remove</span>
                  </div>

                  {/* Instruments */}
                  <div style={{ marginBottom: 10 }}>
                    {(b.insts ?? []).length === 0
                      ? <div style={{ color: "var(--dim)", fontSize: 12, padding: "4px 0" }}>No instruments yet — add the ones you trade below.</div>
                      : (b.insts ?? []).map((i: any) => (
                        <div key={i.sym} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12.5,
                          padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                          <span style={{ fontWeight: 700, width: 64 }}>{i.sym}</span>
                          <span style={{ color: "var(--mut)" }}>margin <b style={{ color: "var(--txt)" }}>${i.margin?.toLocaleString()}</b></span>
                          <span style={{ color: "var(--mut)" }}>fee/RT <b style={{ color: "var(--txt)" }}>${i.fee}</b></span>
                          <span style={{ marginLeft: "auto", cursor: "pointer", color: "var(--red)", fontSize: 12 }} onClick={() => delInst(b.id, i.sym)}>✕</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* Add instrument row */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={inp.sym} onChange={(e) => setInstInput(b.id, { sym: e.target.value })}
                      placeholder="MNQ" style={{ ...INPUT, width: 78, padding: "7px 10px", textTransform: "uppercase" }} />
                    <input type="number" step="any" value={inp.margin} onChange={(e) => setInstInput(b.id, { margin: e.target.value })}
                      placeholder="margin $" style={{ ...INPUT, width: 104, padding: "7px 10px" }} />
                    <input type="number" step="any" value={inp.fee} onChange={(e) => setInstInput(b.id, { fee: e.target.value })}
                      placeholder="fee/RT $" style={{ ...INPUT, width: 104, padding: "7px 10px" }} />
                    <button className="btn sm" onClick={() => addInst(b.id)}>+ instrument</button>
                  </div>
                </div>
              );
            })}
          </div>
        </SetCard>
      </div>

      {/* ── Journaling ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Journaling</SectionTitle>
        <SetCard>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Require emotional journaling</div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14, lineHeight: 1.6 }}>
            Pick accounts where logging a trade requires the emotional-state step. Use for accounts you're actively developing — not copy-followers.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeAccts.length === 0 && <div style={{ color: "var(--dim)", fontSize: 12 }}>No active accounts yet.</div>}
            {activeAccts.map((a) => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "8px 12px", borderRadius: 8, background: journalAccts.has(a.id) ? "rgba(38,208,124,.08)" : "var(--panel)",
                border: `1px solid ${journalAccts.has(a.id) ? "rgba(38,208,124,.3)" : "var(--line)"}`, transition: ".12s" }}>
                <input type="checkbox" checked={journalAccts.has(a.id)} onChange={() => toggleJournalAcct(a.id)}
                  style={{ width: 15, height: 15, accentColor: "var(--green)", cursor: "pointer" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                <span style={{ fontSize: 11, color: "var(--mut)" }}>{a.type === "prop" ? "Prop" : "Personal"}</span>
              </label>
            ))}
          </div>
        </SetCard>
      </div>

      {/* ── Integrations ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionTitle>Integrations</SectionTitle>
        <SetCard>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>OneNote notebook link</div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 10, lineHeight: 1.6 }}>
            In OneNote: right-click the notebook or section → Copy Link. Used by the "Open my OneNote" button on the Notes page.
          </div>
          <input value={onenote} onChange={(e) => setOnenote(e.target.value)}
            placeholder="https://onedrive.live.com/..." style={{ ...INPUT, width: "100%" }} />
        </SetCard>
      </div>

      {/* Bottom save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
        <button className="btn" style={{ background: "var(--green)", color: "#04140b", border: "none", fontWeight: 700 }}
          onClick={saveSettings}>Save changes</button>
        {saved && <span style={{ fontSize: 12, color: "var(--green)" }}>✓ Saved</span>}
      </div>
    </div>
  );
}
