"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const GAME_SESSION_KEY = "bttb-v2-game-session";

type StoredGameSession = {
  sessionId?: string;
  gameId?: string;
  joinCode?: string;
  gameName?: string;
  title?: string;
  venueName?: string;
  venue?: string;
  playlistName?: string;
  playlistTrackCount?: number;
  totalTracks?: number;
  requestedCardCount?: number;
  cardCount?: number;
  status?: string;
  createdAt?: string;
};

const quickActions = [
  { title: "Create New Game", href: "/game/new", icon: "🎮" },
  { title: "Import Serato CSV", href: "/music/upload", icon: "📁" },
  { title: "Spotify", href: "/music", icon: "🎵" },
  { title: "DJ Control", href: "/game/control", icon: "🎧" },
];

function readStoredGame(): StoredGameSession | null {
  try {
    const saved = localStorage.getItem(GAME_SESSION_KEY);

    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved) as StoredGameSession;

    return parsed.sessionId || parsed.gameId || parsed.joinCode
      ? parsed
      : null;
  } catch {
    localStorage.removeItem(GAME_SESSION_KEY);
    return null;
  }
}

function formatStatus(status?: string) {
  switch (status?.trim().toLowerCase()) {
    case "active":
    case "live":
    case "playing":
      return "🟢 Live";
    case "paused":
      return "🟡 Paused";
    case "completed":
    case "complete":
      return "⚪ Completed";
    case "waiting":
    case "ready":
    default:
      return "🟢 Ready";
  }
}

export default function DashboardPage() {
  const [activeGame, setActiveGame] =
    useState<StoredGameSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setActiveGame(readStoredGame());
    setLoaded(true);

    function handleStorage(event: StorageEvent) {
      if (event.key === GAME_SESSION_KEY) {
        setActiveGame(readStoredGame());
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const gameDetails = useMemo(() => {
    if (!activeGame) {
      return null;
    }

    return {
      title:
        activeGame.gameName ||
        activeGame.title ||
        "Untitled Game",
      venue:
        activeGame.venueName ||
        activeGame.venue ||
        "Not provided",
      playlist:
        activeGame.playlistName ||
        "Selected playlist",
      songs:
        activeGame.playlistTrackCount ??
        activeGame.totalTracks ??
        null,
      cards:
        activeGame.requestedCardCount ??
        activeGame.cardCount ??
        null,
      joinCode:
        activeGame.joinCode || "Not available",
      status: formatStatus(activeGame.status),
    };
  }, [activeGame]);

  function clearActiveGame() {
    localStorage.removeItem(GAME_SESSION_KEY);
    localStorage.removeItem("bttb-v2-caller-state");
    setActiveGame(null);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "50px 24px 80px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
      }}
    >
      <section style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(42px,6vw,72px)",
          }}
        >
          DJ Dashboard
        </h1>

        <p
          style={{
            marginTop: "12px",
            color: "#cbd5e1",
            fontSize: "18px",
          }}
        >
          Welcome back, DJ Mike Doelo
        </p>

        {!loaded ? (
          <section style={panelStyle}>
            <p style={{ margin: 0, color: "#cbd5e1" }}>
              Checking for an active game...
            </p>
          </section>
        ) : gameDetails ? (
          <section style={panelStyle}>
            <p style={eyebrowStyle}>Active Game</p>

            <h2
              style={{
                marginTop: "12px",
                marginBottom: 0,
                fontSize: "34px",
              }}
            >
              {gameDetails.title}
            </h2>

            <p style={{ color: "#cbd5e1", lineHeight: 1.8 }}>
              Venue: {gameDetails.venue}
              <br />
              Playlist: {gameDetails.playlist}
              {gameDetails.songs !== null
                ? ` · ${gameDetails.songs} Songs`
                : ""}
              <br />
              Game Code: {gameDetails.joinCode}
              <br />
              {gameDetails.cards !== null && (
                <>
                  Cards Generated: {gameDetails.cards}
                  <br />
                </>
              )}
              Status: {gameDetails.status}
            </p>

            <div style={buttonRowStyle}>
              <Link href="/dj-console" style={buttonStyle}>
                Resume Game
              </Link>

              <Link
                href="/game/new"
                style={secondaryButtonStyle}
              >
                New Game
              </Link>

              <button
                type="button"
                onClick={clearActiveGame}
                style={dangerButtonStyle}
              >
                Clear Active Game
              </button>
            </div>
          </section>
        ) : (
          <section style={panelStyle}>
            <p style={eyebrowStyle}>No Active Game</p>

            <h2
              style={{
                marginTop: "12px",
                marginBottom: 0,
                fontSize: "34px",
              }}
            >
              Ready to Start?
            </h2>

            <p
              style={{
                marginTop: "14px",
                color: "#cbd5e1",
                lineHeight: 1.7,
              }}
            >
              You do not currently have an active game.
              Create a new game to select a playlist,
              generate cards, and display the join code.
            </p>

            <div style={buttonRowStyle}>
              <Link href="/game/new" style={buttonStyle}>
                Create New Game
              </Link>
            </div>
          </section>
        )}

        <h2
          style={{
            marginTop: "50px",
            marginBottom: "20px",
          }}
        >
          Quick Actions
        </h2>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(220px,1fr))",
            gap: "20px",
          }}
        >
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              style={{ textDecoration: "none", color: "white" }}
            >
              <article
                style={{
                  height: "100%",
                  boxSizing: "border-box",
                  padding: "26px",
                  borderRadius: "20px",
                  background: "rgba(15,23,42,.92)",
                  border: "1px solid #334155",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "42px" }}>
                  {action.icon}
                </div>

                <h3 style={{ marginTop: "16px" }}>
                  {action.title}
                </h3>
              </article>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}

const panelStyle = {
  marginTop: "40px",
  padding: "30px",
  borderRadius: "22px",
  background: "rgba(15,23,42,.92)",
  border: "1px solid #334155",
};

const eyebrowStyle = {
  margin: 0,
  color: "#a78bfa",
  fontWeight: 900,
  letterSpacing: ".12em",
  textTransform: "uppercase" as const,
  fontSize: "13px",
};

const buttonRowStyle = {
  display: "flex",
  gap: "16px",
  flexWrap: "wrap" as const,
  marginTop: "25px",
};

const buttonStyle = {
  padding: "15px 24px",
  borderRadius: "999px",
  background: "#a3e635",
  color: "#172554",
  textDecoration: "none",
  fontWeight: 900,
};

const secondaryButtonStyle = {
  padding: "15px 24px",
  borderRadius: "999px",
  border: "1px solid #64748b",
  color: "white",
  textDecoration: "none",
  fontWeight: 900,
};

const dangerButtonStyle = {
  padding: "15px 24px",
  borderRadius: "999px",
  border: "1px solid #fb7185",
  background: "rgba(244,63,94,.08)",
  color: "#fda4af",
  fontWeight: 900,
  cursor: "pointer",
};
