"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDB } from "@/context/DBContext";

interface Props {
  userEmail: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onCsvImport: () => void;
  onHome: () => void;
  onLogTrade: () => void;
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><rect width="512" height="512" rx="104" fill="#0c1118"/><g transform="translate(56,23) scale(3.33)"><circle cx="60" cy="70" r="54" fill="#121821"/><circle cx="60" cy="70" r="54" fill="none" stroke="#d4a948" stroke-width="5"/><g transform="translate(21,27) scale(0.65)"><g fill="none" stroke="#f3ecd9" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="20" r="9" stroke-width="10"/><line x1="60" y1="29" x2="60" y2="110"/><line x1="38" y1="44" x2="82" y2="44"/><path d="M30 86 Q60 122 90 86"/></g><g fill="#f3ecd9" stroke="none"><path d="M30 86 L18 82 L27 72 Z"/><path d="M90 86 L102 82 L93 72 Z"/></g></g><path d="M16 92 C34 92 44 73 60 75 S76 67 78 65" fill="none" stroke="#e8c46a" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="75" r="3" fill="#e8c46a"/><rect x="78" y="58.5" width="30" height="14" rx="4" fill="#e8c46a"/><text x="93" y="68.4" fill="#0a0e14" font-family="'JetBrains Mono','DejaVu Sans Mono',monospace" font-size="7.4" font-weight="700" letter-spacing="0.6" text-anchor="middle">VWAP</text></g></svg>`;

// V1 status label + color map
const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  off:     { label: "Connect Dropbox", color: "var(--mut)",   icon: "" },
  loading: { label: "Dropbox: loading…", color: "var(--gold)", icon: "☁ " },
  saved:   { label: "Dropbox: synced",   color: "var(--green)", icon: "☁ " },
  saving:  { label: "Dropbox: saving…",  color: "var(--gold)", icon: "☁ " },
  dirty:   { label: "Dropbox: pending…", color: "var(--gold)", icon: "☁ " },
  error:   { label: "Dropbox: error",    color: "var(--red)",  icon: "☁ " },
};

export default function DashboardHeader({ userEmail, theme, onToggleTheme, onCsvImport, onHome, onLogTrade }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  const { db, save, dbxStatus, dbxConnected, dbxConnect, dbxDisconnect } = useDB();

  const isDark = theme === "dark";
  const s = STATUS_MAP[dbxStatus] ?? STATUS_MAP.off;

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ayeaye_journal_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  function dbxButton() {
    if (dbxConnected) {
      if (confirm("Disconnect Dropbox?\n\nYour journal stays safe in your Dropbox and in this browser. You can reconnect anytime.")) {
        dbxDisconnect();
      }
    } else {
      dbxConnect();
    }
  }

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--line)",
      flexWrap: "wrap", gap: 12,
    }}>
      {/* Brand */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
        onClick={onHome}
        title="Back to dashboard"
      >
        <div style={{
          width: 46, height: 46, borderRadius: 10, overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 18px rgba(212,169,72,.3)", flexShrink: 0,
        }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.3px", lineHeight: 1.2 }}>
            Aye Aye Trader
          </h1>
          <p style={{ fontSize: 11, color: "var(--mut)", letterSpacing: "1px", textTransform: "uppercase" }}>
            Process over P&amp;L
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>

        {/* Dropbox status button — exact V1 behaviour */}
        <span
          onClick={dbxButton}
          title="Sync your journal to your own Dropbox"
          style={{
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: s.color, padding: "9px 14px",
            border: "1px solid var(--line)", borderRadius: 8,
            background: "var(--panel)", transition: ".15s", whiteSpace: "nowrap",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = "var(--blue)";
            if (dbxStatus === "off") e.currentTarget.style.color = "var(--blue)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = "var(--line)";
            e.currentTarget.style.color = s.color;
          }}
        >
          {s.icon}{s.label}
        </span>

        {/* Theme toggle */}
        <button
          className="btn"
          onClick={onToggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{ fontSize: 15, padding: "8px 12px" }}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        {/* Export JSON */}
        <button className="btn" onClick={doExport}>↓ Export</button>

        {/* Import CSV shortcut */}
        <button className="btn" onClick={onCsvImport} title="Import trades from CSV">
          ↑ Import CSV
        </button>

        {/* Log Trade */}
        <button className="btn primary" onClick={onLogTrade}>
          + Log Trade
        </button>

        {/* Sign out */}
        <button
          className="btn"
          style={{ color: "var(--mut)" }}
          onClick={signOut}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--red)"; e.currentTarget.style.color = "var(--red)"; }}
          onMouseOut={(e)  => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--mut)"; }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
