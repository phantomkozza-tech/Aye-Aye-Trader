"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { JournalDB } from "@/types/journal";
import { loadDB, saveDB } from "@/lib/db";
import { DBX, type DbxStatus } from "@/lib/dropbox";
import { CLOUD, type CloudStatus } from "@/lib/supabaseStore";
import { createClient } from "@/lib/supabase/client";

// Plans that may WRITE to the journal. Anything else (canceled, expired,
// the default "trial" placeholder before checkout) is read-only.
const WRITE_PLANS = ["trialing", "active", "past_due"];

interface DBContextValue {
  db: JournalDB;
  setDB: (next: JournalDB) => void;
  save: (next: JournalDB) => void;
  loading: boolean;
  dbxStatus: DbxStatus;
  dbxConnected: boolean;
  dbxConnect: () => void;
  dbxDisconnect: () => void;
  cloudStatus: CloudStatus;
  canWrite: boolean;
  plan: string | null;
}

const DBContext = createContext<DBContextValue | null>(null);

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [db, setDBState] = useState<JournalDB | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbxStatus, setDbxStatus] = useState<DbxStatus>("off");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("off");
  const [plan, setPlan] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(true); // fail-open until we know

  // canWrite mirror for the memoized save() to read synchronously.
  const canWriteRef = useRef(true);
  const lastNoticeRef = useRef(0);

  function applyPlan(p: string | null) {
    setPlan(p);
    // Fail open: only block writes when we positively read a non-writable plan.
    const writable = p == null ? true : WRITE_PLANS.includes(p);
    canWriteRef.current = writable;
    setCanWrite(writable);
  }

  function notifyReadOnly() {
    const now = Date.now();
    if (now - lastNoticeRef.current > 2500) {
      lastNoticeRef.current = now;
      if (typeof window !== "undefined") {
        window.alert(
          "Your journal is read-only — your subscription has ended. Resubscribe from the banner at the top to keep logging."
        );
      }
    }
  }

  // Always points at the freshest DB so the sync layers can read it.
  const dbRef = useRef<JournalDB | null>(null);
  const setCurrent = (next: JournalDB) => {
    dbRef.current = next;
    setDBState(next);
  };

  useEffect(() => {
    // 1) Local first — instant render, and the safety net.
    const localDB = loadDB();
    setCurrent(localDB);

    DBX.getDB = () => dbRef.current as JournalDB;
    DBX.onStatus = (s) => setDbxStatus(s);
    CLOUD.getDB = () => dbRef.current;
    CLOUD.onStatus = (s) => setCloudStatus(s);

    (async () => {
      let working = localDB;

      // 2) Supabase = server source of truth (always-on, tied to auth).
      let cloudHadData = false;
      if (CLOUD.available()) {
        const remote = await CLOUD.pull();
        if (remote) {
          working = adoptRemote(remote);
          cloudHadData = true;
        }
      }

      // 3) Dropbox = optional user-owned backup. init() also handles the
      //    OAuth redirect. Only ADOPT Dropbox data if Supabase had none
      //    (new user, or Supabase unavailable) — Supabase wins ties.
      try {
        const dbxRemote = await DBX.init();
        if (dbxRemote && !cloudHadData) {
          working = adoptRemote(dbxRemote);
        }
      } catch {
        /* dropbox optional — ignore */
      }

      // Commit whichever source won.
      setCurrent(working);
      saveDB(working);

      // 4) First-time migration: server row empty but we have real local
      //    data -> push it up so the user's history lands on the server.
      if (
        CLOUD.available() &&
        !cloudHadData &&
        ((working.accounts && working.accounts.length) ||
          (working.trades && working.trades.length))
      ) {
        void CLOUD.flush();
      }

      setLoading(false);
    })();

    // Fetch the user's plan so the journal knows if it's read-only.
    (async () => {
      if (!CLOUD.available()) return;
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { data: prof } = await sb
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .maybeSingle();
        applyPlan((prof?.plan as string | null) ?? null);
      } catch {
        /* fail open — leave canWrite true */
      }
    })();

    const onUnload = () => {
      DBX.flush();
      void CLOUD.flush();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      DBX.stopTimer();
      CLOUD.stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDB = useCallback((next: JournalDB) => {
    setCurrent(next);
  }, []);

  const save = useCallback((next: JournalDB) => {
    if (!canWriteRef.current) {
      // Read-only (canceled / ended). Block the write, nudge to resubscribe.
      notifyReadOnly();
      return;
    }
    setCurrent(next);
    saveDB(next);       // local cache (always)
    DBX.markDirty();    // dropbox backup (if connected)
    CLOUD.markDirty();  // supabase server (if configured)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dbxConnect = useCallback(() => DBX.connect(), []);
  const dbxDisconnect = useCallback(() => DBX.disconnect(), []);
  const dbxConnected = DBX.connected();

  if (loading || !db) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", color: "var(--mut)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <DBContext.Provider value={{ db, setDB, save, loading, dbxStatus, dbxConnected, dbxConnect, dbxDisconnect, cloudStatus, canWrite, plan }}>
      {children}
    </DBContext.Provider>
  );
}

export function useDB(): DBContextValue {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error("useDB must be used inside DBProvider");
  return ctx;
}

// ─────────────────────────────────────────────────────────────
// Adopt a remote DB (mirrors V1 DBX.adopt)
// Fills in any missing fields so older saves don't break things
// ─────────────────────────────────────────────────────────────
function adoptRemote(remote: any): JournalDB {
  if (!remote.groups)    remote.groups    = [];
  if (!remote.notes)     remote.notes     = [];
  if (!remote.strategies) remote.strategies = [];
  if (!remote.settings)  remote.settings  = {};
  if (!remote.settings.firms)        remote.settings.firms        = [];
  if (!remote.settings.tags)         remote.settings.tags         = { feelings:[], actions:[], execution:[] };
  if (!remote.settings.journalAccts) remote.settings.journalAccts = [];
  if (remote.settings.commMini  == null) remote.settings.commMini  = 2.10;
  if (remote.settings.commMicro == null) remote.settings.commMicro = 0.74;
  if (remote.settings.maxConsecLosses == null) remote.settings.maxConsecLosses = 2;
  if (remote.settings.maxTradesPerDay == null) remote.settings.maxTradesPerDay = 5;
  if (remote.settings.rapidMins == null) remote.settings.rapidMins = 5;
  if (!remote.settings.brokers) remote.settings.brokers = [];
  (remote.accounts || []).forEach((a: any) => {
    if (!a.status) a.status = "active";
    if (!a.ddtype) a.ddtype = "static";
    if (!a.phases) a.phases = [];
  });
  return remote as JournalDB;
}
