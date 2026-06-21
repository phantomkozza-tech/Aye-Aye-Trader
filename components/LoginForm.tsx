"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function validate(): string | null {
    if (!email.trim()) return "Enter your email.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  async function handleLogin() {
    const v = validate();
    if (v) { setMessage({ text: v, ok: false }); return; }
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ text: error.message, ok: false });
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handleSignup() {
    const v = validate();
    if (v) { setMessage({ text: v, ok: false }); return; }
    setLoading(true); setMessage(null);

    // 1) Create a pre-confirmed user on the server (no confirmation email).
    let res: Response;
    try {
      res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      setLoading(false);
      setMessage({ text: "Network error. Please try again.", ok: false });
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setMessage({ text: data?.error || "Could not create account.", ok: false });
      return;
    }

    // 2) Sign them in.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ text: error.message, ok: false });
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  const submit = () => (mode === "login" ? handleLogin() : handleSignup());

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--txt)",
    padding: "11px 14px",
    fontSize: 14,
    outline: "none",
    transition: "border-color .15s",
  };

  const btnStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--green)",
    color: "#04140b",
    border: "none",
    borderRadius: 9,
    padding: "12px 0",
    fontWeight: 700,
    fontSize: 14,
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
    transition: "opacity .15s",
    marginTop: 8,
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    background: active ? "var(--panel2)" : "transparent",
    border: "none",
    borderRadius: 7,
    color: active ? "var(--txt)" : "var(--mut)",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    padding: "7px 0",
    cursor: "pointer",
    transition: ".12s",
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--mut)",
    textTransform: "uppercase",
    letterSpacing: ".7px",
    fontWeight: 600,
    display: "block",
    marginBottom: 6,
  };

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        padding: "28px 24px",
      }}
    >
      {/* Mode toggle */}
      <div
        style={{
          display: "flex",
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 3,
          marginBottom: 24,
          gap: 4,
        }}
      >
        <button style={tabStyle(mode === "login")} onClick={() => { setMode("login"); setMessage(null); }}>
          Log in
        </button>
        <button style={tabStyle(mode === "signup")} onClick={() => { setMode("signup"); setMessage(null); }}>
          Sign up
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </div>

        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </div>

        <button style={btnStyle} disabled={loading} onClick={submit}>
          {loading ? "Loading…" : mode === "login" ? "Log in" : "Create account"}
        </button>

        {message && (
          <p
            style={{
              fontSize: 13,
              color: message.ok ? "var(--green)" : "var(--red)",
              textAlign: "center",
              marginTop: 4,
            }}
          >
            {message.text}
          </p>
        )}
      </div>

      <p
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "var(--dim)",
          marginTop: 20,
          lineHeight: 1.6,
        }}
      >
        {mode === "login" ? (
          <>New here?{" "}
            <button onClick={() => { setMode("signup"); setMessage(null); }}
              style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>
              Create an account
            </button>
          </>
        ) : (
          <>Already have an account?{" "}
            <button onClick={() => { setMode("login"); setMessage(null); }}
              style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>
              Log in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
