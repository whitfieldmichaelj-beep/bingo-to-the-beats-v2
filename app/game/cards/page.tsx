"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Track = {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  bpm?: string;
  key?: string;
  length?: string;
  filename?: string;
};

type BingoCard = {
  id: number;
  tracks: Track[];
};

type WinningPattern =
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "x-pattern"
  | "blackout";

const sampleTracks: Track[] = [
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
  { title: "Give Me the Night", artist: "George Benson" },
  { title: "Got to Be Real", artist: "Cheryl Lynn" },
  { title: "I’m Coming Out", artist: "Diana Ross" },
  { title: "We Are Family", artist: "Sister Sledge" },
  { title: "Forget Me Nots", artist: "Patrice Rushen" },
  { title: "Love Come Down", artist: "Evelyn King" },
  { title: "Give It to Me Baby", artist: "Rick James" },
  { title: "Brick House", artist: "Commodores" },
  { title: "Ain’t Nobody", artist: "Chaka Khan" },
  { title: "Celebration", artist: "Kool & The Gang" },
];

function getTrackKey(track: Track) {
  return `${track.title.trim().toLowerCase()}|${track.artist
    .trim()
    .toLowerCase()}`;
}

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

function removeDuplicateTracks(items: Track[]) {
  const seen = new Set<string>();

  return items.filter((track) => {
    const key = getTrackKey(track);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function generateCards(
  playlistTracks: Track[],
  numberOfCards: number
): BingoCard[] {
  const uniqueTracks = removeDuplicateTracks(playlistTracks);

  if (uniqueTracks.length < 25) {
    throw new Error(
      "Your playlist must contain at least 25 unique tracks."
    );
  }

  return Array.from({ length: numberOfCards }, (_, index) => ({
    id: index + 1,
    tracks: shuffle(uniqueTracks).slice(0, 25),
  }));
}

function hasWinningPattern(
  card: BingoCard,
  markedSongKeys: Set<string>,
  winningPattern: WinningPattern
) {
  const marked = card.tracks.map((track) =>
    markedSongKeys.has(getTrackKey(track))
  );

  const rows = Array.from({ length: 5 }, (_, row) => [
    row * 5,
    row * 5 + 1,
    row * 5 + 2,
    row * 5 + 3,
    row * 5 + 4,
  ]);

  const columns = Array.from({ length: 5 }, (_, column) => [
    column,
    column + 5,
    column + 10,
    column + 15,
    column + 20,
  ]);

  const diagonals = [
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];

  const lineIsComplete = (line: number[]) =>
    line.every((index) => marked[index]);

  switch (winningPattern) {
    case "across":
      return rows.some(lineIsComplete);

    case "down":
      return columns.some(lineIsComplete);

    case "diagonal":
      return diagonals.some(lineIsComplete);

    case "x-pattern":
      return diagonals.every(lineIsComplete);

    case "blackout":
      return marked.every(Boolean);

    case "any-line":
    default:
      return [...rows, ...columns, ...diagonals].some(
        lineIsComplete
      );
  }
}

function formatWinningPattern(pattern: WinningPattern) {
  switch (pattern) {
    case "any-line":
      return "Any 5 in a Row";

    case "across":
      return "Across Only";

    case "down":
      return "Down Only";

    case "diagonal":
      return "Diagonal Only";

    case "x-pattern":
      return "X Pattern";

    case "blackout":
      return "Blackout";

    default:
      return "Any 5 in a Row";
  }
}

export default function CardsPage() {
  const [numberOfCards, setNumberOfCards] = useState(3);

  const [winningPattern, setWinningPattern] =
    useState<WinningPattern>("any-line");

  const [playlistTracks, setPlaylistTracks] =
    useState<Track[]>(sampleTracks);

  const [playlistSource, setPlaylistSource] =
    useState<"uploaded" | "sample">("sample");

  const [generationError, setGenerationError] = useState("");

  const [cards, setCards] = useState<BingoCard[]>([]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const [markedSongKeys, setMarkedSongKeys] = useState<Set<string>>(
    new Set()
  );

  const [winningNoticeCardId, setWinningNoticeCardId] =
    useState<number | null>(null);

  const previouslyWinningCardIds = useRef<Set<number>>(new Set());

  const activeCard = cards[activeCardIndex];

  const winningCardIds = useMemo(
    () =>
      cards
        .filter((card) =>
          hasWinningPattern(
            card,
            markedSongKeys,
            winningPattern
          )
        )
        .map((card) => card.id),
    [cards, markedSongKeys, winningPattern]
  );

  const markedCountOnActiveCard = activeCard
    ? activeCard.tracks.filter((track) =>
        markedSongKeys.has(getTrackKey(track))
      ).length
    : 0;

  useEffect(() => {
    const savedPattern = sessionStorage.getItem(
      "bttbWinningPattern"
    );

    if (
      savedPattern === "any-line" ||
      savedPattern === "across" ||
      savedPattern === "down" ||
      savedPattern === "diagonal" ||
      savedPattern === "x-pattern" ||
      savedPattern === "blackout"
    ) {
      setWinningPattern(savedPattern);
    }

    const savedPlaylist = sessionStorage.getItem("bttbPlaylist");

    if (!savedPlaylist) {
      return;
    }

    try {
      const parsedPlaylist = JSON.parse(savedPlaylist) as Track[];

      const validTracks = parsedPlaylist.filter(
        (track) =>
          typeof track.title === "string" &&
          track.title.trim() !== "" &&
          typeof track.artist === "string" &&
          track.artist.trim() !== ""
      );

      const uniqueTracks = removeDuplicateTracks(validTracks);

      if (uniqueTracks.length > 0) {
        setPlaylistTracks(uniqueTracks);
        setPlaylistSource("uploaded");
      }
    } catch (error) {
      console.error("Unable to load uploaded playlist:", error);

      setGenerationError(
        "The uploaded playlist could not be loaded. Please upload it again."
      );
    }
  }, []);

  useEffect(() => {
    const previousWinners = previouslyWinningCardIds.current;

    const newWinningCardId = winningCardIds.find(
      (cardId) => !previousWinners.has(cardId)
    );

    previouslyWinningCardIds.current = new Set(winningCardIds);

    if (newWinningCardId !== undefined) {
      setWinningNoticeCardId(newWinningCardId);
    }
  }, [winningCardIds]);

  function handleGenerateCards() {
    setGenerationError("");

    try {
      const generatedCards = generateCards(
        playlistTracks,
        numberOfCards
      );

      setCards(generatedCards);
      setActiveCardIndex(0);
      setMarkedSongKeys(new Set());
      previouslyWinningCardIds.current = new Set();
      setWinningNoticeCardId(null);
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Unable to generate cards."
      );
    }
  }

  function toggleTrack(track: Track) {
    const trackKey = getTrackKey(track);

    setMarkedSongKeys((current) => {
      const next = new Set(current);

      if (next.has(trackKey)) {
        next.delete(trackKey);
      } else {
        next.add(trackKey);
      }

      return next;
    });
  }

  function resetAllMarks() {
    setMarkedSongKeys(new Set());
    previouslyWinningCardIds.current = new Set();
    setWinningNoticeCardId(null);
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
          width: "min(100%, 950px)",
          margin: "0 auto",
        }}
      >
        {winningNoticeCardId !== null && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bingo-title"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "grid",
              placeItems: "center",
              padding: "24px",
              background: "rgba(2, 6, 23, 0.88)",
              backdropFilter: "blur(8px)",
            }}
          >
            <section
              style={{
                width: "min(100%, 520px)",
                boxSizing: "border-box",
                padding: "36px",
                borderRadius: "26px",
                textAlign: "center",
                background:
                  "linear-gradient(145deg, rgba(77,124,15,.98), rgba(15,23,42,.98))",
                border: "2px solid #bef264",
                boxShadow:
                  "0 30px 100px rgba(163,230,53,.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: "18px",
                }}
              >
                <Image
                  src="/logo.png"
                  alt="Bingo to the Beats"
                  width={140}
                  height={140}
                  priority
                  style={{
                    width: "140px",
                    height: "auto",
                  }}
                />
              </div>

              <h2
                id="bingo-title"
                style={{
                  margin: "12px 0 0",
                  color: "#ecfccb",
                  fontSize: "clamp(44px, 9vw, 72px)",
                }}
              >
                BINGO!
              </h2>

              <p
                style={{
                  margin: "16px 0 0",
                  color: "#d9f99d",
                  fontSize: "22px",
                  fontWeight: 900,
                }}
              >
                Card {winningNoticeCardId} has a winning pattern.
              </p>

              <p
                style={{
                  margin: "10px 0 0",
                  color: "#bef264",
                  fontWeight: 800,
                }}
              >
                {formatWinningPattern(winningPattern)}
              </p>

              <p
                style={{
                  margin: "12px auto 0",
                  maxWidth: "390px",
                  color: "#e2e8f0",
                  lineHeight: 1.6,
                }}
              >
                You received Bingo even though you may have been
                viewing another card.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: "12px",
                  marginTop: "28px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const winningIndex = cards.findIndex(
                      (card) => card.id === winningNoticeCardId
                    );

                    if (winningIndex >= 0) {
                      setActiveCardIndex(winningIndex);
                    }

                    setWinningNoticeCardId(null);
                  }}
                  style={{
                    padding: "15px 18px",
                    border: 0,
                    borderRadius: "999px",
                    background: "#a3e635",
                    color: "#172554",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  View Winning Card
                </button>

                <button
                  type="button"
                  onClick={() => setWinningNoticeCardId(null)}
                  style={{
                    padding: "15px 18px",
                    borderRadius: "999px",
                    border: "1px solid #d9f99d",
                    background: "transparent",
                    color: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Keep Playing
                </button>
              </div>
            </section>
          </div>
        )}

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
            Player Bingo Cards
          </h1>

          <p
            style={{
              margin: "18px auto 0",
              maxWidth: "680px",
              color: "#cbd5e1",
              fontSize: "18px",
              lineHeight: 1.7,
            }}
          >
            Generate multiple cards for one player. Selecting a song
            marks the same title and artist on every matching card.
          </p>
        </header>

        <section
          style={{
            marginTop: "32px",
            padding: "26px",
            borderRadius: "22px",
            background: "rgba(15, 23, 42, 0.94)",
            border: "1px solid #334155",
          }}
        >
          <div
            style={{
              marginBottom: "18px",
              padding: "18px",
              borderRadius: "16px",
              background:
                playlistSource === "uploaded"
                  ? "rgba(56, 189, 248, 0.12)"
                  : "rgba(251, 191, 36, 0.12)",
              border:
                playlistSource === "uploaded"
                  ? "1px solid rgba(56, 189, 248, 0.38)"
                  : "1px solid rgba(251, 191, 36, 0.38)",
            }}
          >
            <strong
              style={{
                display: "block",
                color:
                  playlistSource === "uploaded"
                    ? "#7dd3fc"
                    : "#fde68a",
              }}
            >
              {playlistSource === "uploaded"
                ? "Uploaded Playlist Loaded"
                : "Using Sample Playlist"}
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "6px",
                color: "#cbd5e1",
                fontSize: "14px",
              }}
            >
              {playlistTracks.length} unique tracks available
            </span>

            {playlistSource === "sample" && (
              <Link
                href="/music/upload"
                style={{
                  display: "inline-block",
                  marginTop: "10px",
                  color: "#fde68a",
                  fontWeight: 900,
                  textDecoration: "none",
                }}
              >
                Upload a real playlist →
              </Link>
            )}
          </div>

          <div
            style={{
              marginBottom: "22px",
              padding: "16px",
              borderRadius: "16px",
              background: "rgba(167, 139, 250, 0.12)",
              border:
                "1px solid rgba(167, 139, 250, 0.35)",
            }}
          >
            <strong
              style={{
                color: "#ddd6fe",
              }}
            >
              Winning pattern
            </strong>

            <p
              style={{
                margin: "7px 0 0",
                color: "#cbd5e1",
              }}
            >
              {formatWinningPattern(winningPattern)}
            </p>
          </div>

          <label
            htmlFor="numberOfCards"
            style={{
              display: "block",
              fontWeight: 900,
            }}
          >
            Number of cards for this player
          </label>

          <input
            id="numberOfCards"
            type="number"
            min="1"
            max="10"
            value={numberOfCards}
            onChange={(event) => {
              const value = Number(event.target.value);

              setNumberOfCards(
                Number.isFinite(value)
                  ? Math.min(
                      10,
                      Math.max(1, Math.floor(value))
                    )
                  : 1
              );
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
              padding: "16px",
              borderRadius: "14px",
              border: "1px solid #475569",
              background: "#020617",
              color: "white",
              fontSize: "24px",
              fontWeight: 900,
              textAlign: "center",
            }}
          />

          <button
            type="button"
            onClick={handleGenerateCards}
            style={{
              width: "100%",
              marginTop: "18px",
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
            Generate {numberOfCards}{" "}
            {numberOfCards === 1 ? "Card" : "Cards"}
          </button>

          {generationError && (
            <p
              style={{
                margin: "16px 0 0",
                color: "#fda4af",
                textAlign: "center",
                fontWeight: 800,
              }}
            >
              {generationError}
            </p>
          )}
        </section>

        {cards.length > 0 && activeCard && (
          <>
            <section
              style={{
                marginTop: "28px",
                padding: "22px",
                borderRadius: "20px",
                background: "rgba(15, 23, 42, 0.94)",
                border: "1px solid #334155",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#94a3b8",
                  fontSize: "14px",
                }}
              >
                Select a card
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "14px",
                  paddingBottom: "5px",
                  overflowX: "auto",
                }}
              >
                {cards.map((card, index) => {
                  const isActive = activeCardIndex === index;
                  const isWinner = winningCardIds.includes(card.id);

                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setActiveCardIndex(index)}
                      style={{
                        flex: "0 0 auto",
                        padding: "12px 18px",
                        borderRadius: "999px",
                        border: isActive
                          ? "1px solid #a78bfa"
                          : "1px solid #475569",
                        background: isWinner
                          ? "rgba(163, 230, 53, 0.2)"
                          : isActive
                            ? "rgba(167, 139, 250, 0.2)"
                            : "transparent",
                        color: isWinner ? "#bef264" : "white",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      Card {card.id}
                      {isWinner ? " — BINGO!" : ""}
                    </button>
                  );
                })}
              </div>
            </section>

            {winningCardIds.length > 0 && (
              <section
                style={{
                  marginTop: "24px",
                  padding: "22px",
                  textAlign: "center",
                  borderRadius: "20px",
                  background: "rgba(163, 230, 53, 0.14)",
                  border:
                    "1px solid rgba(163, 230, 53, 0.5)",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    color: "#bef264",
                    fontSize: "34px",
                  }}
                >
                  BINGO!
                </h2>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#d9f99d",
                    fontWeight: 800,
                  }}
                >
                  Winning{" "}
                  {winningCardIds.length === 1
                    ? "card"
                    : "cards"}
                  :{" "}
                  {winningCardIds
                    .map((cardId) => `Card ${cardId}`)
                    .join(", ")}
                </p>
              </section>
            )}

            <section
              style={{
                marginTop: "24px",
                padding: "24px",
                borderRadius: "22px",
                background: "rgba(15, 23, 42, 0.94)",
                border: "1px solid #334155",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "14px",
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>
                    Card {activeCard.id} of {cards.length}
                  </h2>

                  <p
                    style={{
                      margin: "8px 0 0",
                      color: "#94a3b8",
                    }}
                  >
                    {markedCountOnActiveCard} of 25 squares marked
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetAllMarks}
                  style={{
                    padding: "11px 17px",
                    borderRadius: "999px",
                    border: "1px solid #64748b",
                    background: "transparent",
                    color: "white",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Reset All Cards
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(5, minmax(0, 1fr))",
                  aspectRatio: "1 / 1",
                  marginTop: "24px",
                  border: "3px solid #a78bfa",
                  background: "#020617",
                }}
              >
                {activeCard.tracks.map((track, index) => {
                  const trackKey = getTrackKey(track);
                  const isMarked = markedSongKeys.has(trackKey);

                  return (
                    <button
                      key={`${activeCard.id}-${trackKey}-${index}`}
                      type="button"
                      onClick={() => toggleTrack(track)}
                      aria-pressed={isMarked}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        minWidth: 0,
                        padding: "7px",
                        border: "1px solid #475569",
                        background: isMarked
                          ? "linear-gradient(145deg, #84cc16, #4d7c0f)"
                          : "#020617",
                        color: "white",
                        textAlign: "center",
                        overflow: "hidden",
                        cursor: "pointer",
                      }}
                    >
                      <strong
                        style={{
                          fontSize:
                            "clamp(8px, 1.3vw, 14px)",
                          lineHeight: 1.15,
                        }}
                      >
                        {track.title}
                      </strong>

                      <span
                        style={{
                          marginTop: "5px",
                          color: isMarked
                            ? "#ecfccb"
                            : "#cbd5e1",
                          fontSize:
                            "clamp(7px, 1vw, 11px)",
                          lineHeight: 1.15,
                        }}
                      >
                        {track.artist}
                      </span>

                      {isMarked && (
                        <span
                          style={{
                            marginTop: "5px",
                            fontSize: "14px",
                            fontWeight: 900,
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginTop: "20px",
                }}
              >
                <button
                  type="button"
                  disabled={activeCardIndex === 0}
                  onClick={() =>
                    setActiveCardIndex((current) =>
                      Math.max(0, current - 1)
                    )
                  }
                  style={{
                    ...navigationButtonStyle,
                    opacity:
                      activeCardIndex === 0 ? 0.45 : 1,
                  }}
                >
                  ← Previous Card
                </button>

                <button
                  type="button"
                  disabled={
                    activeCardIndex === cards.length - 1
                  }
                  onClick={() =>
                    setActiveCardIndex((current) =>
                      Math.min(
                        cards.length - 1,
                        current + 1
                      )
                    )
                  }
                  style={{
                    ...navigationButtonStyle,
                    opacity:
                      activeCardIndex === cards.length - 1
                        ? 0.45
                        : 1,
                  }}
                >
                  Next Card →
                </button>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

const navigationButtonStyle = {
  padding: "14px 18px",
  borderRadius: "999px",
  border: "1px solid #64748b",
  background: "transparent",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};