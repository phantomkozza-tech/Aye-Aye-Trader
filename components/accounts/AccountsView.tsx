"use client";

import { useState } from "react";
import { useDB } from "@/context/DBContext";
import { uid, fmt, today } from "@/lib/db";
import type { Account, Phase, DDType, AccountType } from "@/types/journal";

const INPUT: React.CSSProperties = {
  background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8,
  color: "var(--txt)", padding: "9px 12px", fontSize: 13, width: "100%", outline: "none",
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: "var(--mut)", textTransform: "uppercase",
  letterSpacing: ".6px", fontWeight: 600, display: "block", marginBottom: 5,
};

// ── Phase helpers ────────────────────────────────────────────
function makePhase(o: Partial<Phase> = {}): Phase {
  return Object.assign({
    id: uid(), kind: "eval" as const, label: null, startDate: today(), endDate: null,
    startBal: 0, target: 0, dd: 0, ddtype: "static" as DDType, cost: 0, outcome: "active" as const,
  }, o);
}

function acctPhases(a: Account): Phase[] {
  return a.phases?.length ? a.phases : [];
}

function activePhase(a: Account): Phase | null {
  const ps = acctPhases(a);
  return ps.find((p) => p.outcome === "active") ?? ps[ps.length - 1] ?? null;
}

function evalStep(a: Account, p: Phase): number {
  const ps = acctPhases(a); let step = 1;
  for (const x of ps) {
    if (x.id === p.id) return step;
    if (x.kind === "eval" && x.outcome === "passed") step++;
  }
  return step;
}

function evalMaxStep(a: Account): number {
  const ps = acctPhases(a); let step = 1, max = 1;
  for (const x of ps) {
    if (x.kind !== "eval") continue;
    if (step > max) max = step;
    if (x.outcome === "passed") step++;
  }
  return max;
}

function phaseKindLabel(a: Account, p: Phase): string {
  if (p.kind === "eval") return evalMaxStep(a) > 1 ? `Evaluation Phase ${evalStep(a, p)}` : "Evaluation";
  if (p.kind === "funded") return "Funded";
  if (p.kind === "live") return "Live";
  return "Phase";
}

