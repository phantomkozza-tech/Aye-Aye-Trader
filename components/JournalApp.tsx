"use client";

import { useState, useEffect } from "react";
import { DBProvider } from "@/context/DBContext";
import DashView from "@/components/dashboard/DashView";
import AddTradeView from "@/components/add-trade/AddTradeView";
import AccountsView from "@/components/accounts/AccountsView";
import SettingsView from "@/components/settings/SettingsView";
import BlownView from "@/components/blown/BlownView";
import StrategiesView from "@/components/strategies/StrategiesView";
import DashboardHeader from "@/components/DashboardHeader";
import TradeLogView from "@/components/trade-log/TradeLogView";
import NotesView from "@/components/notes/NotesView";
import DayDetailView from "@/components/day-detail/DayDetailView";
import CsvImportView from "@/components/csv-import/CsvImportView";
import ReportView from "@/components/report/ReportView";

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

const THEME_KEY = "ayeaye_theme";

function JournalShell({ userEmail }: { userEmail: string }) {
  const [tab, setTab] = useState<TabId>("dash");
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const [csvMode, setCsvMode] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Dash filter state — shared with DayDetailView
  const [dashSelAccts, setDashSelAccts] = useState<Set<string>>(new Set());
  const [dashShowBlown, setDashShowBlown] = useState(false);
  const [dashFrom, setDashFrom] = useState("");
  const [dashTo, setDashTo] = useState("");

  // Load persisted theme on mount
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as "dark" | "light" | null;
    const t = saved ?? "dark";
    setTheme(t);
    applyTheme(t);
  }, []);

  function applyTheme(t: "dark" | "light") {
    document.documentElement.classList.toggle("light", t === "light");
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  const goTab = (t: TabId) => { setTab(t); setDayDetail(null); setCsvMode(false); };
  const goCsv = () => { setDayDetail(null); setCsvMode(true); };

  const renderView = () => {
    if (dayDetail) {
      return (
        <DayDetailView
          date={dayDetail}
          onBack={() => setDayDetail(null)}
          onTradeClick={() => {}}
          selAccts={dashSelAccts}
          showBlown={dashShowBlown}
          from={dashFrom}
          to={dashTo}
        />
      );
    }

    if (csvMode) {
      return <CsvImportView onDone={() => { setCsvMode(false); goTab("log"); }} />;
    }

    switch (tab) {
      case "dash":
        return (
          <DashView
            onDayClick={(d) => setDayDetail(d)}
            selAccts={dashSelAccts}
            setSelAccts={setDashSelAccts}
            showBlown={dashShowBlown}
            setShowBlown={setDashShowBlown}
            from={dashFrom}
            setFrom={setDashFrom}
            to={dashTo}
            setTo={setDashTo}
          />
        );
      case "log":      return <TradeLogView onEditTrade={() => goTab("add")} />;
      case "add":      return <AddTradeView onDone={() => goTab("dash")} onCsvImport={() => setCsvMode(true)} />;
      case "accts":    return <AccountsView />;
      case "settings": return <SettingsView theme={theme} onToggleTheme={toggleTheme} />;
      case "blown":    return <BlownView />;
      case "strats":   return <StrategiesView />;
      case "notes":    return <NotesView />;
      case "report":   return <ReportView />;
      default:         return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <div className="wrap">
        <DashboardHeader
          userEmail={userEmail}
          theme={theme}
          onToggleTheme={toggleTheme}
          onCsvImport={goCsv}
          onHome={() => goTab("dash")}
        />

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
