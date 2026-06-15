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

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16352a"/><stop offset="1" stop-color="#0f3d2b"/>
    </linearGradient>
    <linearGradient id="hgold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e8c876"/><stop offset="1" stop-color="#b08828"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="112" fill="url(#hbg)"/>
  <g>
    <rect x="180" y="120" width="20" height="120" rx="3" fill="#f0556d"/>
    <rect x="187" y="100" width="6" height="160" fill="#f0556d"/>
    <rect x="246" y="92" width="20" height="150" rx="3" fill="#26d07c"/>
    <rect x="253" y="74" width="6" height="186" fill="#26d07c"/>
    <rect x="312" y="140" width="20" height="100" rx="3" fill="#26d07c"/>
    <rect x="319" y="120" width="6" height="138" fill="#26d07c"/>
  </g>
  <g>
    <path d="M150 248 q0 -56 106 -56 q106 0 106 56 z" fill="#1b6b4a" stroke="#d4a948" stroke-width="6"/>
    <rect x="202" y="222" width="14" height="32" fill="#d4a948"/>
    <rect x="296" y="222" width="14" height="32" fill="#d4a948"/>
    <rect x="146" y="248" width="220" height="118" rx="16" fill="url(#hgold)" stroke="#124d36" stroke-width="6"/>
    <rect x="146" y="284" width="220" height="14" fill="#124d36"/>
    <rect x="168" y="248" width="14" height="118" fill="#124d36" opacity="0.9"/>
    <rect x="330" y="248" width="14" height="118" fill="#124d36" opacity="0.9"/>
    <rect x="236" y="276" width="40" height="38" rx="6" fill="#124d36"/>
    <g>
      <rect x="245" y="282.5" width="22" height="25" rx="2" fill="#1a1a1a"/>
      <rect x="245" y="290.5" width="22" height="3.5" fill="#e8c876"/>
      <rect x="253.58" y="297.5" width="4.84" height="10" fill="#e8c876" opacity="0.9"/>
    </g>
  </g>
</svg>`;

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
          boxShadow: "0 4px 18px rgba(38,208,124,.3)", flexShrink: 0,
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
