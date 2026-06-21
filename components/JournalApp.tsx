"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { DBProvider, useDB } from "@/context/DBContext";
import DashView from "@/components/dashboard/DashView";
import AddTradeView from "@/components/add-trade/AddTradeView";
import AccountsView from "@/components/accounts/AccountsView";
import AccountDashView from "@/components/accounts/AccountDashView";
import SettingsView from "@/components/settings/SettingsView";
import BlownView from "@/components/blown/BlownView";
import StrategiesView from "@/components/strategies/StrategiesView";
import DashboardHeader from "@/components/DashboardHeader";
import TradeLogView from "@/components/trade-log/TradeLogView";
import DayDetailView from "@/components/day-detail/DayDetailView";
import CsvImportView from "@/components/csv-import/CsvImportView";
import ReportView from "@/components/report/ReportView";
import { randomBlowupLine } from "@/lib/db";

// BlockNote uses browser-only APIs — must never run on the server
const NotesView = dynamic(() => import("@/components/notes/NotesView"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: 400, color: "var(--mut)", fontSize: 13 }}>
      Loading editor…
    </div>
  ),
});

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
  const { canWrite } = useDB();
  const [tab, setTab] = useState<TabId>("dash");
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const [csvMode, setCsvMode] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [blowupLine, setBlowupLine] = useState<string | null>(null);
  const [editTradeId, setEditTradeId] = useState<string | null>(null);
  const [acctDashId, setAcctDashId] = useState<string | null>(null);

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

  const goTab = (t: TabId) => { setTab(t); setDayDetail(null); setCsvMode(false); setEditTradeId(null); setAcctDashId(null); };
  const goCsv = () => { setDayDetail(null); setCsvMode(true); };
  const fireBlowup = () => setBlowupLine(randomBlowupLine());

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
      return <CsvImportView onDone={(blewUp?: boolean) => { setCsvMode(false); if (blewUp) { fireBlowup(); goTab("blown"); } else goTab("log"); }} />;
    }

    if (acctDashId) {
      return <AccountDashView acctId={acctDashId} theme={theme} onBack={() => setAcctDashId(null)} />;
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
            theme={theme}
          />
        );
      case "log":      return <TradeLogView onEditTrade={(id) => { goTab("add"); setEditTradeId(id); }} />;
      case "add":      return <AddTradeView editTradeId={editTradeId} onDone={(blewUp?: boolean) => { setEditTradeId(null); if (blewUp) { fireBlowup(); goTab("blown"); } else goTab("dash"); }} onCsvImport={() => setCsvMode(true)} />;
      case "accts":    return <AccountsView onOpenAcct={(id) => setAcctDashId(id)} />;
      case "settings": return <SettingsView theme={theme} onToggleTheme={toggleTheme} />;
      case "blown":    return <BlownView theme={theme} />;
      case "strats":   return <StrategiesView />;
      case "notes":    return <NotesView theme={theme} />;
      case "report":   return <ReportView theme={theme} />;
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
          onLogTrade={() => goTab("add")}
        />

        {!canWrite && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              background: "rgba(229,84,84,0.10)",
              border: "1px solid var(--red)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 13.5, color: "var(--txt)", lineHeight: 1.5 }}>
              <b style={{ color: "var(--red)" }}>Read-only.</b> Your subscription has ended —
              you can view your journal, but logging trades, imports, and edits are paused.
            </span>
            <a
              href="/subscribe"
              style={{
                flex: "none",
                textDecoration: "none",
                background: "var(--green)",
                color: "#04140b",
                fontWeight: 700,
                fontSize: 13,
                padding: "9px 16px",
                borderRadius: 8,
              }}
            >
              Resubscribe
            </a>
          </div>
        )}
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

      {blowupLine && (
        <div
          onClick={() => setBlowupLine(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 210,
            background: "rgba(10,5,7,.88)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, animation: "fade .2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(160deg,#1a0e12,var(--panel))",
              border: "1px solid var(--red)", borderRadius: 18,
              padding: "36px 30px", maxWidth: 440, textAlign: "center",
              boxShadow: "0 24px 70px rgba(240,85,109,.25)",
            }}
          >
            <div style={{ fontSize: 54, marginBottom: 8 }}>🪦</div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "var(--red)", marginBottom: 14 }}>
              ACCOUNT BLOWN
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.5, color: "var(--txt)" }}>
              {blowupLine}
            </div>
            <button
              className="btn"
              onClick={() => setBlowupLine(null)}
              style={{ marginTop: 22, borderColor: "var(--red)", color: "var(--red)" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
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
