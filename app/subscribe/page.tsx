"use client";

import { useState } from "react";

export default function SubscribePage() {
  const [loading, setLoading] = useState<"monthly" | "yearly" | null>(null);
  const [err, setErr] = useState("");

  async function start(plan: "monthly" | "yearly") {
    setErr("");
    setLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url as string;
        return;
      }
      setErr(data?.error || "Something went wrong. Please try again.");
      setLoading(null);
    } catch {
      setErr("Network error. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--txt)",
        padding: "40px 20px",
      }}
    >
      <div style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--gold)",
            marginBottom: 14,
          }}
        >
          Start your 7-day trial
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
          Pick a plan to start trading the journal
        </h1>
        <p style={{ color: "var(--mut)", fontSize: 15, margin: "0 0 6px" }}>
          Your card is saved but <b style={{ color: "var(--txt)" }}>not charged for 7 days</b>. Cancel anytime before then and you pay nothing.
        </p>

        {err && (
          <div style={{ color: "var(--red)", fontSize: 13, margin: "14px 0 0" }}>{err}</div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 28,
          }}
        >
          {/* Monthly */}
          <PlanCard
            title="Monthly"
            price="$20"
            per="/ month"
            sub="Billed monthly. Cancel anytime."
            cta="Start trial — Monthly"
            busy={loading === "monthly"}
            disabled={loading !== null}
            onClick={() => start("monthly")}
          />
          {/* Yearly */}
          <PlanCard
            title="Yearly"
            price="$120"
            per="/ year"
            sub="Two months free vs monthly."
            cta="Start trial — Yearly"
            highlight
            busy={loading === "yearly"}
            disabled={loading !== null}
            onClick={() => start("yearly")}
          />
        </div>

        <p style={{ color: "var(--dim)", fontSize: 12, marginTop: 22, lineHeight: 1.6 }}>
          After the trial you&apos;ll be charged automatically unless you cancel. You can manage or
          cancel your subscription anytime from Settings.
        </p>
      </div>
    </div>
  );
}

function PlanCard(props: {
  title: string;
  price: string;
  per: string;
  sub: string;
  cta: string;
  busy: boolean;
  disabled: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: `1px solid ${props.highlight ? "var(--gold)" : "var(--line)"}`,
        borderRadius: 14,
        padding: "26px 22px",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mut)", letterSpacing: "0.04em" }}>
        {props.title}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 34, fontWeight: 800 }}>{props.price}</span>
        <span style={{ fontSize: 14, color: "var(--mut)" }}>{props.per}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--mut)", minHeight: 18 }}>{props.sub}</div>
      <button
        onClick={props.onClick}
        disabled={props.disabled}
        style={{
          marginTop: 8,
          background: props.highlight ? "var(--gold)" : "var(--panel2)",
          color: props.highlight ? "#1a1205" : "var(--txt)",
          border: props.highlight ? "none" : "1px solid var(--line)",
          borderRadius: 9,
          padding: "11px 14px",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: props.disabled ? "default" : "pointer",
          opacity: props.disabled && !props.busy ? 0.6 : 1,
        }}
      >
        {props.busy ? "Redirecting…" : props.cta}
      </button>
    </div>
  );
}
