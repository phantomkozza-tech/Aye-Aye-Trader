"use client";

import { useState } from "react";
import { useDB } from "@/context/DBContext";
import { uid } from "@/lib/db";

interface Note {
  id: string;
  date: string;
  title?: string;
  link?: string;
  summary?: string;
}

export default function NotesView() {
  const { db, save } = useDB();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // form state
  const [fDate, setFDate] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fLink, setFLink] = useState("");
  const [fSummary, setFSummary] = useState("");

  const notes: Note[] = db.notes ?? [];
  const onenote = db.settings?.onenote ?? "";

  function openAdd() {
    setEditId(null);
    setFDate(new Date().toISOString().slice(0, 10));
    setFTitle(""); setFLink(""); setFSummary("");
    setModalOpen(true);
  }

  function openEdit(n: Note) {
    setEditId(n.id);
    setFDate(n.date);
    setFTitle(n.title ?? "");
    setFLink(n.link ?? "");
    setFSummary(n.summary ?? "");
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); }

  function saveNote() {
    if (!fDate) { alert("Pick a date"); return; }
    const note: Note = {
      id: editId ?? uid(),
      date: fDate,
      title: fTitle.trim(),
      link: fLink.trim(),
      summary: fSummary.trim(),
    };
    const notes: Note[] = [...(db.notes ?? [])];
    const ix = notes.findIndex((x) => x.id === note.id);
    if (ix >= 0) notes[ix] = note; else notes.push(note);
    save({ ...db, notes });
    closeModal();
  }

  function delNote(id: string) {
    if (!confirm("Delete this planning day?")) return;
    save({ ...db, notes: (db.notes ?? []).filter((n: Note) => n.id !== id) });
  }

  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      {/* Section head */}
      <div className="acct-section-head">
        <h3 style={{ margin: 0 }}>Planning &amp; Notes</h3>
        {onenote && (
          <a className="btn" href={onenote} target="_blank" rel="noopener">
            ⬈ Open my OneNote
          </a>
        )}
      </div>

      <p style={{ color: "var(--mut)", fontSize: 13, margin: "-6px 0 18px", maxWidth: 640 }}>
        Add a day, then paste that day's OneNote page link (in OneNote: right-click the page → Copy Link to Page).
        Click a day to jump straight to that plan. Set your notebook link in ⚙ Settings.
      </p>

      {/* Cards grid */}
      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="big">🗒</div>
          No planning days yet. Tap + to add one and paste its OneNote link.
        </div>
      ) : (
        <div className="acct-grid">
          {sorted.map((n) => {
            const d = new Date(n.date + "T12:00");
            const dstr = d.toLocaleDateString(undefined, {
              weekday: "short", month: "short", day: "numeric", year: "numeric",
            });
            return (
              <div
                key={n.id}
                className="ac2"
                style={{ cursor: n.link ? "pointer" : "default" }}
                onClick={() => n.link && window.open(n.link, "_blank", "noopener")}
              >
                <div className="ac2-name">
                  {n.title || dstr}
                  <span
                    className="strat-x"
                    onClick={(e) => { e.stopPropagation(); delNote(n.id); }}
                    title="Delete"
                  >✕</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--mut)", margin: "-8px 0 12px" }}>{dstr}</div>
                {n.summary && (
                  <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{n.summary}</div>
                )}
                <div style={{ borderTop: "1px solid var(--panel2)", paddingTop: 10, display: "flex", gap: 14, alignItems: "center" }}>
                  {n.link
                    ? <span className="note-link">⬈ Open plan in OneNote</span>
                    : <span style={{ fontSize: 12, color: "var(--dim)" }}>No link yet</span>
                  }
                  <span
                    className="del"
                    onClick={(e) => { e.stopPropagation(); openEdit(n); }}
                    style={{ color: "var(--blue)", marginLeft: "auto", cursor: "pointer" }}
                  >✎ edit</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button className="fab" onClick={openAdd} title="Add a planning day">+</button>

      {/* Modal */}
      <div className={`modal-overlay${modalOpen ? " open" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal">
          <div className="modal-head">
            <h3>{editId ? "Edit Planning Day" : "Add Planning Day"}</h3>
            <span className="modal-x" onClick={closeModal}>✕</span>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="fld">
              <label>Date</label>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div className="fld">
              <label>
                Title{" "}
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>
                  (optional)
                </span>
              </label>
              <input
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="e.g. CPI day — defensive plan"
              />
            </div>
          </div>

          <div className="fld" style={{ marginTop: 12 }}>
            <label>OneNote page link</label>
            <input
              value={fLink}
              onChange={(e) => setFLink(e.target.value)}
              placeholder="Paste the OneNote page link here"
            />
          </div>

          <div className="fld" style={{ marginTop: 12 }}>
            <label>
              Quick summary{" "}
              <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>
                (optional)
              </span>
            </label>
            <textarea
              value={fSummary}
              onChange={(e) => setFSummary(e.target.value)}
              placeholder="One-line reminder of the day's plan"
              style={{ width: "100%", minHeight: 80, background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--txt)", padding: 10, borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn" onClick={closeModal}>Cancel</button>
            <button className="btn primary" onClick={saveNote}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
