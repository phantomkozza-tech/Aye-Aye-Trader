"use client";

import { useState } from "react";
import { useDB } from "@/context/DBContext";
import { uid, fmt, legNet } from "@/lib/db";
import type { Strategy } from "@/types/journal";

const INPUT: React.CSSProperties = {
  background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8,
  color: "var(--txt)", padding: "9px 12px", fontSize: 13, width: "100%", outline: "none",
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: "var(--mut)", textTransform: "uppercase",
  letterSpacing: ".6px", fontWeight: 600, display: "block", marginBottom: 5,
};

function stratStats(name: string, trades: any[]) {
  let won = 0, lost = 0, w = 0, n = 0;
  trades.forEach((t) => {
    if (t.setup !== name) return;
    const net = (t.legs ?? []).reduce((s: number, l: any) => s + legNet(l), 0);
    n++; if (net > 0) { won += net; w++; } else if (net < 0) { lost += net; }
  });
  return { won, lost, wr: n ? Math.round(w / n * 100) : 0, w, n };
}

interface ModalState {
  open: boolean;
  editId: string | null;
  name: string;
  crits: string;   // newline-separated
  aplus: string;
  a: string;
}

const emptyModal = (): ModalState => ({
  open: false, editId: null, name: "", crits: "", aplus: "", a: "",
});

export default function StrategiesView() {
  const { db, save } = useDB();
  const [modal, setModal] = useState<ModalState>(emptyModal());

  const set = (patch: Partial<ModalState>) => setModal((p) => ({ ...p, ...patch }));

  const openAdd = () => setModal({ ...emptyModal(), open: true });

  const openEdit = (s: Strategy) => {
    setModal({
      open: true, editId: s.id, name: s.name,
      crits: s.criteria.join("\n"),
      aplus: String(s.thresholds.aplus),
      a: String(s.thresholds.a),
    });
  };

  const closeModal = () => setModal(emptyModal());

  const saveStrat = () => {
    const name = modal.name.trim();
    if (!name) { alert("Name the strategy"); return; }
    const criteria = modal.crits.split("\n").map((s) => s.trim()).filter(Boolean);
    if (criteria.length < 2) { alert("Add at least 2 criteria"); return; }

    let aplus = parseInt(modal.aplus) || Math.ceil(criteria.length * 0.85);
    let a = parseInt(modal.a) || Math.ceil(criteria.length * 0.55);
    aplus = Math.min(aplus, criteria.length);
    a = Math.min(a, aplus);

    const id = modal.editId ?? uid();
    const prev = db.strategies.find((x) => x.id === id);
    const s: Strategy = {
      id, name, criteria, thresholds: { aplus, a },
      surveys: prev?.surveys, masteryOverride: prev?.masteryOverride,
    };

    const next = { ...db };
    const ix = next.strategies.findIndex((x) => x.id === id);
    if (ix >= 0) next.strategies = next.strategies.map((x) => x.id === id ? s : x);
    else next.strategies = [...next.strategies, s];

    save(next);
    closeModal();
  };

  const delStrat = (id: string) => {
    if (!confirm("Delete this strategy? Past trades keep their recorded grade.")) return;
    const next = { ...db, strategies: db.strategies.filter((s) => s.id !== id) };
    save(next);
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 20px" }}>Your Strategies</h3>

      {db.strategies.length === 0 ? (
        <div className="empty-state">
          <div className="big">▤</div>
          No strategies yet. Tap the + button to add one.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {db.strategies.map((s) => {
            const st = stratStats(s.name, db.trades);
            return (
              <div key={s.id} onClick={() => openEdit(s)} style={{
                background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14,
                padding: "18px 20px", cursor: "pointer", transition: ".12s",
              }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--green)"}
                onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--line)"}
              >
                {/* Name row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{s.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--panel2)",
                      border: "1px solid var(--line)", color: "var(--mut)", fontWeight: 600 }}>
                      {s.criteria.length} criteria
                    </span>
                    <span style={{ fontSize: 13, color: "var(--red)", cursor: "pointer", padding: "2px 6px" }}
                      onClick={(e) => { e.stopPropagation(); delStrat(s.id); }}>✕</span>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>Won</div>
                    <div className="pos" style={{ fontSize: 15, fontWeight: 800 }}>{fmt(st.won)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>Lost</div>
                    <div className="neg" style={{ fontSize: 15, fontWeight: 800 }}>{fmt(st.lost)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>Win Rate</div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      {st.wr}%
                      <span style={{ fontSize: 11, color: "var(--mut)", fontWeight: 400, marginLeft: 4 }}>
                        {st.w}W/{st.n - st.w}L
                      </span>
                    </div>
                  </div>
                </div>

                {/* Thresholds */}
                <div style={{ fontSize: 11, color: "var(--mut)", borderTop: "1px solid var(--panel2)", paddingTop: 10 }}>
                  <span style={{ color: "var(--aplus)", fontWeight: 700 }}>A+</span> ≥ {s.thresholds.aplus} ·{" "}
                  <span style={{ color: "var(--a)", fontWeight: 700 }}>A</span> ≥ {s.thresholds.a} ·{" "}
                  <span style={{ color: "var(--b)", fontWeight: 700 }}>B</span> below · tap to edit
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB — fixed bottom right */}
      <button onClick={openAdd} title="Add strategy" style={{
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

      {/* Modal */}
      {modal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16,
            padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                {modal.editId ? "Edit Strategy" : "Add Strategy"}
              </h3>
              <span style={{ cursor: "pointer", fontSize: 18, color: "var(--mut)" }} onClick={closeModal}>✕</span>
            </div>

            <p style={{ color: "var(--mut)", fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
              Define your setup and the confluence criteria that grade it. When logging a trade, tick which criteria were met and the journal grades it A+/A/B automatically.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Strategy name</label>
              <input value={modal.name} onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. My Opening Range Breakout" style={INPUT} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={LABEL}>Grading criteria (one per line)</label>
              <textarea value={modal.crits} onChange={(e) => set({ crits: e.target.value })}
                placeholder="One criterion per line" rows={7}
                style={{ ...INPUT, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }}>
              <div style={{ minWidth: 160 }}>
                <label style={LABEL}>A+ needs at least</label>
                <input type="number" value={modal.aplus} onChange={(e) => set({ aplus: e.target.value })}
                  placeholder="6" style={{ ...INPUT, width: 160 }} />
              </div>
              <div style={{ minWidth: 160 }}>
                <label style={LABEL}>A needs at least</label>
                <input type="number" value={modal.a} onChange={(e) => set({ a: e.target.value })}
                  placeholder="4" style={{ ...INPUT, width: 160 }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--mut)", maxWidth: 200, lineHeight: 1.5 }}>
                criteria met. Below the A threshold = B.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20,
              paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <button className="btn" onClick={closeModal}>Cancel</button>
              <button className="btn" style={{ background: "var(--green)", color: "#04140b", border: "none", fontWeight: 700 }}
                onClick={saveStrat}>Save Strategy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
