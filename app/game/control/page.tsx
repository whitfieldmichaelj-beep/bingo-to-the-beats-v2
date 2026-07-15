"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Track = {
  id: number;
  title: string;
  artist: string;
  bpm?: string;
};

const sampleTracks: Track[] = [
  {
    id: 1,
    title: "Outstanding",
    artist: "The Gap Band",
    bpm: "112",
  },
  {
    id: 2,
    title: "Before I Let Go",
    artist: "Frankie Beverly and Maze",
    bpm: "104",
  },
  {
    id: 3,
    title: "Never Too Much",
    artist: "Luther Vandross",
    bpm: "110",
  },
  {
    id: 4,
    title: "Ain't No Stoppin' Us Now",
    artist: "McFadden & Whitehead",
    bpm: "114",
  },
  {
    id: 5,
    title: "September",
    artist: "Earth, Wind & Fire",
    bpm: "126",
  },
];

export default function GameControlPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [playedTrackIds, setPlayedTrackIds] = useState<number[]>([]);

  const currentTrack = sampleTracks[currentIndex];

  const upcomingTracks = useMemo(
    () => sampleTracks.slice(currentIndex + 1),
    [currentIndex]
  );

  function markCurrentTrackPlayed() {
    setPlayedTrackIds((current) =>
      current.includes(currentTrack.id)
        ? current
        : [...current, currentTrack.id]
    );
  }

  function goToNextTrack() {
    markCurrentTrackPlayed();

    setCurrentIndex((current) =>
      current < sampleTracks.length - 1 ? current + 1 : current
    );
  }

  function chooseRandomTrack() {
    const availableIndexes = sampleTracks
      .map((_, index) => index)
      .filter(
        (index) =>
          index !== currentIndex &&
          !playedTrackIds.includes(sampleTracks[index].id)
      );

    if (availableIndexes.length === 0) {
      return;
    }

    markCurrentTrackPlayed();

    const randomIndex =
      availableIndexes[
        Math.floor(Math.random() * availableIndexes.length)
      ];

    setCurrentIndex(randomIndex);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px 100px",
        background:
          "radial-gradient(circle at top left, #312e81 0%, #111827 42%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(100%, 1180px)",
          margin: "0 auto",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            color: "#c4b5fd",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          ← Back to Dashboard
        </Link>

        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            flexWrap: "wrap",
            gap: "24px",
            marginTop: "32px",
          }}
        >
          <div>
           

            <h1
              style={{
                margin: "10px 0 0",
                fontSize: "clamp(38px, 6vw, 62px)",
                lineHeight: 1,
              }}
            >
              90s Hip-Hop Bingo Night
            </h1>

            <p
              style={{
                margin: "14px 0 0",
                color: "#cbd5e1",
                fontSize: "17px",
              }}
            >
              Sample Serato playlist · 75 expected players
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsGameRunning((current) => !current)}
            style={{
              padding: "15px 24px",
              border: 0,
              borderRadius: "999px",
              background: isGameRunning ? "#fb7185" : "#a3e635",
              color: "#172554",
              fontSize: "16px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {isGameRunning ? "Pause Game" : "Start Game"}
          </button>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
            marginTop: "36px",
          }}
        >
          {[
            {
              label: "Players",
              value: "0 / 75",
            },
            {
              label: "Tracks",
              value: String(sampleTracks.length),
            },
            {
              label: "Played",
              value: String(playedTrackIds.length),
            },
            {
              label: "Game Status",
              value: isGameRunning ? "Running" : "Ready",
            },
          ].map((item) => (
            <article
              key={item.label}
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "rgba(15, 23, 42, 0.92)",
                border: "1px solid #334155",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#94a3b8",
                  fontSize: "13px",
                  fontWeight: 800,
                }}
              >
                {item.label}
              </p>

              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: "28px",
                  fontWeight: 900,
                }}
              >
                {item.value}
              </p>
            </article>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
            marginTop: "28px",
          }}
        >
          <article
            style={{
              padding: "34px",
              borderRadius: "24px",
              background:
                "linear-gradient(145deg, rgba(88,28,135,.72), rgba(15,23,42,.96))",
              border: "1px solid #a78bfa",
              boxShadow: "0 24px 70px rgba(126,34,206,.24)",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#c4b5fd",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
              }}
            >
              Current Song
            </p>

            <div
              style={{
                width: "82px",
                height: "82px",
                display: "grid",
                placeItems: "center",
                marginTop: "24px",
                borderRadius: "22px",
                background: "rgba(167,139,250,.18)",
                fontSize: "40px",
              }}
            >
              ♫
            </div>

            <h2
              style={{
                margin: "26px 0 0",
                fontSize: "36px",
                lineHeight: 1.1,
              }}
            >
              {currentTrack.title}
            </h2>

            <p
              style={{
                margin: "10px 0 0",
                color: "#cbd5e1",
                fontSize: "20px",
              }}
            >
              {currentTrack.artist}
            </p>

            <p
              style={{
                margin: "12px 0 0",
                color: "#94a3b8",
              }}
            >
              BPM: {currentTrack.bpm || "—"}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "12px",
                marginTop: "30px",
              }}
            >
              <button
                type="button"
                onClick={markCurrentTrackPlayed}
                style={secondaryButtonStyle}
              >
                Mark Played
              </button>

              <button
                type="button"
                onClick={chooseRandomTrack}
                style={secondaryButtonStyle}
              >
                Random Song
              </button>

              <button
                type="button"
                onClick={goToNextTrack}
                disabled={currentIndex === sampleTracks.length - 1}
                style={{
                  ...primaryButtonStyle,
                  opacity:
                    currentIndex === sampleTracks.length - 1 ? 0.5 : 1,
                }}
              >
                Next Song
              </button>
            </div>

            <p
              style={{
                margin: "24px 0 0",
                color: "#94a3b8",
                fontSize: "14px",
                lineHeight: 1.6,
              }}
            >
              Serato continues playing the actual audio. Use these
              controls to tell Bingo to the Beats which track is
              currently active.
            </p>
          </article>

          <article
            style={{
              padding: "30px",
              borderRadius: "24px",
              background: "rgba(15, 23, 42, 0.94)",
              border: "1px solid #334155",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "30px",
              }}
            >
              Upcoming Songs
            </h2>

            <div
              style={{
                display: "grid",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              {upcomingTracks.length > 0 ? (
                upcomingTracks.map((track, index) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() =>
                      setCurrentIndex(
                        sampleTracks.findIndex(
                          (item) => item.id === track.id
                        )
                      )
                    }
                    style={{
                      display: "grid",
                      gridTemplateColumns: "34px 1fr auto",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      padding: "15px",
                      borderRadius: "15px",
                      border: "1px solid #334155",
                      background: "rgba(2, 6, 23, 0.45)",
                      color: "white",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <strong style={{ color: "#a78bfa" }}>
                      {index + 1}
                    </strong>

                    <span>
                      <strong
                        style={{
                          display: "block",
                        }}
                      >
                        {track.title}
                      </strong>

                      <span
                        style={{
                          display: "block",
                          marginTop: "4px",
                          color: "#94a3b8",
                          fontSize: "13px",
                        }}
                      >
                        {track.artist}
                      </span>
                    </span>

                    <span
                      style={{
                        color: "#64748b",
                        fontSize: "13px",
                      }}
                    >
                      {track.bpm || "—"} BPM
                    </span>
                  </button>
                ))
              ) : (
                <p
                  style={{
                    color: "#94a3b8",
                  }}
                >
                  No more songs are queued.
                </p>
              )}
            </div>
          </article>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "18px",
            marginTop: "28px",
          }}
        >
          {[
           {
  label: "Generate Bingo Cards",
  href: "/game/cards",
},
            {
              label: "Open Caller Screen",
              href: "#",
            },
            {
              label: "Open Player View",
              href: "/join",
            },
            {
              label: "End Game",
              href: "/dashboard",
            },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              style={{
                padding: "20px",
                borderRadius: "18px",
                background: "rgba(15, 23, 42, 0.92)",
                border: "1px solid #334155",
                color: "white",
                textAlign: "center",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              {action.label}
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}

const primaryButtonStyle = {
  padding: "14px 18px",
  border: 0,
  borderRadius: "999px",
  background: "#a3e635",
  color: "#172554",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "14px 18px",
  borderRadius: "999px",
  border: "1px solid #64748b",
  background: "transparent",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};