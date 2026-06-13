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
import TradeLogView from "@/components/trade-log/TradeLogView";

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
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <button className="btn" onClick={() => setDayDetail(null)}>←</button>
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
      case "log":      return <TradeLogView onEditTrade={() => goTab("add")} />;
      case "add":      return <AddTradeView onDone={() => goTab("dash")} />;
      case "accts":    return <AccountsView />;
      case "settings": return <SettingsView />;
      case "blown":    return <BlownView />;
      case "strats":   return <StrategiesView />;
      default:         return <ComingSoon label={TABS.find((t) => t.id === tab)?.label ?? tab} />;
    }
  };

  return (
    // body::before glow is on <body> via globals.css; this div provides z-index:1 above it
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      {/*
        V1 .wrap — max-width:1280px; margin:0 auto; padding:24px
        Header + tabs + views all live inside this container.
      */}
      <div className="wrap">
        <DashboardHeader userEmail={userEmail} />

        {/*
          V1 .tabs — display:flex; gap:6px; margin-bottom:20px; flex-wrap:wrap
          Left-aligned, no background, no sticky.
          .tab — padding:10px 20px; border-radius:8px; cursor:pointer; color:var(--mut);
                 font-weight:600; border:1px solid transparent; transition:.15s
          .tab:hover — color:var(--txt)
          .tab.active — background:var(--panel); color:var(--green); border-color:var(--line)
        */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <div
              key={t.id}
              onClick={() => goTab(t.id)}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                cursor: "pointer",
                color: tab === t.id ? "var(--green)" : "var(--mut)",
                fontWeight: 600,
                border: `1px solid ${tab === t.id ? "var(--line)" : "transparent"}`,
                background: tab === t.id ? "var(--panel)" : "transparent",
                transition: ".15s",
                whiteSpace: "nowrap",
                fontSize: 14,
              }}
              onMouseOver={(e) => {
                if (tab !== t.id) e.currentTarget.style.color = "var(--txt)";
              }}
              onMouseOut={(e) => {
                if (tab !== t.id) e.currentTarget.style.color = "var(--mut)";
              }}
            >
              {t.label}
            </div>
          ))}
        </div>

        {/* Active view */}
        <div style={{ animation: "fade .3s" }}>
          {renderView()}
        </div>
      </div>
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
