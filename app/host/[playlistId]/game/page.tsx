"use client";

import Link from "next/link";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

export default function GameSetupPage() {
  const params = useParams<{ playlistId: string }>();
  const router = useRouter();
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
  });

  function generateGame() {
    const query = new URLSearchParams({
      name: playlistName,
      clipLength,
      cardCount,
      trackCount,
    });

    router.push(
      `/host/${params.playlistId}/caller?${query.toString()}`
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #0f172a 48%, #020617 100%)",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Link
        href={`/host/${params.playlistId}?${backQuery.toString()}`}
        style={{
          color: "#93c5fd",
          textDecoration: "none",
        }}
      >
        ← Back to Host Setup
      </Link>

      <p
        style={{
          marginTop: "30px",
          color: "#a78bfa",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Game Setup
      </p>

      <h1
        style={{
          marginTop: "8px",
          fontSize: "clamp(38px, 7vw, 64px)",
        }}
      >
        {playlistName}
      </h1>

      <p
        style={{
          marginTop: "12px",
          color: "#cbd5e1",
          fontSize: "18px",
        }}
      >
        Review your settings before generating the game.
      </p>

      <section
        style={{
          marginTop: "36px",
          maxWidth: "760px",
          padding: "28px",
          background: "rgba(30, 41, 59, 0.9)",
          border: "1px solid #475569",
          borderRadius: "20px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "18px",
          }}
        >
          <article
            style={{
              padding: "20px",
              background: "#0f172a",
              borderRadius: "14px",
            }}
          >
            <p style={{ color: "#94a3b8" }}>
              Playlist songs
            </p>

            <strong
              style={{
                display: "block",
                marginTop: "8px",
                fontSize: "30px",
              }}
            >
              {trackCount}
            </strong>
          </article>

          <article
            style={{
              padding: "20px",
              background: "#0f172a",
              borderRadius: "14px",
            }}
          >
            <p style={{ color: "#94a3b8" }}>
              Clip length
            </p>

            <strong
              style={{
                display: "block",
                marginTop: "8px",
                fontSize: "30px",
              }}
            >
              {clipLength}s
            </strong>
          </article>

          <article
            style={{
              padding: "20px",
              background: "#0f172a",
              borderRadius: "14px",
            }}
          >
            <p style={{ color: "#94a3b8" }}>
              Bingo cards
            </p>

            <strong
              style={{
                display: "block",
                marginTop: "8px",
                fontSize: "30px",
              }}
            >
              {cardCount}
            </strong>
          </article>
        </div>

        <div
          style={{
            marginTop: "28px",
            padding: "20px",
            background: "#111827",
            borderRadius: "14px",
          }}
        >
          <h2 style={{ fontSize: "24px" }}>
            Ready to generate your game?
          </h2>

          <p
            style={{
              marginTop: "10px",
              color: "#cbd5e1",
              lineHeight: 1.6,
            }}
          >
            The next screen will prepare the song caller and
            create the bingo game session.
          </p>
        </div>

        <button
          type="button"
          onClick={generateGame}
          style={{
            width: "100%",
            marginTop: "24px",
            padding: "16px",
            border: 0,
            borderRadius: "12px",
            background: "#1ed760",
            color: "#052e16",
            fontWeight: 900,
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          Generate Bingo Game
        </button>
      </section>
    </main>
  );
}
