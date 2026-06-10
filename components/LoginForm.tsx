"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Mode = "magic" | "password";

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null
  );

  async function handleMagicLink() {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) {
      setMessage({ text: error.message, ok: false });
    } else {
      setMessage({
        text: "Check your email — magic link sent.",
        ok: true,
      });
    }
  }

  async function handlePassword() {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setMessage({ text: error.message, ok: false });
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

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
        <button style={tabStyle(mode === "magic")} onClick={() => setMode("magic")}>
          Magic Link
        </button>
        <button
          style={tabStyle(mode === "password")}
          onClick={() => setMode("password")}
        >
          Password
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "var(--mut)",
              textTransform: "uppercase",
              letterSpacing: ".7px",
              fontWeight: 600,
              display: "block",
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                mode === "magic" ? handleMagicLink() : handlePassword();
              }
            }}
          />
        </div>

        {mode === "password" && (
          <div>
            <label
              style={{
                fontSize: 11,
                color: "var(--mut)",
                textTransform: "uppercase",
                letterSpacing: ".7px",
                fontWeight: 600,
                display: "block",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePassword();
              }}
            />
          </div>
        )}

        <button
          style={btnStyle}
          disabled={loading}
          onClick={mode === "magic" ? handleMagicLink : handlePassword}
        >
          {loading
            ? "Loading…"
            : mode === "magic"
            ? "Send Magic Link"
            : "Sign In"}
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
          fontSize: 11,
          color: "var(--dim)",
          marginTop: 20,
          lineHeight: 1.6,
        }}
      >
        No account yet? Magic link will create one automatically.
      </p>
    </div>
  );
}
