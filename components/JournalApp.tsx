"use client";

import { useState } from "react";
import { DBProvider } from "@/context/DBContext";
import DashView from "@/components/dashboard/DashView";
import AddTradeView from "@/components/add-trade/AddTradeView";
import AccountsView from "@/components/accounts/AccountsView";
import SettingsView from "@/components/settings/SettingsView";
import BlownView from "@/components/blown/BlownView";
import StrategiesView from "@/components/strategies/StrategiesView";
import DashboardHeader from "@/components/DashboardHeader";

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

function JournalShell({ userEmail }: { userEmail: string }) {
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
      case "strats":   return <StrategiesView />;
      default:         return <ComingSoon label={TABS.find((t) => t.id === tab)?.label ?? tab} />;
    }
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <DashboardHeader userEmail={userEmail} />
      <nav style={{
        display: "flex", gap: 6, padding: "10px 24px",
        background: "var(--bg)", flexWrap: "wrap",
        position: "sticky", top: 75, zIndex: 90,
        marginBottom: 4,
      }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => goTab(t.id)} style={{
            background: tab === t.id ? "var(--panel)" : "transparent",
            border: `1px solid ${tab === t.id ? "var(--line)" : "transparent"}`,
            borderRadius: 8,
            padding: "10px 20px",
            fontSize: 13, fontWeight: 600,
            color: tab === t.id ? "var(--green)" : "var(--mut)",
            cursor: "pointer", whiteSpace: "nowrap", transition: ".15s",
          }}>
            {t.label}
          </button>
        ))}
      </nav>
      {renderView()}
    </div>
  );
}

export default function JournalApp({ userEmail }: { userEmail: string }) {
  return (
    <DBProvider>
      <JournalShell userEmail={userEmail} />
    </DBProvider>
  );
}
