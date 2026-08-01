"use client";

import { useEffect, useState } from "react";

type Track = {
  id: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
};

type CallerState = {
  sessionId: string;
  playlistName: string;
  currentTrack: Track | null;
  currentIndex: number;
  totalTracks: number;
  playedCount: number;
  clipLength: number;
  secondsRemaining: number;
  isPlaying: boolean;
  isRevealed: boolean;
  status: "ready" | "playing" | "paused" | "complete";
};

const CALLER_STATE_KEY = "bttb-v2-caller-state";
const CHANNEL_NAME = "bttb-v2-game-sync";

function readCallerState(): CallerState | null {
  try {
    const saved = localStorage.getItem(CALLER_STATE_KEY);
    return saved ? (JSON.parse(saved) as CallerState) : null;
  } catch {
    return null;
  }
}

export default function CallerPage() {
  const [state, setState] = useState<CallerState | null>(null);

  useEffect(() => {
    setState(readCallerState());

    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<CallerState>) => {
        setState(event.data);
      };
    } catch {
      channel = null;
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === CALLER_STATE_KEY && event.newValue) {
        try {
          setState(JSON.parse(event.newValue) as CallerState);
        } catch {
          // Ignore malformed storage updates.
        }
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  if (!state || !state.currentTrack) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "40px",
          background:
            "radial-gradient(circle at top, #312e81, #020617 65%)",
          color: "white",
          textAlign: "center",
        }}
      >
        <section>
          <p
            style={{
              color: "#c4b5fd",
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Bingo to the Beats
          </p>
          <h1 style={{ fontSize: "clamp(42px, 8vw, 86px)" }}>
            Waiting for the Host
          </h1>
          <p style={{ color: "#cbd5e1", fontSize: "22px" }}>
            The current song will appear here when the game begins.
          </p>
        </section>
      </main>
    );
  }

  const track = state.currentTrack;
  const progress =
    state.clipLength > 0
      ? (state.secondsRemaining / state.clipLength) * 100
      : 0;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "38px",
        background:
          "radial-gradient(circle at top, #4c1d95 0%, #111827 46%, #020617 100%)",
        color: "white",
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section style={{ width: "min(100%, 1100px)" }}>
        <p
          style={{
            margin: 0,
            color: "#c4b5fd",
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {state.isRevealed
            ? "Song Revealed"
            : state.isPlaying
              ? "Listen and Mark Your Card"
              : "Current Song"}
        </p>

        <p style={{ marginTop: "12px", color: "#94a3b8" }}>
          {state.playlistName} · Song {state.currentIndex + 1} of{" "}
          {state.totalTracks}
        </p>

        {state.isRevealed ? (
          track.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.image}
              alt=""
              style={{
                width: "min(42vw, 420px)",
                height: "min(42vw, 420px)",
                marginTop: "28px",
                borderRadius: "30px",
                objectFit: "cover",
                boxShadow: "0 30px 90px rgba(0,0,0,.45)",
              }}
            />
          ) : (
            <div
              style={{
                width: "min(42vw, 420px)",
                height: "min(42vw, 420px)",
                display: "grid",
                placeItems: "center",
                margin: "28px auto 0",
                borderRadius: "30px",
                background: "rgba(167,139,250,.18)",
                fontSize: "140px",
              }}
            >
              ♫
            </div>
          )
        ) : (
          <div
            style={{
              width: "min(42vw, 420px)",
              height: "min(42vw, 420px)",
              display: "grid",
              placeItems: "center",
              margin: "28px auto 0",
              borderRadius: "30px",
              background:
                "linear-gradient(145deg, rgba(167,139,250,.24), rgba(15,23,42,.92))",
              border: "1px solid rgba(196,181,253,.4)",
              fontSize: "140px",
              boxShadow: "0 30px 90px rgba(0,0,0,.35)",
            }}
          >
            ?
          </div>
        )}

        <h1
          style={{
            margin: "28px 0 0",
            fontSize: "clamp(42px, 7vw, 88px)",
            lineHeight: 1,
          }}
        >
          {state.isRevealed ? track.name : "SONG HIDDEN"}
        </h1>

        <p
          style={{
            margin: "18px 0 0",
            color: "#e2e8f0",
            fontSize: "clamp(24px, 3vw, 42px)",
          }}
        >
          {state.isRevealed
            ? track.artist
            : "Listen carefully and mark your bingo card"}
        </p>

        {state.isRevealed && (
          <p
            style={{
              margin: "10px 0 0",
              color: "#94a3b8",
              fontSize: "clamp(17px, 2vw, 26px)",
            }}
          >
            {track.album}
          </p>
        )}

        <div
          style={{
            height: "18px",
            marginTop: "34px",
            overflow: "hidden",
            borderRadius: "999px",
            background: "#334155",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: state.isRevealed ? "#c4b5fd" : "#a3e635",
              transition: "width 1s linear",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "baseline",
            gap: "12px",
            marginTop: "18px",
          }}
        >
          <strong
            style={{
              fontSize: "clamp(42px, 7vw, 78px)",
            }}
          >
            {state.secondsRemaining}
          </strong>
          <span style={{ color: "#94a3b8", fontSize: "24px" }}>
            seconds
          </span>
        </div>

        <p style={{ color: "#94a3b8", fontSize: "20px" }}>
          {state.status === "complete"
            ? "Game playlist complete"
            : state.isRevealed
              ? "Check your card — the next song is coming"
              : state.isPlaying
                ? "Listen and mark your bingo card"
                : "Paused by host"}
        </p>
      </section>
    </main>
  );
}

