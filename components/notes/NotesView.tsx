"use client";

import { useState, useEffect, useCallback } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useDB } from "@/context/DBContext";
import { uid, today } from "@/lib/db";
import { BUILTIN_TEMPLATES } from "@/lib/noteTemplates";
import type { NoteTemplate } from "@/types/journal";

// ─── Local note shape (extends stored Note with block content) ──
interface Note {
  id: string;
  date: string;
  title?: string;
  link?: string;
  blocks?: any[];
  summary?: string; // legacy
}

// ─── Helpers ─────────────────────────────────────────────────
function fmtLong(d: string) {
  return new Date(d + "T12:00").toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function fmtShort(d: string) {
  return new Date(d + "T12:00").toLocaleDateString(undefined, {
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

// ─── BlockNote theme ─────────────────────────────────────────
const DARK_THEME = {
  colors: {
    editor:  { text: "#e6edf3", background: "#0f141c" },
    menu:    { text: "#e6edf3", background: "#121821" },
    tooltip: { text: "#e6edf3", background: "#121821" },
    hovered: { text: "#e6edf3", background: "#1e2733" },
    selected:{ text: "#e6edf3", background: "#26d07c22" },
    disabled:{ text: "#4a5563", background: "#0f141c" },
    shadow: "#000", border: "#1e2733", sideMenu: "#7d8896",
    highlights: {
      gray:  { text: "#9ca3af", background: "#1f2937" },
      brown: { text: "#d4a948", background: "#2a1f0a" },
      red:   { text: "#f0556d", background: "#2a0f14" },
      orange:{ text: "#e8825a", background: "#2a160a" },
      yellow:{ text: "#fbbf24", background: "#27200a" },
      green: { text: "#26d07c", background: "#0a2a1a" },
      blue:  { text: "#3b82c4", background: "#0a1a2a" },
      purple:{ text: "#9b6bd4", background: "#1a0a2a" },
      pink:  { text: "#c85a9b", background: "#2a0a1a" },
      teal:  { text: "#5ac8c8", background: "#0a2a2a" },
    },
  },
  borderRadius: 8,
  fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
} as const;

// ─── Deep-copy blocks (for stamping templates into notes) ─────
function cloneBlocks(blocks: any[]): any[] {
  return JSON.parse(JSON.stringify(blocks));
}

// ─── Plain text preview from blocks ──────────────────────────
function blockPreview(blocks?: any[], summary?: string): string {
  if (!blocks?.length) return summary ?? "";
  for (const b of blocks) {
    const text = (b.content ?? []).map((c: any) => c.text ?? "").join("").trim();
    if (text) return text;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR ROW (shared by notes and templates)
// ─────────────────────────────────────────────────────────────
function SideRow({
  title, sub, preview, active, badge, onClick,
}: {
  title: string; sub?: string; preview?: string;
  active: boolean; badge?: string; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
        background: active ? "rgba(38,208,124,.08)" : "transparent",
        borderLeft: `3px solid ${active ? "var(--green)" : "transparent"}`,
        transition: ".1s",
      }}
      onMouseOver={e => { if (!active) e.currentTarget.style.background = "var(--panel2)"; }}
      onMouseOut={e  => { if (!active) e.currentTarget.style.background = active ? "rgba(38,208,124,.08)" : "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--green)" : "var(--txt)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {title}
        </span>
        {badge && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
            background: "rgba(59,130,196,.18)", color: "var(--blue)", borderRadius: 4, padding: "2px 5px", flexShrink: 0 }}>
            {badge}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>{sub}</div>}
      {preview && (
        <div style={{
          fontSize: 11, color: "var(--dim)", marginTop: 3, lineHeight: 1.45,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
        }}>{preview}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RICH TEXT EDITOR (shared by note detail + template editor)
// ─────────────────────────────────────────────────────────────
function RichEditor({
  initialBlocks, onChange,
}: {
  initialBlocks?: any[];
  onChange?: () => void;
}) {
  const editor = useCreateBlockNote({ initialContent: initialBlocks });
  useEffect(() => {
    if (onChange) return editor.onChange(() => onChange());
  }, [editor, onChange]);
  return (
    <BlockNoteView
      editor={editor}
      theme={DARK_THEME as any}
      style={{ minHeight: 340, padding: "4px 0" }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// NOTE EDITOR PANEL
// ─────────────────────────────────────────────────────────────
function NoteEditorPanel({
  note, onSave, onDelete, onSaveAsTemplate,
}: {
  note: Note;
  onSave: (updated: Note) => void;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (note: Note, editorDoc: any[]) => void;
}) {
  const [title, setTitle]     = useState(note.title ?? "");
  const [link, setLink]       = useState(note.link ?? "");
  const [date, setDate]       = useState(note.date);
  const [editMeta, setEditMeta] = useState(false);
  const [dirty, setDirty]     = useState(false);

  const initialBlocks = note.blocks?.length
    ? note.blocks
    : note.summary
      ? [{ type: "paragraph", content: [{ type: "text", text: note.summary, styles: {} }] }]
      : undefined;

  const editor = useCreateBlockNote({ initialContent: initialBlocks });

  useEffect(() => editor.onChange(() => setDirty(true)), [editor]);
  useEffect(() => {
    setTitle(note.title ?? ""); setLink(note.link ?? ""); setDate(note.date);
    setDirty(false); setEditMeta(false);
  }, [note.id]);

  const save = useCallback(() => {
    onSave({ ...note, date, title: title.trim(), link: link.trim(), blocks: editor.document as any[], summary: undefined });
    setDirty(false); setEditMeta(false);
  }, [note, date, title, link, editor]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editMeta ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
                <div><label style={LABEL}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT}/></div>
                <div><label style={LABEL}>Title <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. CPI day — defensive plan" autoFocus style={INPUT}/></div>
              </div>
              <div><label style={LABEL}>OneNote link <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
                <input value={link} onChange={e => setLink(e.target.value)} placeholder="Paste the OneNote page link here" style={INPUT}/></div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>{fmtLong(note.date)}</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.25, color: "var(--txt)" }}>{note.title || fmtLong(note.date)}</h2>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
          {(dirty || editMeta) && <button className="btn primary" onClick={save}>Save</button>}
          <button className="btn" style={{ fontSize: 12 }} onClick={() => onSaveAsTemplate(note, editor.document as any[])} title="Save this note as a reusable template">
            ⊕ Save as template
          </button>
          <button className="btn" onClick={() => setEditMeta(v => !v)} title="Edit date, title, OneNote link">
            {editMeta ? "Done" : "✎ Info"}
          </button>
          <button className="btn" style={{ color: "var(--mut)" }}
            onClick={() => { if (confirm("Delete this planning day?")) onDelete(note.id); }}
            onMouseOver={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "var(--red)"; }}
            onMouseOut={e  => { e.currentTarget.style.color = "var(--mut)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
            ✕
          </button>
        </div>
      </div>

      {/* OneNote CTA */}
      {!editMeta && note.link && (
        <div style={{ marginBottom: 12 }}>
          <a href={note.link} target="_blank" rel="noopener" className="btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
              fontSize: 12, background: "rgba(59,130,196,.12)", borderColor: "rgba(59,130,196,.4)", color: "var(--blue)" }}>
            ⬈ Open plan in OneNote
          </a>
        </div>
      )}

      {/* Editor */}
      <div style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--panel2)", minHeight: 380 }}>
        <div style={{ padding: "6px 16px", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--dim)", display: "flex", gap: 16, alignItems: "center" }}>
          <span>Type <kbd style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>/</kbd> for blocks</span>
          <span>Select text to format</span>
          <span style={{ marginLeft: "auto", color: dirty ? "var(--gold)" : "var(--dim)" }}>{dirty ? "● Unsaved" : "Saved"}</span>
        </div>
        <BlockNoteView editor={editor} theme={DARK_THEME as any} style={{ minHeight: 340, padding: "4px 0" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE EDITOR PANEL
// ─────────────────────────────────────────────────────────────
function TemplateEditorPanel({
  template, onSave, onDelete, onUse,
}: {
  template: NoteTemplate;
  onSave: (updated: NoteTemplate) => void;
  onDelete: (id: string) => void;
  onUse: (template: NoteTemplate) => void;
}) {
  const [name, setName]           = useState(template.name);
  const [description, setDesc]    = useState(template.description ?? "");
  const [editMeta, setEditMeta]   = useState(false);
  const [dirty, setDirty]         = useState(false);

  const editor = useCreateBlockNote({ initialContent: template.blocks?.length ? template.blocks : undefined });
  useEffect(() => editor.onChange(() => setDirty(true)), [editor]);
  useEffect(() => {
    setName(template.name); setDesc(template.description ?? "");
    setDirty(false); setEditMeta(false);
  }, [template.id]);

  const save = useCallback(() => {
    onSave({ ...template, name: name.trim(), description: description.trim(), blocks: editor.document as any[] });
    setDirty(false); setEditMeta(false);
  }, [template, name, description, editor]);

  const isBuiltIn = !!template.builtIn;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editMeta && !isBuiltIn ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label style={LABEL}>Template name</label><input value={name} onChange={e => setName(e.target.value)} autoFocus style={INPUT}/></div>
              <div><label style={LABEL}>Description <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
                <input value={description} onChange={e => setDesc(e.target.value)} placeholder="What is this template for?" style={INPUT}/></div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px" }}>Template</span>
                {isBuiltIn && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
                    background: "rgba(59,130,196,.18)", color: "var(--blue)", borderRadius: 4, padding: "2px 5px" }}>
                    Built-in
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.25, color: "var(--txt)" }}>{template.name}</h2>
              {template.description && <p style={{ fontSize: 13, color: "var(--mut)", margin: "4px 0 0", lineHeight: 1.5 }}>{template.description}</p>}
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
          <button className="btn primary" style={{ fontSize: 12 }} onClick={() => onUse(template)}>
            ✦ Use template
          </button>
          {!isBuiltIn && (dirty || editMeta) && <button className="btn" onClick={save}>Save</button>}
          {!isBuiltIn && <button className="btn" onClick={() => setEditMeta(v => !v)}>{editMeta ? "Done" : "✎ Edit"}</button>}
          {!isBuiltIn && (
            <button className="btn" style={{ color: "var(--mut)" }}
              onClick={() => { if (confirm("Delete this template?")) onDelete(template.id); }}
              onMouseOver={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "var(--red)"; }}
              onMouseOut={e  => { e.currentTarget.style.color = "var(--mut)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Editor — read-only feel for built-ins but still interactive */}
      <div style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--panel2)", minHeight: 380 }}>
        <div style={{ padding: "6px 16px", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--dim)", display: "flex", gap: 16, alignItems: "center" }}>
          {isBuiltIn
            ? <span>Built-in preset — click <b style={{ color: "var(--green)" }}>✦ Use template</b> to stamp it into a new planning day</span>
            : <><span>Type <kbd style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>/</kbd> for blocks</span><span style={{ marginLeft: "auto", color: dirty ? "var(--gold)" : "var(--dim)" }}>{dirty ? "● Unsaved" : "Saved"}</span></>
          }
        </div>
        <BlockNoteView editor={editor} theme={DARK_THEME as any} style={{ minHeight: 340, padding: "4px 0" }}
          editable={!isBuiltIn} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ADD NOTE MODAL — with template picker
// ─────────────────────────────────────────────────────────────
function AddNoteModal({
  userTemplates, onSave, onClose,
}: {
  userTemplates: NoteTemplate[];
  onSave: (n: Note) => void;
  onClose: () => void;
}) {
  const [fDate, setFDate]               = useState(today());
  const [fTitle, setFTitle]             = useState("");
  const [fLink, setFLink]               = useState("");
  const [selectedTemplate, setTemplate] = useState<NoteTemplate | null>(null);
  const [showPicker, setShowPicker]     = useState(false);

  const allTemplates = [...BUILTIN_TEMPLATES, ...userTemplates];

  function handleSave() {
    if (!fDate) { alert("Pick a date"); return; }
    const blocks = selectedTemplate ? cloneBlocks(selectedTemplate.blocks) : undefined;
    onSave({ id: uid(), date: fDate, title: fTitle.trim(), link: fLink.trim(), blocks });
  }

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 620 }}>
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
          <label>OneNote link <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          <input value={fLink} onChange={e => setFLink(e.target.value)} placeholder="Paste the OneNote page link here" />
        </div>

        {/* Template picker */}
        <div style={{ marginBottom: 18 }}>
          <label style={LABEL}>Start from template <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          {selectedTemplate ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: "rgba(38,208,124,.08)", border: "1px solid rgba(38,208,124,.3)",
              borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", flex: 1 }}>✓ {selectedTemplate.name}</span>
              <button className="btn sm" onClick={() => { setTemplate(null); setShowPicker(false); }} style={{ fontSize: 11 }}>Change</button>
              <button className="btn sm" onClick={() => setTemplate(null)} style={{ fontSize: 11, color: "var(--mut)" }}>Remove</button>
            </div>
          ) : (
            <button className="btn" style={{ width: "100%", justifyContent: "flex-start", color: "var(--mut)" }}
              onClick={() => setShowPicker(v => !v)}>
              {showPicker ? "▾" : "▸"} Browse templates ({allTemplates.length})
            </button>
          )}

          {showPicker && !selectedTemplate && (
            <div style={{ marginTop: 8, background: "var(--panel2)", border: "1px solid var(--line)",
              borderRadius: 10, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
              {/* Built-in */}
              <div style={{ padding: "8px 14px 4px", fontSize: 10, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700 }}>Built-in presets</div>
              {BUILTIN_TEMPLATES.map(t => (
                <div key={t.id} onClick={() => { setTemplate(t); setShowPicker(false); }}
                  style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--panel)" }}
                  onMouseOver={e => e.currentTarget.style.background = "var(--panel)"}
                  onMouseOut={e  => e.currentTarget.style.background = "transparent"}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                  {t.description && <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>{t.description}</div>}
                </div>
              ))}
              {/* User templates */}
              {userTemplates.length > 0 && (
                <>
                  <div style={{ padding: "8px 14px 4px", fontSize: 10, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700, borderTop: "1px solid var(--line)" }}>Your templates</div>
                  {userTemplates.map(t => (
                    <div key={t.id} onClick={() => { setTemplate(t); setShowPicker(false); }}
                      style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--panel)" }}
                      onMouseOver={e => e.currentTarget.style.background = "var(--panel)"}
                      onMouseOut={e  => e.currentTarget.style.background = "transparent"}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                      {t.description && <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>{t.description}</div>}
                    </div>
                  ))}
                </>
              )}
              {userTemplates.length === 0 && (
                <div style={{ padding: "0 14px 12px", fontSize: 11, color: "var(--dim)" }}>
                  Save a note as a template and it'll appear here.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Add planning day</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SAVE AS TEMPLATE MODAL
// ─────────────────────────────────────────────────────────────
function SaveTemplateModal({
  defaultName, onSave, onClose,
}: {
  defaultName: string;
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [desc, setDesc] = useState("");
  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-head"><h3>Save as Template</h3><span className="modal-x" onClick={onClose}>✕</span></div>
        <div className="fld" style={{ marginBottom: 14 }}>
          <label>Template name</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus style={{ width: "100%" }} />
        </div>
        <div className="fld" style={{ marginBottom: 18 }}>
          <label>Description <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--mut)" }}>(optional)</span></label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this template for?" style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { if (!name.trim()) return; onSave(name.trim(), desc.trim()); }}>Save template</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN NOTES VIEW
// ─────────────────────────────────────────────────────────────
type MainTab = "notes" | "templates";

export default function NotesView() {
  const { db, save } = useDB();
  const [mainTab, setMainTab]             = useState<MainTab>("notes");
  const [adding, setAdding]               = useState(false);
  const [activeNoteId, setActiveNoteId]   = useState<string | null>(null);
  const [activeTemplateId, setActiveTplId]= useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [saveTplModal, setSaveTplModal]   = useState<{ note: Note; blocks: any[] } | null>(null);

  const notes      = ((db.notes ?? []) as Note[]);
  const userTpls   = ((db.templates ?? []) as NoteTemplate[]);
  const allTpls    = [...BUILTIN_TEMPLATES, ...userTpls];
  const onenote    = db.settings?.onenote ?? "";

  const sortedNotes = [...notes].sort((a, b) => b.date.localeCompare(a.date));
  const filteredNotes = search.trim()
    ? sortedNotes.filter(n =>
        n.date.includes(search) ||
        (n.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (n.summary ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : sortedNotes;

  const filteredTpls = search.trim()
    ? allTpls.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || (t.description ?? "").toLowerCase().includes(search.toLowerCase()))
    : allTpls;

  const activeNote = filteredNotes.find(n => n.id === activeNoteId) ?? filteredNotes[0] ?? null;
  const activeTpl  = filteredTpls.find(t => t.id === activeTemplateId) ?? filteredTpls[0] ?? null;

  // ── CRUD: notes ──────────────────────────────────────────
  function addNote(n: Note) {
    save({ ...db, notes: [...notes, n] as any[] });
    setAdding(false); setActiveNoteId(n.id); setMainTab("notes");
  }
  function updateNote(updated: Note) {
    save({ ...db, notes: notes.map(n => n.id === updated.id ? updated : n) as any[] });
  }
  function deleteNote(id: string) {
    save({ ...db, notes: notes.filter(n => n.id !== id) as any[] });
    setActiveNoteId(null);
  }

  // ── CRUD: user templates ─────────────────────────────────
  function saveUserTemplate(tpl: NoteTemplate) {
    const existing = userTpls.findIndex(t => t.id === tpl.id);
    const next = existing >= 0
      ? userTpls.map(t => t.id === tpl.id ? tpl : t)
      : [...userTpls, tpl];
    save({ ...db, templates: next });
  }
  function deleteUserTemplate(id: string) {
    save({ ...db, templates: userTpls.filter(t => t.id !== id) });
    setActiveTplId(null);
  }
  function createBlankTemplate() {
    const tpl: NoteTemplate = { id: uid(), name: "New template", description: "", blocks: [], builtIn: false };
    save({ ...db, templates: [...userTpls, tpl] });
    setActiveTplId(tpl.id); setMainTab("templates");
  }

  // ── Save note → template ─────────────────────────────────
  function commitSaveAsTemplate(name: string, description: string) {
    if (!saveTplModal) return;
    const tpl: NoteTemplate = {
      id: uid(), name, description, blocks: cloneBlocks(saveTplModal.blocks), builtIn: false,
    };
    save({ ...db, templates: [...userTpls, tpl] });
    setSaveTplModal(null);
    setActiveTplId(tpl.id); setMainTab("templates");
  }

  // ── Use template → new note ──────────────────────────────
  function useTemplate(tpl: NoteTemplate) {
    setAdding(true); // opens AddNoteModal with pre-selected template
    // We pass the template through the modal's picker instead of pre-selecting
    // because the user still needs to pick a date. Switch to notes tab first.
    setMainTab("notes");
  }

  // ── Sidebar tab labels ───────────────────────────────────
  const tabs: { id: MainTab; label: string; count: number }[] = [
    { id: "notes",     label: "Planning days", count: notes.length },
    { id: "templates", label: "Templates",     count: allTpls.length },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Planning &amp; Notes</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {onenote && <a className="btn" href={onenote} target="_blank" rel="noopener" style={{ fontSize: 12 }}>⬈ My OneNote</a>}
          {mainTab === "templates" && <button className="btn" onClick={createBlankTemplate}>+ New template</button>}
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add day</button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "256px 1fr", gap: 12, alignItems: "start" }}>

        {/* ── Left sidebar ── */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", position: "sticky", top: 16 }}>

          {/* Main tab switcher */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
            {tabs.map(t => (
              <button key={t.id}
                onClick={() => { setMainTab(t.id); setSearch(""); }}
                style={{
                  flex: 1, padding: "10px 6px", background: "none", border: "none",
                  borderBottom: `2px solid ${mainTab === t.id ? "var(--green)" : "transparent"}`,
                  color: mainTab === t.id ? "var(--green)" : "var(--mut)",
                  fontWeight: 700, fontSize: 12, cursor: "pointer", transition: ".1s",
                }}>
                {t.label}
                <span style={{ marginLeft: 5, fontSize: 10, opacity: .7 }}>({t.count})</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "8px 10px 4px" }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={mainTab === "notes" ? "Search days…" : "Search templates…"}
              style={{ width: "100%", background: "var(--panel2)", border: "1px solid var(--line)",
                borderRadius: 7, color: "var(--txt)", padding: "7px 10px",
                fontSize: 12, outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "var(--green)"}
              onBlur={e  => e.target.style.borderColor = "var(--line)"}
            />
          </div>

          {/* List */}
          <div style={{ padding: "4px 8px 8px", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            {mainTab === "notes" ? (
              filteredNotes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 8px", color: "var(--dim)", fontSize: 12 }}>
                  {search ? "No results" : "No planning days yet"}
                </div>
              ) : filteredNotes.map(n => (
                <SideRow
                  key={n.id}
                  title={n.title || fmtShort(n.date)}
                  sub={n.title ? fmtShort(n.date) : undefined}
                  preview={blockPreview(n.blocks, n.summary)}
                  active={n.id === activeNote?.id}
                  onClick={() => setActiveNoteId(n.id)}
                />
              ))
            ) : (
              filteredTpls.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 8px", color: "var(--dim)", fontSize: 12 }}>No results</div>
              ) : filteredTpls.map(t => (
                <SideRow
                  key={t.id}
                  title={t.name}
                  sub={t.description}
                  active={t.id === activeTpl?.id}
                  badge={t.builtIn ? "preset" : undefined}
                  onClick={() => setActiveTplId(t.id)}
                />
              ))
            )}
          </div>

          <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--dim)" }}>
            {mainTab === "notes"
              ? `${filteredNotes.length} day${filteredNotes.length !== 1 ? "s" : ""}${search ? ` of ${notes.length}` : ""}`
              : `${BUILTIN_TEMPLATES.length} built-in · ${userTpls.length} yours`
            }
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 22, minHeight: 520 }}>
          {mainTab === "notes" ? (
            activeNote ? (
              <NoteEditorPanel
                key={activeNote.id}
                note={activeNote}
                onSave={updateNote}
                onDelete={deleteNote}
                onSaveAsTemplate={(note, blocks) => setSaveTplModal({ note, blocks })}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, color: "var(--dim)", gap: 12 }}>
                <div style={{ fontSize: 32 }}>🗒</div>
                <div style={{ fontSize: 13 }}>No planning days yet</div>
                <button className="btn primary" onClick={() => setAdding(true)}>+ Add day</button>
              </div>
            )
          ) : (
            activeTpl ? (
              <TemplateEditorPanel
                key={activeTpl.id}
                template={activeTpl}
                onSave={saveUserTemplate}
                onDelete={deleteUserTemplate}
                onUse={() => setAdding(true)}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, color: "var(--dim)", gap: 12 }}>
                <div style={{ fontSize: 32 }}>📋</div>
                <div style={{ fontSize: 13 }}>Select a template</div>
                <button className="btn" onClick={createBlankTemplate}>+ Create blank template</button>
              </div>
            )
          )}
        </div>
      </div>

      <button className="fab" onClick={() => setAdding(true)} title="Add a planning day">+</button>

      {adding && (
        <AddNoteModal
          userTemplates={userTpls}
          onSave={addNote}
          onClose={() => setAdding(false)}
        />
      )}

      {saveTplModal && (
        <SaveTemplateModal
          defaultName={saveTplModal.note.title || fmtShort(saveTplModal.note.date)}
          onSave={commitSaveAsTemplate}
          onClose={() => setSaveTplModal(null)}
        />
      )}
    </div>
  );
}
