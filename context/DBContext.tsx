"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { JournalDB } from "@/types/journal";
import { loadDB, saveDB } from "@/lib/db";

interface DBContextValue {
  db: JournalDB;
  setDB: (next: JournalDB) => void;
  save: (next: JournalDB) => void;
  loading: boolean;
}

const DBContext = createContext<DBContextValue | null>(null);

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [db, setDBState] = useState<JournalDB | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // localStorage is client-only — load after mount
    setDBState(loadDB());
    setLoading(false);
  }, []);

  const setDB = useCallback((next: JournalDB) => {
    setDBState(next);
  }, []);

  const save = useCallback((next: JournalDB) => {
    setDBState(next);
    saveDB(next);
  }, []);

  if (loading || !db) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--mut)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <DBContext.Provider value={{ db, setDB, save, loading }}>
      {children}
    </DBContext.Provider>
  );
}

export function useDB(): DBContextValue {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error("useDB must be used inside DBProvider");
  return ctx;
}
