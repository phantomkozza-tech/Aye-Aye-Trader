"use client";

import { useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useDB } from "@/context/DBContext";
import { loadDB, saveDB } from "@/lib/db";

interface Props {
  userEmail: string;
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

export default function DashboardHeader({ userEmail }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { db, save } = useDB();
  const importRef = useRef<HTMLInputElement>(null);

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

  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result as string);
        if (d?.accounts && d?.trades) {
          if (confirm(`Import ${d.trades.length} trades & ${d.accounts.length} accounts? Replaces current data.`)) {
            save(d);
            router.refresh();
          }
        } else {
          alert("Unrecognized file format.");
        }
      } catch { alert("Invalid file"); }
    };
    r.readAsText(f);
    e.target.value = "";
  }

  const btnStyle: React.CSSProperties = {
    background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8,
    color: "var(--txt)", padding: "7px 14px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", transition: ".12s",
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 24px", background: "var(--panel)",
      borderBottom: "1px solid var(--line)", position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Brand — matches V1 exactly */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
        <div style={{
          width: 46, height: 46, borderRadius: 10, overflow: "hidden",
          boxShadow: "0 4px 18px rgba(38,208,124,.3)", flexShrink: 0,
        }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.3px", lineHeight: 1.2 }}>Aye Aye Trader</div>
          <div style={{ fontSize: 11, color: "var(--mut)", letterSpacing: "1px", textTransform: "uppercase" }}>Process over P&L</div>
        </div>
      </div>

      {/* Actions — matches V1 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          ...btnStyle, cursor: "pointer", fontSize: 12, color: "var(--mut)",
        }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--mut)"; }}
        >
          {userEmail}
        </span>

        <button style={btnStyle} onClick={doExport}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--green)"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}
        >↓ Export</button>

        <button style={btnStyle} onClick={() => importRef.current?.click()}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--green)"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}
        >↑ Import</button>
        <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={doImport} />

        <button style={{ ...btnStyle, background: "var(--green)", color: "#04140b", borderColor: "var(--green)", fontWeight: 700 }}
          onMouseOver={(e) => { e.currentTarget.style.background = "#2ee68a"; }}
          onMouseOut={(e) => { e.currentTarget.style.background = "var(--green)"; }}
          onClick={() => router.push("/dashboard?tab=add")}
        >+ Log Trade</button>

        <button onClick={signOut} style={{ ...btnStyle, color: "var(--mut)" }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--red)"; e.currentTarget.style.color = "var(--red)"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--mut)"; }}
        >Sign out</button>
      </div>
    </div>
  );
}
