// ============================================================
// Aye Aye Trader — Supabase journal sync
// Server-side source of truth for the journal (one JSONB blob
// per user). Mirrors the Dropbox (DBX) pattern. Every call is
// guarded so the app NEVER breaks if Supabase is unconfigured,
// the table is missing, or the network fails — it just falls
// back to localStorage.
// ============================================================

"use client";

import { createClient } from "@/lib/supabase/client";
import type { JournalDB } from "@/types/journal";

const SAVE_DEBOUNCE = 4000; // ms — coalesce rapid edits into one upsert

export type CloudStatus = "off" | "loading" | "synced" | "saving" | "dirty" | "error";

function configured(): boolean {
  return (
    typeof window !== "undefined" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

class SupabaseStore {
  onStatus: (s: CloudStatus) => void = () => {};
  getDB: () => JournalDB | null = () => null;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private userId: string | null = null;

  available(): boolean {
    return configured();
  }

  private async uid(): Promise<string | null> {
    if (!configured()) return null;
    if (this.userId) return this.userId;
    try {
      const { data } = await createClient().auth.getUser();
      this.userId = data.user?.id ?? null;
      return this.userId;
    } catch {
      return null;
    }
  }

  // Pull the remote journal. Returns a JournalDB if the user has
  // server data, or null (no row / empty / not signed in / error).
  async pull(): Promise<JournalDB | null> {
    if (!configured()) return null;
    this.onStatus("loading");
    try {
      const sb = createClient();
      const uid = await this.uid();
      if (!uid) {
        this.onStatus("off");
        return null;
      }
      const { data, error } = await sb
        .from("journals")
        .select("data")
        .eq("user_id", uid)
        .maybeSingle();

      if (error) {
        // table missing / RLS / network — fail open
        this.onStatus("error");
        return null;
      }
      this.onStatus("synced");
      const blob = data?.data as unknown;
      if (blob && typeof blob === "object" && (blob as JournalDB).accounts) {
        return blob as JournalDB;
      }
      return null; // empty server row — caller may migrate local up
    } catch {
      this.onStatus("error");
      return null;
    }
  }

  // Debounced save trigger — call on every local change.
  markDirty(): void {
    if (!configured()) return;
    this.onStatus("dirty");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, SAVE_DEBOUNCE);
  }

  // Immediate upsert of the current DB to the server.
  async flush(): Promise<void> {
    if (!configured()) return;
    const db = this.getDB();
    if (!db) return;
    try {
      const sb = createClient();
      const uid = await this.uid();
      if (!uid) return;
      this.onStatus("saving");
      const { error } = await sb
        .from("journals")
        .upsert(
          { user_id: uid, data: db as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      this.onStatus(error ? "error" : "synced");
    } catch {
      this.onStatus("error");
    }
  }

  stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const CLOUD = new SupabaseStore();
