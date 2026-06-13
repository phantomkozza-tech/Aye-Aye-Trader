"use client";

import { useState, useEffect, useRef } from "react";
import { useDB } from "@/context/DBContext";
import { uid, today } from "@/lib/db";

interface Note {
  id: string;
  date: string;
  title?: string;
  link?: string;
  summary?: string;
}

function fmtDate(dateStr: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(dateStr + "T12:00").toLocaleDateString(undefined, opts ?? {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function fmtShort(dateStr: string) {
  return new Date(dateStr + "T12:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────
// Left sidebar row
// ─────────────────────────────────────────────────────────────
function NoteRow({ note, active, onClick }: { note: Note; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        cursor: "pointer",
        background: active ? "var(--panel)" : "transparent",
        border: `1px solid ${active ? "var(--line)" : "transparent"}`,
        borderLeft: active ? "3px solid var(--green)" : "3px solid transparent",
        transition: ".12s",
        marginBottom: 4,
      }}
      onMouseOver={(e) => { if (!active) e.currentTarget.style.background = "var(--panel2)"; }}
      onMouseOut={(e)  => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--txt)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {note.title || fmtShort(note.date)}
      </div>
      <div style={{ fontSize: 11, color: "var(--mut)" }}>
        {note.title ? fmtShort(note.date) : ""}
        {note.link ? <span style={{ color: "var(--blue)", marginLeft: note.title ? 8 : 0 }}>⬈ OneNote</span> : ""}
      </div>
      {note.summary && (
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
          {note.summary}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Detail / edit panel (right side)
// ─────────────────────────────────────────────────────────────
function NoteDetail({
  note, onSave, onDelete,
}: {
  note: Note;
  onSave: (updated: Note) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [fDate, setFDate]       = useState(note.date);
  const [fTitle, setFTitle]     = useState(note.title ?? "");
  const [fLink, setFLink]       = useState(note.link ?? "");
  const [fSummary, setFSummary] = useState(note.summary ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  // Reset when note changes
  useEffect(() => {
    setEditing(false);
    setFDate(note.date);
    setFTitle(note.title ?? "");
    setFLink(note.link ?? "");
    setFSummary(note.summary ?? "");
  }, [note.id]);

  function save() {
    onSave({ ...note, date: fDate, title: fTitle.trim(), link: fLink.trim(), summary: fSummary.trim() });
    setEditing(false);
  }

  function cancel() {
    setFDate(note.date);
    setFTitle(note.title ?? "");
    setFLink(note.link ?? "");
    setFSummary(note.summary ?? "");
    setEditing(false);
  }

  const displayTitle = note.title || fmtDate(note.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={LABEL}>Date</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={INPUT} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={LABEL}>Title <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
                  <input
                    ref={titleRef}
                    value={fTitle}
                    onChange={e => setFTitle(e.target.value)}
                    placeholder="e.g. CPI day — defensive plan"
                    style={INPUT}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>
                {fmtDate(note.date)}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.25 }}>{displayTitle}</h2>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {editing ? (
            <>
              <button className="btn" onClick={cancel}>Cancel</button>
              <button className="btn primary" onClick={save}>Save</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => { setEditing(true); setTimeout(() => titleRef.current?.focus(), 50); }}>
                ✎ Edit
              </button>
              <button
                className="btn"
                style={{ color: "var(--mut)" }}
                onClick={() => { if (confirm("Delete this planning day?")) onDelete(note.id); }}
                onMouseOver={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "var(--red)"; }}
                onMouseOut={e  => { e.currentTarget.style.color = "var(--mut)"; e.currentTarget.style.borderColor = "var(--line)"; }}
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      {/* OneNote link */}
      <div style={{ marginBottom: 20 }}>
        {editing ? (
          <div>
            <label style={LABEL}>OneNote page link</label>
            <input
              value={fLink}
              onChange={e => setFLink(e.target.value)}
              placeholder="Paste the OneNote page link here"
              style={{ ...INPUT, width: "100%" }}
            />
          </div>
        ) : note.link ? (
          <a
            href={note.link}
            target="_blank"
            rel="noopener"
            className="btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
              background: "rgba(59,130,196,.12)", borderColor: "rgba(59,130,196,.4)", color: "var(--blue)" }}
          >
            ⬈ Open plan in OneNote
          </a>
        ) : (
          <div style={{ fontSize: 13, color: "var(--dim)", padding: "10px 14px", background: "var(--panel2)",
            border: "1px dashed var(--line)", borderRadius: 8 }}>
            No OneNote link yet — click Edit to add one
          </div>
        )}
      </div>

      {/* Summary / notes */}
      <div style={{ flex: 1 }}>
        <label style={LABEL}>Summary / plan notes</label>
        {editing ? (
          <textarea
            value={fSummary}
            onChange={e => setFSummary(e.target.value)}
            placeholder="Key levels, bias, setups to watch, rules for the day…"
            style={{
              width: "100%", minHeight: 220, background: "var(--panel2)",
              border: "1px solid var(--line)", color: "var(--txt)", padding: 14,
              borderRadius: 10, fontFamily: "inherit", fontSize: 13, lineHeight: 1.7,
              resize: "vertical", outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "var(--green)"}
            onBlur={e  => e.target.style.borderColor = "var(--line)"}
          />
        ) : note.summary ? (
          <div style={{
            fontSize: 13, lineHeight: 1.8, color: "var(--txt)",
            background: "var(--panel2)", border: "1px solid var(--line)",
            borderRadius: 10, padding: 16, whiteSpace: "pre-wrap", minHeight: 80,
          }}>
            {note.summary}
          </div>
        ) : (
          <div style={{
            fontSize: 13, color: "var(--dim)", background: "var(--panel2)",
            border: "1px dashed var(--line)", borderRadius: 10, padding: 16,
            minHeight: 80, lineHeight: 1.7,
          }}>
            No summary yet. Click Edit to add your plan for the day — key levels, bias, setups to watch.
          </div>
        )}
      </div>
    </div>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 11, color: "var(--mut)", textTransform: "uppercase",
  letterSpacing: ".6px", fontWeight: 600, display: "block", marginBottom: 6,
};
const INPUT: React.CSSProperties = {
  background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8,
  color: "var(--txt)", padding: "9px 12px", fontSize: 13, outline: "none",
  width: "100%", boxSizing: "border-box",
};

// ─────────────────────────────────────────────────────────────
// Modal for creating a new note
// ─────────────────────────────────────────────────────────────
function AddNoteModal({ onSave, onClose }: { onSave: (n: Note) => void; onClose: () => void }) {
  const [fDate, setFDate]       = useState(today());
  const [fTitle, setFTitle]     = useState("");
  const [fLink, setFLink]       = useState("");
  const [fSummary, setFSummary] = useState("");

  function handleSave() {
    if (!fDate) { alert("Pick a date"); return; }
    onSave({ id: uid(), date: fDate, title: fTitle.trim(), link: fLink.trim(), summary: fSummary.trim() });
  }

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>Add Planning Day</h3>
          <span className="modal-x" onClick={onClose}>✕</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
          <div className="fld">
            <label>Date</label>
            <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
          </div>
          <div className="fld">
            <label>Title <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
            <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="e.g. CPI day — defensive plan" autoFocus />
          </div>
        </div>

        <div className="fld" style={{ marginBottom: 14 }}>
          <label>OneNote page link <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          <input value={fLink} onChange={e => setFLink(e.target.value)} placeholder="Paste the OneNote page link here" />
        </div>

        <div className="fld">
          <label>Quick summary <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          <textarea
            value={fSummary}
            onChange={e => setFSummary(e.target.value)}
            placeholder="Key levels, bias, setups to watch, rules for the day…"
            style={{ width: "100%", minHeight: 100, background: "var(--panel2)", border: "1px solid var(--line)",
              color: "var(--txt)", padding: 10, borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
          />
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Add planning day</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main NotesView
// ─────────────────────────────────────────────────────────────
export default function NotesView() {
  const { db, save } = useDB();
  const [adding, setAdding]       = useState(false);
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [search, setSearch]       = useState("");

  const notes: Note[] = (db.notes ?? []) as Note[];
  const onenote = db.settings?.onenote ?? "";

  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  const filtered = search.trim()
    ? sorted.filter(n =>
        n.date.includes(search) ||
        (n.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (n.summary ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : sorted;

  // Default to first note
  const activeNote = filtered.find(n => n.id === activeId) ?? filtered[0] ?? null;

  function addNote(n: Note) {
    const next = [...notes, n] as any[];
    save({ ...db, notes: next });
    setAdding(false);
    setActiveId(n.id);
  }

  function updateNote(updated: Note) {
    const next = notes.map(n => n.id === updated.id ? updated : n) as any[];
    save({ ...db, notes: next });
  }

  function deleteNote(id: string) {
    const next = notes.filter(n => n.id !== id) as any[];
    save({ ...db, notes: next });
    setActiveId(null);
  }

  // ── Empty state ────────────────────────────────────────────
  if (notes.length === 0 && !adding) {
    return (
      <div>
        <div className="acct-section-head" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Planning &amp; Notes</h3>
          {onenote && (
            <a className="btn" href={onenote} target="_blank" rel="noopener">⬈ Open my OneNote</a>
          )}
        </div>
        <div className="empty-state" style={{ minHeight: 320 }}>
          <div className="big">🗒</div>
          <div style={{ fontWeight: 700, color: "var(--txt)", fontSize: 15, marginBottom: 6 }}>No planning days yet</div>
          <div style={{ fontSize: 13, color: "var(--mut)", maxWidth: 400, lineHeight: 1.6, marginBottom: 20 }}>
            Add a day, paste its OneNote link, and write your pre-market plan. Each day shows up here as a reference you can open mid-session.
          </div>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add planning day</button>
        </div>
        {adding && <AddNoteModal onSave={addNote} onClose={() => setAdding(false)} />}
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Planning &amp; Notes</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onenote && (
            <a className="btn" href={onenote} target="_blank" rel="noopener" style={{ fontSize: 12 }}>⬈ My OneNote</a>
          )}
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add day</button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start" }}>

        {/* ── Left: list ── */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
          {/* Search */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search days…"
              style={{
                width: "100%", background: "var(--panel2)", border: "1px solid var(--line)",
                borderRadius: 7, color: "var(--txt)", padding: "7px 10px", fontSize: 12,
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e  => e.target.style.borderColor = "var(--green)"}
              onBlur={e   => e.target.style.borderColor = "var(--line)"}
            />
          </div>

          {/* List */}
          <div style={{ padding: "8px 8px", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--dim)", fontSize: 12 }}>
                No results
              </div>
            ) : (
              filtered.map(n => (
                <NoteRow
                  key={n.id}
                  note={n}
                  active={n.id === (activeNote?.id ?? null)}
                  onClick={() => setActiveId(n.id)}
                />
              ))
            )}
          </div>

          {/* Count */}
          <div style={{ padding: "8px 16px", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--dim)" }}>
            {filtered.length} day{filtered.length !== 1 ? "s" : ""}
            {search && ` of ${notes.length}`}
          </div>
        </div>

        {/* ── Right: detail ── */}
        <div style={{
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12,
          padding: 24, minHeight: 480,
        }}>
          {activeNote ? (
            <NoteDetail
              key={activeNote.id}
              note={activeNote}
              onSave={updateNote}
              onDelete={deleteNote}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: 400, color: "var(--dim)", gap: 8 }}>
              <div style={{ fontSize: 32 }}>🗒</div>
              <div style={{ fontSize: 13 }}>Select a day from the list</div>
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => setAdding(true)} title="Add a planning day">+</button>

      {adding && <AddNoteModal onSave={addNote} onClose={() => setAdding(false)} />}
    </div>
  );
}
