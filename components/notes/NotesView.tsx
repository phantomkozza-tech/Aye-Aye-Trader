"use client";

import { useState, useEffect, useCallback } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/react/style.css";
import "@blocknote/mantine/style.css";
import { useDB } from "@/context/DBContext";
import { uid, today } from "@/lib/db";

// ─── Types ───────────────────────────────────────────────────
interface Note {
  id: string;
  date: string;
  title?: string;
  link?: string;
  blocks?: any[]; // BlockNote document stored as JSON
  summary?: string; // legacy plain-text, kept for migration
}

// ─── Helpers ─────────────────────────────────────────────────
function fmtLong(dateStr: string) {
  return new Date(dateStr + "T12:00").toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function fmtShort(dateStr: string) {
  return new Date(dateStr + "T12:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
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

// ─── BlockNote dark theme matching Aye Aye Trader palette ────
const AYE_AYE_DARK_THEME = {
  colors: {
    editor: { text: "#e6edf3", background: "#0f141c" },
    menu:   { text: "#e6edf3", background: "#121821" },
    tooltip:{ text: "#e6edf3", background: "#121821" },
    hovered:{ text: "#e6edf3", background: "#1e2733" },
    selected:{ text: "#e6edf3", background: "#26d07c22" },
    disabled:{ text: "#4a5563", background: "#0f141c" },
    shadow: "#000",
    border: "#1e2733",
    sideMenu: "#7d8896",
    highlights: {
      gray:   { text: "#9ca3af", background: "#1f2937" },
      brown:  { text: "#d4a948", background: "#2a1f0a" },
      red:    { text: "#f0556d", background: "#2a0f14" },
      orange: { text: "#e8825a", background: "#2a160a" },
      yellow: { text: "#fbbf24", background: "#27200a" },
      green:  { text: "#26d07c", background: "#0a2a1a" },
      blue:   { text: "#3b82c4", background: "#0a1a2a" },
      purple: { text: "#9b6bd4", background: "#1a0a2a" },
      pink:   { text: "#c85a9b", background: "#2a0a1a" },
      teal:   { text: "#5ac8c8", background: "#0a2a2a" },
    },
  },
  borderRadius: 8,
  fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
} as const;

// ─── Sidebar row ─────────────────────────────────────────────
function NoteRow({ note, active, onClick }: { note: Note; active: boolean; onClick: () => void }) {
  // Get a plain-text preview from blocks
  const preview = (() => {
    if (!note.blocks?.length) return note.summary ?? "";
    for (const block of note.blocks) {
      const text = (block.content ?? []).map((c: any) => c.text ?? "").join("").trim();
      if (text) return text;
    }
    return "";
  })();

  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        cursor: "pointer",
        background: active ? "rgba(38,208,124,.08)" : "transparent",
        borderLeft: `3px solid ${active ? "var(--green)" : "transparent"}`,
        transition: ".1s",
        marginBottom: 2,
      }}
      onMouseOver={e => { if (!active) e.currentTarget.style.background = "var(--panel2)"; }}
      onMouseOut={e  => { if (!active) e.currentTarget.style.background = active ? "rgba(38,208,124,.08)" : "transparent"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--green)" : "var(--txt)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {note.title || fmtShort(note.date)}
      </div>
      <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
        <span>{note.title ? fmtShort(note.date) : ""}</span>
        {note.link && <span style={{ color: "var(--blue)" }}>· ⬈ OneNote</span>}
      </div>
      {preview && (
        <div style={{
          fontSize: 11, color: "var(--dim)", marginTop: 4,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
          lineHeight: 1.5,
        }}>
          {preview}
        </div>
      )}
    </div>
  );
}

// ─── Rich text editor panel ───────────────────────────────────
function NoteEditor({ note, onSave, onDelete }: {
  note: Note;
  onSave: (updated: Note) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle]   = useState(note.title ?? "");
  const [link, setLink]     = useState(note.link  ?? "");
  const [date, setDate]     = useState(note.date);
  const [editMeta, setEditMeta] = useState(false);
  const [dirty, setDirty]   = useState(false);

  // Migrate legacy plain-text summary → first paragraph block
  const initialBlocks = (() => {
    if (note.blocks?.length) return note.blocks;
    if (note.summary) {
      return [{ type: "paragraph", content: [{ type: "text", text: note.summary, styles: {} }] }];
    }
    return undefined;
  })();

  const editor = useCreateBlockNote({ initialContent: initialBlocks });

  // Track content changes
  useEffect(() => {
    return editor.onChange(() => setDirty(true));
  }, [editor]);

  // Reset when note switches
  useEffect(() => {
    setTitle(note.title ?? "");
    setLink(note.link ?? "");
    setDate(note.date);
    setDirty(false);
    setEditMeta(false);
  }, [note.id]);

  const save = useCallback(() => {
    onSave({
      ...note,
      date,
      title: title.trim(),
      link: link.trim(),
      blocks: editor.document as any[],
      summary: undefined, // clear legacy field once upgraded
    });
    setDirty(false);
    setEditMeta(false);
  }, [note, date, title, link, editor]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editMeta ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
                <div>
                  <label style={LABEL}>Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Title <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. CPI day — defensive plan"
                    autoFocus
                    style={INPUT}
                  />
                </div>
              </div>
              <div>
                <label style={LABEL}>OneNote page link <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
                <input
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  placeholder="Paste the OneNote page link here"
                  style={INPUT}
                />
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>
                {fmtLong(note.date)}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.25, color: "var(--txt)" }}>
                {note.title || fmtLong(note.date)}
              </h2>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {(dirty || editMeta) && (
            <button className="btn primary" onClick={save}>Save</button>
          )}
          <button
            className="btn"
            onClick={() => setEditMeta(v => !v)}
            title="Edit title, date, and OneNote link"
          >
            {editMeta ? "Done" : "✎ Info"}
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
        </div>
      </div>

      {/* OneNote CTA (when not editing meta) */}
      {!editMeta && note.link && (
        <div style={{ marginBottom: 14 }}>
          <a
            href={note.link}
            target="_blank"
            rel="noopener"
            className="btn"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              textDecoration: "none", fontSize: 12,
              background: "rgba(59,130,196,.12)", borderColor: "rgba(59,130,196,.4)", color: "var(--blue)",
            }}
          >
            ⬈ Open plan in OneNote
          </a>
        </div>
      )}

      {/* ── BlockNote editor ── */}
      <div style={{
        flex: 1,
        border: "1px solid var(--line)",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--panel2)",
        minHeight: 380,
      }}>
        {/* Toolbar hint */}
        <div style={{
          padding: "6px 16px",
          borderBottom: "1px solid var(--line)",
          fontSize: 11, color: "var(--dim)",
          display: "flex", gap: 16, alignItems: "center",
        }}>
          <span>Type <kbd style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>/</kbd> for blocks</span>
          <span>Select text to format</span>
          <span style={{ marginLeft: "auto", color: dirty ? "var(--gold)" : "var(--dim)" }}>
            {dirty ? "● Unsaved" : "Saved"}
          </span>
        </div>

        <BlockNoteView
          editor={editor}
          theme={AYE_AYE_DARK_THEME as any}
          style={{ minHeight: 340, padding: "4px 0" }}
        />
      </div>
    </div>
  );
}

