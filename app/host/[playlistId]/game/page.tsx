"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

export default function GameSetupPage() {
  const params = useParams<{ playlistId: string }>();
  const searchParams = useSearchParams();

  const playlistName =
    searchParams.get("name") || "Selected Playlist";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#0f172a",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Link
        href={`/host/${params.playlistId}?name=${encodeURIComponent(
          playlistName
        )}`}
        style={{
          color: "#93c5fd",
          textDecoration: "none",
        }}
      >
        ← Back to Host Setup
      </Link>

      <p
        style={{
          marginTop: "28px",
          color: "#1ed760",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        Game Setup
      </p>

      <h1
        style={{
          marginTop: "8px",
          fontSize: "42px",
        }}
      >
        {playlistName}
      </h1>

      <section
        style={{
          marginTop: "32px",
          maxWidth: "700px",
          padding: "24px",
          background: "#1e293b",
          borderRadius: "16px",
        }}
      >
        <h2 style={{ fontSize: "26px" }}>
          Playlist selected successfully
        </h2>

        <p
          style={{
            marginTop: "14px",
            color: "#cbd5e1",
          }}
        >
          The next step will generate the bingo cards and prepare the
          song caller.
        </p>
      </section>
    </main>
  );
}
