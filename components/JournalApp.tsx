"use client";

import { useState } from "react";
import { DBProvider } from "@/context/DBContext";
import DashView from "@/components/dashboard/DashView";
import AddTradeView from "@/components/add-trade/AddTradeView";
import AccountsView from "@/components/accounts/AccountsView";
import SettingsView from "@/components/settings/SettingsView";
import BlownView from "@/components/blown/BlownView";

type TabId = "dash" | "log" | "accts" | "blown" | "strats" | "report" | "notes" | "add" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "dash",     label: "Dashboard" },
  { id: "log",      label: "Trade Log" },
  { id: "accts",    label: "Accounts" },
  { id: "blown",    label: "Blown" },
  { id: "strats",   label: "Strategies" },
  { id: "report",   label: "Report" },
  { id: "notes",    label: "Notes" },
  { id: "add",      label: "Add Trade" },
  { id: "settings", label: "⚙" },
];

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: 400, gap: 12, color: "var(--mut)" }}>
      <div style={{ fontSize: 36 }}>⚓</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--txt)" }}>{label}</div>
      <div style={{ fontSize: 12 }}>Under construction — coming soon</div>
    </div>
  );
}

function JournalShell() {
  const [tab, setTab] = useState<TabId>("dash");
  const [dayDetail, setDayDetail] = useState<string | null>(null);

  const goTab = (t: TabId) => { setTab(t); setDayDetail(null); };

  const renderView = () => {
    if (dayDetail) {
      return (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <button className="btn" onClick={() => setDayDetail(null)}>← Back</button>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
              {new Date(dayDetail + "T12:00").toLocaleDateString(undefined, {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })}
            </h2>
          </div>
          <div style={{ color: "var(--mut)", fontSize: 13 }}>Day detail — coming soon</div>
        </div>
      );
    }

    switch (tab) {
      case "dash":     return <DashView onDayClick={(d) => setDayDetail(d)} />;
      case "add":      return <AddTradeView onDone={() => goTab("dash")} />;
      case "accts":    return <AccountsView />;
      case "settings": return <SettingsView />;
      case "blown":    return <BlownView />;
      default:         return <ComingSoon label={TABS.find((t) => t.id === tab)?.label ?? tab} />;
    }
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <nav style={{
        display: "flex", justifyContent: "center", gap: 2, padding: "0 16px",
        background: "var(--panel)", borderBottom: "1px solid var(--line)",
        overflowX: "auto", position: "sticky", top: 55, zIndex: 90,
      }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => goTab(t.id)} style={{
            background: "transparent", border: "none",
            padding: "10px 14px",
            borderBottom: `2px solid ${tab === t.id ? "var(--green)" : "transparent"}`,
            fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? "var(--green)" : "var(--mut)",
            cursor: "pointer", whiteSpace: "nowrap", transition: ".12s",
          }}>
            {t.label}
          </button>
        ))}
      </nav>
      {renderView()}
    </div>
  );
}

export default function JournalApp() {
  return (
    <DBProvider>
      <JournalShell />
    </DBProvider>
  );
}
