import Link from "next/link";

export default function JoinPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#030712",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "500px",
          padding: "32px",
          background: "#111827",
          borderRadius: "20px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "38px" }}>Join a Game</h1>

        <p style={{ marginTop: "14px", color: "#cbd5e1" }}>
          Enter the game code provided by your host.
        </p>

        <input
          placeholder="Game code"
          style={{
            width: "100%",
            marginTop: "28px",
            padding: "15px",
            borderRadius: "10px",
            border: "1px solid #4b5563",
            background: "#1f2937",
            color: "white",
            fontSize: "18px",
            textAlign: "center",
          }}
        />

        <button
          type="button"
          style={{
            width: "100%",
            marginTop: "16px",
            padding: "15px",
            border: 0,
            borderRadius: "10px",
            background: "#a78bfa",
            color: "#1e1b4b",
            fontWeight: 900,
            fontSize: "17px",
          }}
        >
          Join Game
        </button>

        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: "24px",
            color: "#93c5fd",
            textDecoration: "none",
          }}
        >
          ← Back to Home
        </Link>
      </section>
    </main>
  );
}
