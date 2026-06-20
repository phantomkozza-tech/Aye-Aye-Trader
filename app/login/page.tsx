import LoginForm from "@/components/LoginForm";

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><rect width="512" height="512" rx="104" fill="#0c1118"/><g transform="translate(56,23) scale(3.33)"><circle cx="60" cy="70" r="54" fill="#121821"/><circle cx="60" cy="70" r="54" fill="none" stroke="#d4a948" stroke-width="5"/><g transform="translate(21,27) scale(0.65)"><g fill="none" stroke="#f3ecd9" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="20" r="9" stroke-width="10"/><line x1="60" y1="29" x2="60" y2="110"/><line x1="38" y1="44" x2="82" y2="44"/><path d="M30 86 Q60 122 90 86"/></g><g fill="#f3ecd9" stroke="none"><path d="M30 86 L18 82 L27 72 Z"/><path d="M90 86 L102 82 L93 72 Z"/></g></g><path d="M16 92 C34 92 44 73 60 75 S76 67 78 65" fill="none" stroke="#e8c46a" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="75" r="3" fill="#e8c46a"/><rect x="78" y="58.5" width="30" height="14" rx="4" fill="#e8c46a"/><text x="93" y="68.4" fill="#0a0e14" font-family="'JetBrains Mono','DejaVu Sans Mono',monospace" font-size="7.4" font-weight="700" letter-spacing="0.6" text-anchor="middle">VWAP</text></g></svg>`;

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
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(212,169,72,.28)",
            }}
            dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
          />
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
