"use client";

import Link from "next/link";
import {
  useParams,
  useSearchParams,
} from "next/navigation";

export default function CallerPage() {
  const params = useParams<{ playlistId: string }>();
  const searchParams = useSearchParams();

  const playlistName =
    searchParams.get("name") || "Selected Playlist";

  const clipLength =
    searchParams.get("clipLength") || "20";

  const cardCount =
    searchParams.get("cardCount") || "100";

  const trackCount =
    searchParams.get("trackCount") || "0";

  const backQuery = new URLSearchParams({
    name: playlistName,
    clipLength,
    cardCount,
    trackCount,
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#020617",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Link
        href={`/host/${params.playlistId}/game?${backQuery.toString()}`}
        style={{
          color: "#93c5fd",
          textDecoration: "none",
        }}
      >
        ← Back to Game Setup
      </Link>

      <p
        style={{
          marginTop: "30px",
          color: "#1ed760",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Host Caller
      </p>

      <h1
        style={{
          marginTop: "8px",
          fontSize: "clamp(38px, 7vw, 64px)",
        }}
      >
        {playlistName}
      </h1>

      <section
        style={{
          marginTop: "36px",
          maxWidth: "800px",
          padding: "30px",
          background: "#111827",
          borderRadius: "20px",
          border: "1px solid #334155",
        }}
      >
        <p style={{ color: "#94a3b8" }}>
          Your game session is ready.
        </p>

        <h2
          style={{
            marginTop: "16px",
            fontSize: "32px",
          }}
        >
          Song caller coming next
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "16px",
            marginTop: "26px",
          }}
        >
          <div
            style={{
              padding: "18px",
              background: "#1e293b",
              borderRadius: "12px",
            }}
          >
            <p style={{ color: "#94a3b8" }}>Songs</p>
            <strong
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "26px",
              }}
            >
              {trackCount}
            </strong>
          </div>

          <div
            style={{
              padding: "18px",
              background: "#1e293b",
              borderRadius: "12px",
            }}
          >
            <p style={{ color: "#94a3b8" }}>
              Clip length
            </p>
            <strong
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "26px",
              }}
            >
              {clipLength}s
            </strong>
          </div>

          <div
            style={{
              padding: "18px",
              background: "#1e293b",
              borderRadius: "12px",
            }}
          >
            <p style={{ color: "#94a3b8" }}>
              Cards
            </p>
            <strong
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "26px",
              }}
            >
              {cardCount}
            </strong>
          </div>
        </div>
      </section>
    </main>
  );
}
