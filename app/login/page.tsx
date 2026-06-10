import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient glow — matches journal body::before */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(55% 80% at -8% 45%, rgba(38,208,124,.18), transparent 62%),
            radial-gradient(55% 80% at 108% 55%, rgba(38,208,124,.14), transparent 62%),
            radial-gradient(90% 45% at 50% -12%, rgba(38,208,124,.07), transparent 58%)
          `,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 420,
          padding: "0 24px",
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 40,
            gap: 12,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              boxShadow: "0 4px 24px rgba(38,208,124,.25)",
            }}
          >
            🏴‍☠️
          </div>
          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-0.4px",
                color: "var(--txt)",
              }}
            >
              Aye Aye Trader
            </h1>
            <p
              style={{
                fontSize: 11,
                color: "var(--mut)",
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              Trading Journal
            </p>
          </div>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