// ─── Add Note Modal ───────────────────────────────────────────
function AddNoteModal({ onSave, onClose }: { onSave: (n: Note) => void; onClose: () => void }) {
  const [fDate, setFDate]   = useState(today());
  const [fTitle, setFTitle] = useState("");
  const [fLink, setFLink]   = useState("");

  function handleSave() {
    if (!fDate) { alert("Pick a date"); return; }
    onSave({ id: uid(), date: fDate, title: fTitle.trim(), link: fLink.trim() });
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
        <div className="fld" style={{ marginBottom: 18 }}>
          <label>OneNote page link <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          <input value={fLink} onChange={e => setFLink(e.target.value)} placeholder="Paste the OneNote page link here" />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Add planning day</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main NotesView ───────────────────────────────────────────
export default function NotesView() {
  const { db, save } = useDB();
  const [adding, setAdding]     = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch]     = useState("");

  const notes = ((db.notes ?? []) as Note[]);
  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = search.trim()
    ? sorted.filter(n =>
        n.date.includes(search) ||
        (n.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (n.summary ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : sorted;

  const activeNote = filtered.find(n => n.id === activeId) ?? filtered[0] ?? null;
  const onenote = db.settings?.onenote ?? "";

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

  // ── Empty state ──────────────────────────────────────────
  if (notes.length === 0 && !adding) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Planning &amp; Notes</h3>
          {onenote && <a className="btn" href={onenote} target="_blank" rel="noopener">⬈ My OneNote</a>}
        </div>
        <div className="empty-state" style={{ minHeight: 360 }}>
          <div className="big">🗒</div>
          <div style={{ fontWeight: 700, color: "var(--txt)", fontSize: 15, marginBottom: 6 }}>No planning days yet</div>
          <div style={{ fontSize: 13, color: "var(--mut)", maxWidth: 420, lineHeight: 1.7, marginBottom: 24 }}>
            Add a day and write your pre-market plan using a full rich-text editor — headings, bullets, tables, colors. Link it to your OneNote page so you can jump there from the sidebar.
          </div>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add planning day</button>
        </div>
        {adding && <AddNoteModal onSave={addNote} onClose={() => setAdding(false)} />}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Planning &amp; Notes</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {onenote && <a className="btn" href={onenote} target="_blank" rel="noopener" style={{ fontSize: 12 }}>⬈ My OneNote</a>}
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add day</button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, alignItems: "start" }}>

        {/* ── Left: list ── */}
        <div style={{
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: 12, overflow: "hidden",
          position: "sticky", top: 16,
        }}>
          <div style={{ padding: "10px 10px 6px" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                width: "100%", background: "var(--panel2)", border: "1px solid var(--line)",
                borderRadius: 7, color: "var(--txt)", padding: "7px 10px",
                fontSize: 12, outline: "none", boxSizing: "border-box",
              }}
              onFocus={e  => e.target.style.borderColor = "var(--green)"}
              onBlur={e   => e.target.style.borderColor = "var(--line)"}
            />
          </div>
          <div style={{ padding: "4px 8px 8px", maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 8px", color: "var(--dim)", fontSize: 12 }}>
                No results
              </div>
            ) : filtered.map(n => (
              <NoteRow
                key={n.id}
                note={n}
                active={n.id === activeNote?.id}
                onClick={() => setActiveId(n.id)}
              />
            ))}
          </div>
          <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--dim)" }}>
            {filtered.length} day{filtered.length !== 1 ? "s" : ""}
            {search && ` of ${notes.length}`}
          </div>
        </div>

        {/* ── Right: editor ── */}
        <div style={{
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: 12, padding: 22, minHeight: 520,
        }}>
          {activeNote ? (
            <NoteEditor
              key={activeNote.id}
              note={activeNote}
              onSave={updateNote}
              onDelete={deleteNote}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 400, color: "var(--dim)", gap: 8 }}>
              <div style={{ fontSize: 32 }}>🗒</div>
              <div style={{ fontSize: 13 }}>Select a day from the list</div>
            </div>
          )}
        </div>
      </div>

      <button className="fab" onClick={() => setAdding(true)} title="Add a planning day">+</button>
      {adding && <AddNoteModal onSave={addNote} onClose={() => setAdding(false)} />}
    </div>
  );
}
