import Link from "next/link";

export default function DashboardPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "80px 24px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(42px, 7vw, 72px)",
        }}
      >
        Host Dashboard
      </h1>

      <p
        style={{
          margin: "20px auto 0",
          maxWidth: "620px",
          color: "#cbd5e1",
          fontSize: "19px",
          lineHeight: 1.7,
        }}
      >
        Create games, choose your music, and manage Bingo to the
        Beats events.
      </p>

      <Link
        href="/music"
        style={{
          display: "inline-block",
          marginTop: "32px",
          padding: "15px 24px",
          borderRadius: "999px",
          background: "#a3e635",
          color: "#172554",
          textDecoration: "none",
          fontWeight: 900,
        }}
      >
        Create New Game
      </Link>
    </main>
  );
}