export default function SpotifyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#111827",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <a
        href="/"
        style={{
          color: "#93c5fd",
          textDecoration: "none",
        }}
      >
        ← Back to Home
      </a>

      <h1 style={{ marginTop: "24px", fontSize: "36px" }}>
        Spotify Connected
      </h1>

      <p style={{ marginTop: "12px", fontSize: "18px" }}>
        Your Spotify account was connected successfully.
      </p>

      <p style={{ marginTop: "24px", color: "#d1d5db" }}>
        The next step is loading your Spotify playlists.
      </p>
    </main>
  );
}