function syncTopFromActive(a: Account): void {
  const p = activePhase(a); if (!p) return;
  a.bal = p.startBal; a.target = p.target; a.dd = p.dd; a.ddtype = p.ddtype;
  const pc = acctPhases(a).reduce((s, ph) => s + (ph.cost ?? 0), 0);
  const rc = (a.resets ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  a.cost = pc + rc;
}

function acctPnl(a: Account, trades: any[]): number {
  const ap = activePhase(a);
  let s = 0;
  trades.forEach((t) => (t.legs ?? []).forEach((l: any) => {
    if (l.acct !== a.id) return;
    if (ap && l.phase && l.phase !== ap.id) return;
    s += (l.pnl ?? 0) - ((l.comm ?? 0) * (l.size ?? 0) * 2);
  }));
  return s;
}

function acctWinRate(a: Account, trades: any[]): { wr: number; w: number; n: number } {
  let w = 0, n = 0;
  trades.forEach((t) => {
    const legs = (t.legs ?? []).filter((l: any) => l.acct === a.id);
    if (!legs.length) return;
    const net = legs.reduce((s: number, l: any) => s + (l.pnl ?? 0) - ((l.comm ?? 0) * (l.size ?? 0) * 2), 0);
    n++; if (net > 0) w++;
  });
  return { wr: n ? Math.round(w / n * 100) : 0, w, n };
}

// ── Path bar ─────────────────────────────────────────────────
function PathBar({ a, pnl }: { a: Account; pnl: number }) {
  const { db } = useDB();
  if (!a.dd && !a.target) return null;
  const lo = -(a.dd ?? 0), hi = a.target ?? 0;
  if (hi <= lo) return null;
  let pct = (pnl - lo) / (hi - lo) * 100;
  pct = Math.max(2, Math.min(98, pct));
  const marker = db.settings?.emoji || "😮‍💨";
  return (
    <div style={{ margin: "12px 0 8px" }}>
      <div style={{ height: 6, background: "var(--panel)", borderRadius: 99, position: "relative", overflow: "visible" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`,
          background: "linear-gradient(90deg, var(--red), var(--green))", borderRadius: 99 }} />
        <div style={{ position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%,-50%)",
          fontSize: 14, lineHeight: 1, filter: "drop-shadow(0 1px 2px rgba(0,0,0,.6))" }}>
          {marker}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10 }}>
        <span style={{ color: "var(--red)" }}>Blown</span>
        <span style={{ color: "var(--green)" }}>Passing</span>
      </div>
    </div>
  );
}

// ── Account card ─────────────────────────────────────────────
function AccountCard({ a, onEdit, onDelete, onBlow, onOpen }: {
  a: Account; onEdit: () => void; onDelete: () => void; onBlow: () => void; onOpen: () => void;
}) {
  const { db } = useDB();
  const ap = activePhase(a);
  const pnl = acctPnl(a, db.trades);
  const { wr, w, n } = acctWinRate(a, db.trades);
  const firms = db.settings.firms ?? [];
  const firmLabel = a.firm ? (firms.find((f) => f.id === a.firm)?.name ?? a.type) : a.type;
  const totalCost = acctPhases(a).reduce((s, p) => s + (p.cost ?? 0), 0) + (a.resets ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div onClick={onOpen} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 0, cursor: "pointer", transition: ".12s" }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
      onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--line)")}>
      {/* Name row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{a.name}</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--panel2)",
          border: "1px solid var(--line)", color: "var(--mut)", fontWeight: 600, textTransform: "uppercase",
          letterSpacing: ".5px" }}>{firmLabel}</span>
        {a.type === "prop" && ap && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
            background: ap.kind === "eval" ? "rgba(59,130,196,.15)" : ap.kind === "funded" ? "rgba(38,208,124,.15)" : "rgba(212,169,72,.15)",
            color: ap.kind === "eval" ? "var(--blue)" : ap.kind === "funded" ? "var(--green)" : "var(--gold)",
            border: `1px solid ${ap.kind === "eval" ? "rgba(59,130,196,.3)" : ap.kind === "funded" ? "rgba(38,208,124,.3)" : "rgba(212,169,72,.3)"}` }}>
            {phaseKindLabel(a, ap)}
          </span>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 6 }}>
        {[
          { label: a.type === "prop" ? "Net P&L (phase)" : "Net P&L", val: fmt(pnl), cls: pnl >= 0 ? "pos" : "neg" },
          { label: "Win Rate", val: `${wr}%`, sub: `${w}W/${n - w}L` },
          { label: "Spent", val: totalCost ? fmt(totalCost) : "—", gold: true },
          { label: "Trades", val: String(n) },
        ].map((stat) => (
          <div key={stat.label}>
            <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>{stat.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: stat.gold ? "var(--gold)" : "inherit" }}
              className={stat.cls}>{stat.val}</div>
            {stat.sub && <div style={{ fontSize: 10, color: "var(--mut)" }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      <PathBar a={a} pnl={pnl} />

      {/* Actions */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 14, marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        <span style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }} onClick={onEdit}>✎ edit</span>
        <span style={{ fontSize: 12, color: "var(--mut)", cursor: "pointer" }} onClick={onDelete}>✕ delete</span>
        <span style={{ fontSize: 12, color: "var(--red)", cursor: "pointer" }} onClick={onBlow}>✖ mark blown</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--mut)", cursor: "pointer" }} onClick={onOpen}>dashboard →</span>
      </div>
    </div>
  );
}

// ── Add/Edit modal ───────────────────────────────────────────
interface ModalState {
  open: boolean;
  editId: string | null;
  name: string;
  type: AccountType;
  startAs: "eval" | "funded";
  firm: string;
  broker: string;
  bal: string;
  target: string;
  dd: string;
  ddtype: DDType;
  cost: string;
  copy: "yes" | "no";
  dll: string;
  pdll: string;
}

const emptyModal = (): ModalState => ({
  open: false, editId: null, name: "", type: "prop", startAs: "eval",
  firm: "", broker: "", bal: "", target: "", dd: "", ddtype: "static",
  cost: "", copy: "yes", dll: "", pdll: "",
});

export default function AccountsView({ onOpenAcct }: { onOpenAcct?: (id: string) => void }) {
  const { db, save } = useDB();
  const [modal, setModal] = useState<ModalState>(emptyModal());

  const openAdd = () => setModal({ ...emptyModal(), open: true });
  const openEdit = (a: Account) => {
    if (a.status === "blown") { alert("This account is blown and locked — it cannot be edited."); return; }
    const ap = activePhase(a);
    setModal({
      open: true, editId: a.id, name: a.name, type: a.type, startAs: "eval",
      firm: a.firm ?? "", broker: a.broker ?? "",
      bal: String(ap?.startBal ?? a.bal ?? ""),
      target: String(ap?.target ?? a.target ?? ""),
      dd: String(ap?.dd ?? a.dd ?? ""),
      ddtype: (ap?.ddtype ?? a.ddtype ?? "static") as DDType,
      cost: String(ap?.cost ?? ""),
      copy: a.copy ?? "yes",
      dll: String(a.dll ?? ""),
      pdll: String(a.pdll ?? ""),
    });
  };
  const closeModal = () => setModal(emptyModal());
  const set = (patch: Partial<ModalState>) => setModal((p) => ({ ...p, ...patch }));

  const saveAcct = () => {
    const name = modal.name.trim();
    if (!name) { alert("Name the account"); return; }
    const next = { ...db };
    const fields = {
      type: modal.type, firm: modal.firm, broker: modal.broker,
      bal: parseFloat(modal.bal) || 0, target: parseFloat(modal.target) || 0,
      dd: parseFloat(modal.dd) || 0, ddtype: modal.ddtype,
      cost: parseFloat(modal.cost) || 0, copy: modal.copy,
      dll: parseFloat(modal.dll) || 0, pdll: parseFloat(modal.pdll) || 0,
    };

    if (modal.editId) {
      next.accounts = next.accounts.map((a) => {
        if (a.id !== modal.editId) return a;
        const updated = { ...a, name, ...fields };
        const p = activePhase(updated);
        if (p) {
          p.startBal = fields.bal; p.target = fields.target;
          p.dd = fields.dd; p.ddtype = fields.ddtype; p.cost = fields.cost;
        }
        syncTopFromActive(updated);
        return updated;
      });
    } else {
      const startKind = modal.type === "prop" ? modal.startAs : "funded";
      const a: Account = {
        id: uid(), name, status: "active",
        ...fields,
        comm: 0,
        phases: [makePhase({
          kind: startKind, startBal: fields.bal, target: fields.target,
          dd: fields.dd, ddtype: fields.ddtype, cost: fields.cost,
          startDate: today(), outcome: "active",
        })],
      };
      next.accounts = [...next.accounts, a];
    }
    save(next);
    closeModal();
  };

  const deleteAcct = (id: string) => {
    const a = db.accounts.find((x) => x.id === id);
    if (a?.status === "blown") { alert("Blown accounts are locked and kept for your records."); return; }
    if (!confirm("Delete this account? Its legs stay on past trades.")) return;
    const next = { ...db, accounts: db.accounts.filter((x) => x.id !== id) };
    save(next);
  };

  const blowAcct = (id: string) => {
    const a = db.accounts.find((x) => x.id === id);
    if (!a || a.status === "blown") return;
    if (!confirm(`Mark "${a.name}" as BLOWN?\n\nThis is permanent: locked, removed from new trades, kept for records.\n\nProceed?`)) return;
    const next = { ...db };
    next.accounts = next.accounts.map((x) => {
      if (x.id !== id) return x;
      const updated = { ...x, status: "blown" as const, blownDate: today() };
      const p = activePhase(updated);
      if (p) { p.outcome = "blown"; p.endDate = today(); }
      return updated;
    });
    save(next);
  };

  const active = db.accounts.filter((a) => a.status !== "blown");
  const firms = db.settings.firms ?? [];
  const brokers = db.settings.brokers ?? [];
  const isProp = modal.type === "prop";

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Your Accounts</h3>
      </div>

      {/* Fixed FAB — bottom right, matches V1 */}
      <button onClick={openAdd} title="Add account" style={{
        position: "fixed", right: 32, bottom: 32, width: 58, height: 58,
        borderRadius: "50%", background: "var(--green)", color: "#04140b",
        fontSize: 30, fontWeight: 700, border: "none", cursor: "pointer",
        boxShadow: "0 6px 22px rgba(38,208,124,.45)", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        lineHeight: 1, transition: ".15s",
      }}
        onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)"; }}
        onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
      >+</button>

      {active.length === 0 ? (
        <div className="empty-state">
          <div className="big">▤</div>
          No active accounts yet. Hit + to add one.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {active.map((a) => (
            <AccountCard key={a.id} a={a}
              onEdit={() => openEdit(a)}
              onDelete={() => deleteAcct(a.id)}
              onBlow={() => blowAcct(a.id)}
              onOpen={() => onOpenAcct?.(a.id)} />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {modal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16,
            padding: 24, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{modal.editId ? "Edit Account" : "Add Account"}</h3>
              <span style={{ cursor: "pointer", fontSize: 18, color: "var(--mut)" }} onClick={closeModal}>✕</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Name */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LABEL}>Account name</label>
                <input value={modal.name} onChange={(e) => set({ name: e.target.value })}
                  placeholder="e.g. Topstep 50K #1" style={INPUT} />
              </div>

              {/* Type */}
              <div>
                <label style={LABEL}>Type</label>
                <select value={modal.type} onChange={(e) => set({ type: e.target.value as AccountType })} style={{ ...INPUT, cursor: "pointer" }}>
                  <option value="prop">Prop (futures)</option>
                  <option value="personal">Personal (futures)</option>
                </select>
              </div>

              {/* Start as - prop only, add mode */}
              {isProp && !modal.editId && (
                <div>
                  <label style={LABEL}>Start as</label>
                  <select value={modal.startAs} onChange={(e) => set({ startAs: e.target.value as any })} style={{ ...INPUT, cursor: "pointer" }}>
                    <option value="eval">Eval (1- or 2-step)</option>
                    <option value="funded">Straight to Funded</option>
                  </select>
                </div>
              )}

              {/* Prop firm - prop only */}
              {isProp && (
                <div>
                  <label style={LABEL}>Prop firm</label>
                  <select value={modal.firm} onChange={(e) => set({ firm: e.target.value })} style={{ ...INPUT, cursor: "pointer" }}>
                    <option value="">— none / unassigned —</option>
                    {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}

              {/* Broker */}
              <div>
                <label style={LABEL}>Broker <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(margins &amp; fees)</span></label>
                <select value={modal.broker} onChange={(e) => set({ broker: e.target.value })} style={{ ...INPUT, cursor: "pointer" }}>
                  <option value="">— none —</option>
                  {(brokers as any[]).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {/* Balance */}
              <div>
                <label style={LABEL}>Starting balance $</label>
                <input type="number" value={modal.bal} onChange={(e) => set({ bal: e.target.value })} placeholder="50000" style={INPUT} />
              </div>

              {/* Prop-only fields */}
              {isProp && (
                <>
                  <div>
                    <label style={LABEL}>Profit target $</label>
                    <input type="number" value={modal.target} onChange={(e) => set({ target: e.target.value })} placeholder="3000" style={INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>Max drawdown $</label>
                    <input type="number" value={modal.dd} onChange={(e) => set({ dd: e.target.value })} placeholder="2000" style={INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>Drawdown type</label>
                    <select value={modal.ddtype} onChange={(e) => set({ ddtype: e.target.value as DDType })} style={{ ...INPUT, cursor: "pointer" }}>
                      <option value="static">Static (from start)</option>
                      <option value="eod">EOD trailing</option>
                      <option value="intraday">Intraday trailing</option>
                    </select>
                  </div>
                  <div>
                    <label style={LABEL}>Account cost $ (eval fee)</label>
                    <input type="number" step="any" value={modal.cost} onChange={(e) => set({ cost: e.target.value })} placeholder="e.g. 165" style={INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>Prop daily loss limit $</label>
                    <input type="number" step="any" value={modal.pdll} onChange={(e) => set({ pdll: e.target.value })} placeholder="e.g. 1000" style={INPUT} />
                  </div>
                </>
              )}

              {/* Copy group */}
              <div>
                <label style={LABEL}>Copy-trade group?</label>
                <select value={modal.copy} onChange={(e) => set({ copy: e.target.value as any })} style={{ ...INPUT, cursor: "pointer" }}>
                  <option value="yes">Yes — part of copy group</option>
                  <option value="no">No — standalone</option>
                </select>
              </div>

              {/* Personal daily loss limit */}
              <div>
                <label style={LABEL}>My daily loss limit $ <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(self-imposed)</span></label>
                <input type="number" step="any" value={modal.dll} onChange={(e) => set({ dll: e.target.value })} placeholder="e.g. 500" style={INPUT} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <button className="btn" onClick={closeModal}>Cancel</button>
              <button className="btn" style={{ background: "var(--green)", color: "#04140b", border: "none", fontWeight: 700 }}
                onClick={saveAcct}>{modal.editId ? "Save changes" : "Save Account"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
