"use client";

import Link from "next/link";
import { useState } from "react";

type Track = {
  title: string;
  artist: string;
};

const tracks: Track[] = [
  { title: "Outstanding", artist: "The Gap Band" },
  { title: "Before I Let Go", artist: "Frankie Beverly & Maze" },
  { title: "Never Too Much", artist: "Luther Vandross" },
  { title: "September", artist: "Earth, Wind & Fire" },
  { title: "Candy", artist: "Cameo" },
  { title: "Juicy", artist: "The Notorious B.I.G." },
  { title: "Big Poppa", artist: "The Notorious B.I.G." },
  { title: "Hypnotize", artist: "The Notorious B.I.G." },
  { title: "C.R.E.A.M.", artist: "Wu-Tang Clan" },
  { title: "California Love", artist: "2Pac" },
  { title: "Ruff Ryders’ Anthem", artist: "DMX" },
  { title: "Return of the Mack", artist: "Mark Morrison" },
  { title: "This Is How We Do It", artist: "Montell Jordan" },
  { title: "Poison", artist: "Bell Biv DeVoe" },
  { title: "Real Love", artist: "Mary J. Blige" },
  { title: "No Diggity", artist: "Blackstreet" },
  { title: "Back That Azz Up", artist: "Juvenile" },
  { title: "Yeah!", artist: "Usher" },
  { title: "Crazy in Love", artist: "Beyoncé" },
  { title: "Hot in Herre", artist: "Nelly" },
  { title: "Family Affair", artist: "Mary J. Blige" },
  { title: "Rock with You", artist: "Michael Jackson" },
  { title: "Good Times", artist: "Chic" },
  { title: "Le Freak", artist: "Chic" },
  { title: "Let’s Groove", artist: "Earth, Wind & Fire" },
];

function shuffle(items: Track[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [
      copy[randomIndex],
      copy[index],
    ];
  }

  return copy;
}

export default function CardsPage() {
  const [cardTracks, setCardTracks] = useState<Track[]>([]);

  function generateCard() {
    setCardTracks(shuffle(tracks).slice(0, 25));
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "60px 24px 100px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(100%, 900px)",
          margin: "0 auto",
        }}
      >
        <Link
          href="/game/control"
          style={{
            color: "#c4b5fd",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          ← Back to DJ Control
        </Link>

        <header
          style={{
            marginTop: "32px",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(42px, 7vw, 70px)",
            }}
          >
            Generate Player Card
          </h1>

          <p
            style={{
              margin: "18px auto 0",
              maxWidth: "640px",
              color: "#cbd5e1",
              fontSize: "18px",
              lineHeight: 1.7,
            }}
          >
            Generate a unique 5×5 music bingo card with no free
            space.
          </p>
        </header>

        <button
          type="button"
          onClick={generateCard}
          style={{
            display: "block",
            width: "min(100%, 420px)",
            margin: "32px auto 0",
            padding: "16px 24px",
            border: 0,
            borderRadius: "999px",
            background: "#a3e635",
            color: "#172554",
            fontSize: "17px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Generate Card
        </button>

        {cardTracks.length === 25 && (
          <section
            style={{
              marginTop: "32px",
              padding: "24px",
              borderRadius: "22px",
              background: "rgba(15, 23, 42, 0.94)",
              border: "1px solid #334155",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                aspectRatio: "1 / 1",
                border: "3px solid #a78bfa",
                background: "#020617",
              }}
            >
              {cardTracks.map((track, index) => (
                <article
                  key={`${track.title}-${index}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    minWidth: 0,
                    padding: "7px",
                    textAlign: "center",
                    border: "1px solid #475569",
                    overflow: "hidden",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "clamp(9px, 1.3vw, 14px)",
                      lineHeight: 1.15,
                    }}
                  >
                    {track.title}
                  </strong>

                  <span
                    style={{
                      marginTop: "5px",
                      color: "#cbd5e1",
                      fontSize: "clamp(7px, 1vw, 11px)",
                      lineHeight: 1.15,
                    }}
                  >
                    {track.artist}
                  </span>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}