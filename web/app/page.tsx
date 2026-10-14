export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #2E2822 0%, #1C1A17 55%, #131210 100%)',
        color: '#F4F1EC',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            background: '#D8A24A',
            margin: '0 auto 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
          }}
        >
          💬
        </div>
        <h1 style={{ fontSize: 34, margin: 0, letterSpacing: -0.5 }}>Dabba</h1>
        <p style={{ color: '#CFC7BA', lineHeight: 1.6, marginTop: 10 }}>
          A private, invite-only messenger for a small circle of friends. This server powers the Dabba app — open the app on your phone to chat.
        </p>
      </div>
    </main>
  );
}
