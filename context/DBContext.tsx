"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { JournalDB } from "@/types/journal";
import { loadDB, saveDB } from "@/lib/db";
import { DBX, type DbxStatus } from "@/lib/dropbox";

interface DBContextValue {
  db: JournalDB;
  setDB: (next: JournalDB) => void;
  save: (next: JournalDB) => void;
  loading: boolean;
  dbxStatus: DbxStatus;
  dbxConnected: boolean;
  dbxConnect: () => void;
  dbxDisconnect: () => void;
}

const DBContext = createContext<DBContextValue | null>(null);

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [db, setDBState] = useState<JournalDB | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbxStatus, setDbxStatus] = useState<DbxStatus>("off");

  // Wire DBX callbacks before init
  useEffect(() => {
    const localDB = loadDB();
    setDBState(localDB);

    // Give DBX access to the current DB for uploads
    DBX.getDB = () => localDB;
    DBX.onStatus = (s) => setDbxStatus(s);

    // Init: handles OAuth redirect and pulls remote if connected
    DBX.init().then((remote) => {
      if (remote) {
        // Dropbox won — adopt remote as source of truth
        const adopted = adoptRemote(remote);
        setDBState(adopted);
        saveDB(adopted);
        // Update the getDB closure with the adopted version
        DBX.getDB = () => adopted;
      }
      setLoading(false);
    });

    // Flush on tab close
    const onUnload = () => DBX.flush();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      DBX.stopTimer();
    };
  }, []);

  // Keep DBX.getDB in sync whenever db changes
  useEffect(() => {
    if (db) DBX.getDB = () => db;
  }, [db]);

  const setDB = useCallback((next: JournalDB) => {
    setDBState(next);
  }, []);

  const save = useCallback((next: JournalDB) => {
    setDBState(next);
    saveDB(next);
    DBX.markDirty();
  }, []);

  const dbxConnect    = useCallback(() => DBX.connect(), []);
  const dbxDisconnect = useCallback(() => DBX.disconnect(), []);
  const dbxConnected  = DBX.connected();

  if (loading || !db) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", color: "var(--mut)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <DBContext.Provider value={{ db, setDB, save, loading, dbxStatus, dbxConnected, dbxConnect, dbxDisconnect }}>
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
