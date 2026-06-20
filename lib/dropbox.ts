// ============================================================
// Aye Aye Trader — Dropbox PKCE integration
// CLIENT-SIDE ONLY. Every browser API is guarded so this
// module is safe to import in a Next.js SSR context.
// ============================================================

import type { JournalDB } from "@/types/journal";

// ⚠️  TO REMOVE THE "access to ALL your files" WARNING on the Dropbox
//    consent screen: this is a *Full Dropbox* app. Create a NEW Dropbox
//    app with "App folder" access (you can't convert an existing one),
//    then paste its app key below. Paths stay the same — they auto-scope
//    to /Apps/Aye Aye Trader/. See SETUP.md → "Dropbox" for the steps.
const DROPBOX_APP_KEY = "311hj348ml0d6l3";
const DROPBOX_FILE    = "/ayeaye_journal.json";
const TOK_KEY         = "ayeaye_dbx_token";
const PKCE_KEY        = "ayeaye_dbx_pkce";
const SAVE_EVERY      = 30_000;

export type DbxStatus = "off" | "loading" | "saved" | "saving" | "dirty" | "error";

interface Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account: string | null;
}

// ── Safe browser API wrappers ─────────────────────────────────
const isBrowser = () => typeof window !== "undefined";

function lsGet(key: string): string | null {
  if (!isBrowser()) return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string) {
  if (!isBrowser()) return;
  try { localStorage.setItem(key, val); } catch {}
}
function lsDel(key: string) {
  if (!isBrowser()) return;
  try { localStorage.removeItem(key); } catch {}
}
function ssGet(key: string): string | null {
  if (!isBrowser()) return null;
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function ssSet(key: string, val: string) {
  if (!isBrowser()) return;
  try { sessionStorage.setItem(key, val); } catch {}
}
function ssDel(key: string) {
  if (!isBrowser()) return;
  try { sessionStorage.removeItem(key); } catch {}
}

// ── PKCE helpers ──────────────────────────────────────────────
function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
function randVerifier(): string {
  const a = new Uint8Array(64);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
}
function redirectUri(): string {
  return location.origin + location.pathname;
}

// ── Token storage ─────────────────────────────────────────────
function loadTok(): Token | null {
  try { return JSON.parse(lsGet(TOK_KEY) || "null"); } catch { return null; }
}
function storeTok(t: Token) { lsSet(TOK_KEY, JSON.stringify(t)); }
function clearTok() { lsDel(TOK_KEY); }

// ─────────────────────────────────────────────────────────────
// Dropbox singleton — lazy init, no browser calls at import time
// ─────────────────────────────────────────────────────────────
class DropboxSync {
  // token is loaded lazily on first access, not at construction
  private _token: Token | null | undefined = undefined;
  private dirty   = false;
  private saving  = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private linkCache: Record<string, { url: string; exp: number }> = {};

  onStatus: ((s: DbxStatus) => void) | null = null;
  onAdopt:  ((db: JournalDB) => void) | null = null;
  getDB:    (() => JournalDB) | null = null;

  private get token(): Token | null {
    // First access: load from localStorage (safe because only called client-side)
    if (this._token === undefined) {
      this._token = loadTok();
    }
    return this._token;
  }
  private set token(t: Token | null) {
    this._token = t;
  }

  connected(): boolean {
    if (!isBrowser()) return false;
    return !!(this.token?.refresh_token);
  }

  private status(s: DbxStatus) {
    this.onStatus?.(s);
  }

  // ── Auth ─────────────────────────────────────────────────
  async connect() {
    if (!isBrowser()) return;
    const verifier  = randVerifier();
    const challenge = await sha256(verifier);
    ssSet(PKCE_KEY, verifier);
    const u = new URL("https://www.dropbox.com/oauth2/authorize");
    u.searchParams.set("client_id",             DROPBOX_APP_KEY);
    u.searchParams.set("response_type",         "code");
    u.searchParams.set("code_challenge",        challenge);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("token_access_type",     "offline");
    u.searchParams.set("redirect_uri",          redirectUri());
    location.href = u.toString();
  }

  async handleRedirect(): Promise<boolean> {
    if (!isBrowser()) return false;
    const p    = new URLSearchParams(location.search);
    const code = p.get("code");
    if (!code) return false;
    const verifier = ssGet(PKCE_KEY);
    if (!verifier) return false;
    try {
      const body = new URLSearchParams({
        code, grant_type: "authorization_code",
        client_id: DROPBOX_APP_KEY,
        code_verifier: verifier,
        redirect_uri: redirectUri(),
      });
      const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!r.ok) throw new Error("token exchange failed");
      const d = await r.json();
      const tok: Token = {
        access_token:  d.access_token,
        refresh_token: d.refresh_token,
        expires_at:    Date.now() + (d.expires_in || 14400) * 1000,
        account:       d.account_id ?? null,
      };
      this.token = tok;
      storeTok(tok);
      ssDel(PKCE_KEY);
      history.replaceState({}, "", redirectUri());
      return true;
    } catch (e) {
      console.error("Dropbox auth error", e);
      ssDel(PKCE_KEY);
      history.replaceState({}, "", redirectUri());
      return false;
    }
  }

  async disconnect() {
    await this.flush();
    clearTok();
    this.token = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.status("off");
    alert("Dropbox disconnected. Your data stays in your Dropbox and in this browser.");
  }

  // ── Token refresh ─────────────────────────────────────────
  private async freshToken(): Promise<string | null> {
    if (!isBrowser() || !this.token) return null;
    if (this.token.access_token && Date.now() < this.token.expires_at - 60_000) {
      return this.token.access_token;
    }
    if (!this.token.refresh_token) { clearTok(); this.token = null; return null; }
    try {
      const body = new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: this.token.refresh_token,
        client_id:     DROPBOX_APP_KEY,
      });
      const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!r.ok) throw new Error("refresh failed");
      const d = await r.json();
      this.token.access_token = d.access_token;
      this.token.expires_at   = Date.now() + (d.expires_in || 14400) * 1000;
      storeTok(this.token);
      return this.token.access_token;
    } catch (e) {
      console.error("Dropbox refresh failed", e);
      return null;
    }
  }

  // ── Download / Upload ─────────────────────────────────────
  private async download(): Promise<JournalDB | null> {
    const at = await this.freshToken(); if (!at) return null;
    try {
      const r = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: {
          "Authorization":    "Bearer " + at,
          "Dropbox-API-Arg":  JSON.stringify({ path: DROPBOX_FILE }),
        },
      });
      if (r.status === 409) return null;
      if (!r.ok) throw new Error("download " + r.status);
      return await r.json() as JournalDB;
    } catch (e) { console.error("Dropbox download", e); return null; }
  }

  async upload(): Promise<boolean> {
    const db = this.getDB?.();
    if (!db) return false;
    const at = await this.freshToken(); if (!at) return false;
    this.saving = true;
    this.status("saving");
    try {
      const r = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization":    "Bearer " + at,
          "Content-Type":     "application/octet-stream",
          "Dropbox-API-Arg":  JSON.stringify({ path: DROPBOX_FILE, mode: "overwrite", mute: true }),
        },
        body: JSON.stringify(db),
      });
      if (!r.ok) throw new Error("upload " + r.status);
      this.dirty  = false;
      this.saving = false;
      this.status("saved");
      return true;
    } catch (e) {
      console.error("Dropbox upload", e);
      this.saving = false;
      this.status("error");
      return false;
    }
  }

  markDirty() {
    this.dirty = true;
    if (this.connected()) this.status("dirty");
  }

  private async tick() {
    if (this.dirty && !this.saving && this.connected()) await this.upload();
  }

  async flush() {
    if (this.dirty && this.connected()) await this.upload();
  }

  // ── Image pipeline ────────────────────────────────────────
  async uploadImage(blob: Blob, ext: string): Promise<string> {
    const at = await this.freshToken();
    if (!at) throw new Error("not connected");
    const name = "img_" + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6) + "." + (ext || "png");
    const path = "/screenshots/" + name;
    const r = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization":   "Bearer " + at,
        "Content-Type":    "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", mute: true }),
      },
      body: blob,
    });
    if (!r.ok) throw new Error("image upload " + r.status);
    return path;
  }

  async imageLink(path: string): Promise<string | null> {
    const cached = this.linkCache[path];
    if (cached && cached.exp > Date.now()) return cached.url;
    const at = await this.freshToken(); if (!at) return null;
    try {
      const r = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
        method: "POST",
        headers: { "Authorization": "Bearer " + at, "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      this.linkCache[path] = { url: d.link, exp: Date.now() + 3.5 * 3600 * 1000 };
      return d.link;
    } catch (e) { console.error("imageLink", e); return null; }
  }

  async deleteImage(path: string): Promise<boolean> {
    const at = await this.freshToken(); if (!at) return false;
    try {
      await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
        method: "POST",
        headers: { "Authorization": "Bearer " + at, "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      return true;
    } catch { return false; }
  }

  // ── Init (called once on client mount) ───────────────────
  async init(): Promise<JournalDB | null> {
    if (!isBrowser()) return null;
    try {
      if (location.search.includes("code=")) {
        this.status("loading");
        await this.handleRedirect();
      }
      if (this.connected()) {
        this.status("loading");
        const remote = await this.download();
        if (remote) {
          this.status(this.dirty ? "dirty" : "saved");
          if (!this.timer) {
            this.timer = setInterval(() => this.tick(), SAVE_EVERY);
          }
          return remote;
        } else {
          await this.upload();
          this.status("saved");
        }
        if (!this.timer) {
          this.timer = setInterval(() => this.tick(), SAVE_EVERY);
        }
      } else {
        this.status("off");
      }
    } catch (e) {
      console.error("Dropbox init error", e);
      this.status("error");
    }
    return null;
  }

  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

// Singleton — safe to import anywhere; no browser calls happen until .init()
export const DBX = new DropboxSync();
