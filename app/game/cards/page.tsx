"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import GameAccessPanel from "../../../components/game/GameAccessPanel";
import PlayerBingoClaimPanel from "@/components/game/PlayerBingoClaimPanel";
// BTTB_BINGO_VERIFICATION_V1

type WinningPattern =
  | "single-line"
  | "four-corners"
  | "x-pattern"
  | "full-card"
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "blackout";

type CardSquare = {
  squareIndex: number;
  row: number;
  column: number;
  trackId: string;
  gameTrackId: string;
  title: string;
  artist: string;
  marked: boolean;
  markedAt: string | null;
};

type PlayerCard = {
  id: string;
  cardNumber: number;
  gameId: string;
  rows: number;
  columns: number;
  squareCount: number;
  signature: string;
  squares: CardSquare[];
  createdAt: string;
};

type PlayerSession = {
  player: {
    playerId: string;
    playerName: string;
    gameId: string;
    joinCode: string;
    purchaseId: string;
    cardIds: string[];
    cardQuantity: number;
    amountCents: number;
    joinedAt: string;
  };
  game: {
    id: string;
    joinCode: string;
    playlistName: string;
    status: string;
    bingoPattern: WinningPattern;
    playlistTrackCount: number;
  };
  cards?: PlayerCard[];
  card?: PlayerCard;
  pricing?: {
    quantity: number;
    amountCents: number;
  };
  availability?: {
    totalCards: number;
    assignedCards: number;
    remainingCards: number;
  };
  joinedAt: string;
};

type SelectedSongKeys = string[];

/*
 * BTTB_PLAYER_CARD_SONG_SEARCH_V1
 *
 * Search only the songs that actually appear in this player's
 * assigned bingo cards. One result represents a song across all
 * cards that contain it.
 */
type CardSongSearchResult = {
  songKey: string;
  title: string;
  artist: string;
  square: CardSquare;
  cardIndexes: number[];
  cardNumbers: number[];
};

const PLAYER_ID_KEY = "bttb-v2-player-id";
const PLAYER_SESSION_KEY = "bttb-v2-player-session";
const PLAYER_PRESENCE_ENDPOINT =
  "/api/game/player/heartbeat";
const PLAYER_HEARTBEAT_INTERVAL_MS = 10_000;
const LEGACY_MARKS_KEYS = [
  "bttb-v2-player-selected-songs",
  "bttb-v2-player-selected-tracks",
  "bttb-v2-player-card-marks",
];

function getMarksStorageKey(
  gameId: string,
  playerId: string
) {
  return `bttb-v2-player-selected-songs:${gameId}:${playerId}`;
}


function sendPresenceRequest(
  gameId: string,
  playerId: string,
  connected: boolean
) {
  const body = JSON.stringify({
    gameId,
    playerId,
    connected,
  });

  return fetch(PLAYER_PRESENCE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
    keepalive: true,
  });
}

function sendPresenceBeacon(
  gameId: string,
  playerId: string,
  connected: boolean
) {
  const body = JSON.stringify({
    gameId,
    playerId,
    connected,
  });

  const blob = new Blob([body], {
    type: "application/json",
  });

  navigator.sendBeacon(
    PLAYER_PRESENCE_ENDPOINT,
    blob
  );
}

function formatWinningPattern(pattern: WinningPattern) {
  switch (pattern) {
    case "four-corners":
      return "Four Corners";
    case "x-pattern":
      return "X Pattern";
    case "full-card":
    case "blackout":
      return "Blackout";
    case "across":
      return "Across Only";
    case "down":
      return "Down Only";
    case "diagonal":
      return "Diagonal Only";
    case "single-line":
    case "any-line":
    default:
      return "Any 5 in a Row";
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function hasWinningPattern(
  card: PlayerCard,
  markedIndexes: Set<number>,
  pattern: WinningPattern
) {
  const rows = Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, column) => row * 5 + column)
  );

  const columns = Array.from({ length: 5 }, (_, column) =>
    Array.from({ length: 5 }, (_, row) => row * 5 + column)
  );

  const diagonals = [
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];

  const complete = (indexes: number[]) =>
    indexes.every((index) => markedIndexes.has(index));

  switch (pattern) {
    case "four-corners":
      return complete([0, 4, 20, 24]);
    case "x-pattern":
      return diagonals.every(complete);
    case "full-card":
    case "blackout":
      return card.squares.every((square) =>
        markedIndexes.has(square.squareIndex)
      );
    case "across":
      return rows.some(complete);
    case "down":
      return columns.some(complete);
    case "diagonal":
      return diagonals.some(complete);
    case "single-line":
    case "any-line":
    default:
      return [...rows, ...columns, ...diagonals].some(complete);
  }
}

function normalizeSongPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u0000/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSongKey(square: CardSquare): string {
  const title = normalizeSongPart(square.title);
  const artist = normalizeSongPart(square.artist);

  if (title || artist) {
    return `${title}::${artist}`;
  }

  return square.trackId || square.gameTrackId;
}

function readSelectedSongKeys(storageKey: string): string[] {
  try {
    const saved = localStorage.getItem(storageKey);

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string =>
            typeof value === "string"
        )
      : [];
  } catch {
    return [];
  }
}

export default function CardsPage() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [selectedSongKeys, setSelectedSongKeys] = useState<string[]>([]);
  const [songSearch, setSongSearch] = useState("");
  const [marksStorageKey, setMarksStorageKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [
    playerSessionChanged,
    setPlayerSessionChanged,
  ] = useState(false);
  const [winningCardId, setWinningCardId] = useState<string | null>(
    null
  );
  // BTTB_BINGO_PLAYED_LOCK_V1
  const [
    calledGameTrackIds,
    setCalledGameTrackIds,
  ] = useState<string[]>([]);
  const [
    calledTrackIds,
    setCalledTrackIds,
  ] = useState<string[]>([]);
  const [
    playedSongsLoaded,
    setPlayedSongsLoaded,
  ] = useState(false);
  // BTTB_BINGO_RETURN_TO_CARDS_V2
  const [
    dismissedWinningCardIds,
    setDismissedWinningCardIds,
  ] = useState<string[]>([]);

  useEffect(() => {
    try {
      const savedSession = localStorage.getItem(PLAYER_SESSION_KEY);

      if (!savedSession) {
        setLoaded(true);
        return;
      }

      const parsed = JSON.parse(savedSession) as PlayerSession;

      if (
        !parsed.player?.playerId ||
        !parsed.game?.id ||
        parsed.player.gameId !== parsed.game.id
      ) {
        throw new Error("The saved player session is invalid.");
      }

      const storageKey = getMarksStorageKey(
        parsed.game.id,
        parsed.player.playerId
      );

      setSession(parsed);
      setMarksStorageKey(storageKey);
      setSelectedSongKeys(
        readSelectedSongKeys(storageKey)
      );

      for (const key of LEGACY_MARKS_KEYS) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(
      PLAYER_ID_KEY
    );

    localStorage.removeItem(
      PLAYER_SESSION_KEY
    );

      for (const key of LEGACY_MARKS_KEYS) {
        localStorage.removeItem(key);
      }
    } finally {
      setLoaded(true);
    }
  }, []);


  useEffect(() => {
    if (
      !session?.game.id ||
      !session.player.playerId ||
      gameEnded
    ) {
      return;
    }

    const gameId = session.game.id;
    const playerId = session.player.playerId;

    let heartbeat:
      | number
      | null = null;

    const markOnline = () => {
      void sendPresenceRequest(
        gameId,
        playerId,
        true
      )
        .then(async (response) => {
          if (response.status === 403) {
            setPlayerSessionChanged(true);

            if (heartbeat !== null) {
              window.clearInterval(
                heartbeat
              );
              heartbeat = null;
            }

            return;
          }

          if (!response.ok) {
            return;
          }

          const data =
            (await response.json()) as {
              gameStatus?: string;
            };

          if (
            data.gameStatus ===
            "COMPLETED"
          ) {
            setGameEnded(true);
          }
        })
        .catch(() => undefined);
    };

    const markOffline = () => {
      sendPresenceBeacon(
        gameId,
        playerId,
        false
      );
    };

    markOnline();

    heartbeat = window.setInterval(
      markOnline,
      PLAYER_HEARTBEAT_INTERVAL_MS
    );

    window.addEventListener(
      "pagehide",
      markOffline
    );

    return () => {
      if (heartbeat !== null) {
        window.clearInterval(
          heartbeat
        );
      }

      window.removeEventListener(
        "pagehide",
        markOffline
      );
    };
  }, [session, gameEnded]);

  const cards = useMemo(() => {
    if (!session) return [];

    if (Array.isArray(session.cards) && session.cards.length > 0) {
      return session.cards;
    }

    return session.card ? [session.card] : [];
  }, [session]);

  const activeCard = cards[activeCardIndex] ?? null;

  const calledGameTrackIdSet = useMemo(
    () => new Set(calledGameTrackIds),
    [calledGameTrackIds]
  );

  const calledTrackIdSet = useMemo(
    () => new Set(calledTrackIds),
    [calledTrackIds]
  );

  function isSquarePlayed(
    square: CardSquare
  ) {
    return (
      calledGameTrackIdSet.has(
        square.gameTrackId
      ) ||
      calledTrackIdSet.has(
        square.trackId
      )
    );
  }

  useEffect(() => {
    // BTTB_BINGO_GAMEID_TYPE_FIX_V1
    const gameId: string =
      session?.game?.id ?? "";

    if (!gameId) {
      setCalledGameTrackIds([]);
      setCalledTrackIds([]);
      setPlayedSongsLoaded(false);
      return;
    }

    if (gameEnded) {
      return;
    }

    let cancelled = false;

    async function refreshPlayedSongs() {
      try {
        const response = await fetch(
          `/api/game/${encodeURIComponent(
            gameId
          )}/called-tracks`,
          {
            cache: "no-store",
          }
        );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.ok ||
          cancelled
        ) {
          return;
        }

        setCalledGameTrackIds(
          Array.isArray(
            data.calledGameTrackIds
          )
            ? data.calledGameTrackIds
            : []
        );

        setCalledTrackIds(
          Array.isArray(
            data.calledTrackIds
          )
            ? data.calledTrackIds
            : []
        );

        setPlayedSongsLoaded(true);
      } catch {
        // Keep the last known played-song state.
      }
    }

    void refreshPlayedSongs();

    const interval =
      window.setInterval(
        () => {
          if (!document.hidden) {
            void refreshPlayedSongs();
          }
        },
        1000
      );

    return () => {
      cancelled = true;
      window.clearInterval(
        interval
      );
    };
  }, [session?.game?.id, gameEnded]);


  const normalizedSongSearch =
    normalizeSongPart(songSearch);

  const cardSongSearchResults =
    useMemo<CardSongSearchResult[]>(() => {
      if (!normalizedSongSearch) {
        return [];
      }

      const matches =
        new Map<
          string,
          CardSongSearchResult
        >();

      cards.forEach(
        (card, cardIndex) => {
          card.squares.forEach(
            (square) => {
              const normalizedTitle =
                normalizeSongPart(
                  square.title
                );

              if (
                !normalizedTitle.includes(
                  normalizedSongSearch
                )
              ) {
                return;
              }

              const songKey =
                getSongKey(square);

              const existing =
                matches.get(songKey);

              if (existing) {
                if (
                  !existing.cardIndexes.includes(
                    cardIndex
                  )
                ) {
                  existing.cardIndexes.push(
                    cardIndex
                  );
                }

                if (
                  !existing.cardNumbers.includes(
                    card.cardNumber
                  )
                ) {
                  existing.cardNumbers.push(
                    card.cardNumber
                  );
                }

                return;
              }

              matches.set(
                songKey,
                {
                  songKey,
                  title:
                    square.title ||
                    "Unknown Song",
                  artist:
                    square.artist ||
                    "Unknown Artist",
                  square,
                  cardIndexes: [
                    cardIndex,
                  ],
                  cardNumbers: [
                    card.cardNumber,
                  ],
                }
              );
            }
          );
        }
      );

      return Array.from(
        matches.values()
      ).sort((left, right) => {
        const leftTitle =
          normalizeSongPart(
            left.title
          );

        const rightTitle =
          normalizeSongPart(
            right.title
          );

        const leftStarts =
          leftTitle.startsWith(
            normalizedSongSearch
          )
            ? 0
            : 1;

        const rightStarts =
          rightTitle.startsWith(
            normalizedSongSearch
          )
            ? 0
            : 1;

        if (
          leftStarts !==
          rightStarts
        ) {
          return (
            leftStarts -
            rightStarts
          );
        }

        return left.title.localeCompare(
          right.title
        );
      });
    }, [
      cards,
      normalizedSongSearch,
    ]);

  const selectedSongKeySet = useMemo(
    () => new Set(selectedSongKeys),
    [selectedSongKeys]
  );

  const activeMarks = useMemo(() => {
    if (!activeCard) {
      return new Set<number>();
    }

    return new Set(
      activeCard.squares
        .filter(
          (square) =>
            isSquarePlayed(square) &&
            (
              square.marked ||
              selectedSongKeySet.has(getSongKey(square))
            )
        )
        .map((square) => square.squareIndex)
    );
  }, [
    activeCard,
    selectedSongKeySet,
    calledGameTrackIds,
    calledTrackIds,
  ]);

  const winningCardIds = useMemo(() => {
    if (!session) return [];

    return cards
      .filter((card) => {
        const cardMarks = new Set(
          card.squares
            .filter(
              (square) =>
                isSquarePlayed(square) &&
                (
                  square.marked ||
                  selectedSongKeySet.has(getSongKey(square))
                )
            )
            .map((square) => square.squareIndex)
        );

        return hasWinningPattern(
          card,
          cardMarks,
          session.game.bingoPattern
        );
      })
      .map((card) => card.id);
  }, [
    cards,
    selectedSongKeySet,
    session,
    calledGameTrackIds,
    calledTrackIds,
  ]);

  useEffect(() => {
    if (
      activeCard &&
      winningCardIds.includes(activeCard.id) &&
      winningCardId !== activeCard.id &&
      !dismissedWinningCardIds.includes(activeCard.id)
    ) {
      setWinningCardId(activeCard.id);
    }
  }, [
    activeCard,
    dismissedWinningCardIds,
    winningCardId,
    winningCardIds,
  ]);

  /*
   * If a card stops satisfying the winning pattern, remove its
   * dismissal. If that same card earns BINGO again later, the
   * BINGO screen is allowed to appear again.
   */
  useEffect(() => {
    setDismissedWinningCardIds((current) =>
      current.filter((cardId) =>
        winningCardIds.includes(cardId)
      )
    );
  }, [winningCardIds]);

  function closeWinningCard() {
    if (winningCardId) {
      setDismissedWinningCardIds((current) =>
        current.includes(winningCardId)
          ? current
          : [...current, winningCardId]
      );
    }

    setWinningCardId(null);
  }

  function saveSelectedSongKeys(nextSongKeys: string[]) {
    setSelectedSongKeys(nextSongKeys);

    if (!marksStorageKey) {
      return;
    }

    localStorage.setItem(
      marksStorageKey,
      JSON.stringify(nextSongKeys)
    );
  }

  function toggleSong(square: CardSquare) {
    const songKey = getSongKey(square);
    const current = new Set(selectedSongKeys);

    if (current.has(songKey)) {
      current.delete(songKey);
      saveSelectedSongKeys(Array.from(current));
      return;
    }

    if (
      !playedSongsLoaded ||
      !isSquarePlayed(square)
    ) {
      window.alert(
        "That song has not been played yet. You can only mark songs after the DJ plays them."
      );
      return;
    }

    current.add(songKey);
    saveSelectedSongKeys(Array.from(current));
  }

  function selectSongSearchResult(
    result: CardSongSearchResult
  ) {
    toggleSong(result.square);

    const firstCardIndex =
      result.cardIndexes[0];

    if (
      typeof firstCardIndex ===
      "number"
    ) {
      setActiveCardIndex(
        firstCardIndex
      );
    }
  }

  useEffect(() => {
    if (
      !playedSongsLoaded ||
      cards.length === 0 ||
      selectedSongKeys.length === 0
    ) {
      return;
    }

    const allowedKeys =
      new Set<string>();

    cards.forEach((card) => {
      card.squares.forEach(
        (square) => {
          if (
            isSquarePlayed(square)
          ) {
            allowedKeys.add(
              getSongKey(square)
            );
          }
        }
      );
    });

    const filtered =
      selectedSongKeys.filter(
        (key) =>
          allowedKeys.has(key)
      );

    if (
      filtered.length !==
      selectedSongKeys.length
    ) {
      saveSelectedSongKeys(
        filtered
      );
    }
  }, [
    playedSongsLoaded,
    calledGameTrackIds,
    calledTrackIds,
    cards,
    selectedSongKeys,
  ]);

  function clearAllCards() {
    saveSelectedSongKeys([]);
    setWinningCardId(null);
    setDismissedWinningCardIds([]);
  }

  function leaveGame() {
    if (session) {
      sendPresenceBeacon(
        session.game.id,
        session.player.playerId,
        false
      );
    }

    localStorage.removeItem(PLAYER_SESSION_KEY);

    if (marksStorageKey) {
      localStorage.removeItem(marksStorageKey);
    }

    for (const key of LEGACY_MARKS_KEYS) {
      localStorage.removeItem(key);
    }

    window.location.replace("/join");
  }

  if (!loaded) {
    return (
      <main style={centeredPageStyle}>
        <p>Loading your bingo cards...</p>
      </main>
    );
  }

  if (!session || cards.length === 0) {
    return (
      <main style={centeredPageStyle}>
        <section style={emptyCardStyle}>
          <p style={eyebrowStyle}>Bingo to the Beats</p>
          <h1 style={{ margin: "8px 0 0", fontSize: "42px" }}>
            No Cards Assigned
          </h1>
          <p style={mutedTextStyle}>
            Join an active game and choose a card package first.
          </p>
          <Link href="/join" style={primaryLinkStyle}>
            Join a Game
          </Link>
        </section>
      </main>
    );
  }

  if (playerSessionChanged) {
    return (
      <main style={centeredPageStyle}>
        <section
          style={{
            ...emptyCardStyle,
            maxWidth: "620px",
          }}
        >
          <div
            style={{
              fontSize: "64px",
              lineHeight: 1,
            }}
          >
            ↻
          </div>

          <p
            style={{
              ...eyebrowStyle,
              marginTop: "22px",
            }}
          >
            Bingo to the Beats
          </p>

          <h1
            style={{
              margin: "8px 0 0",
              fontSize: "36px",
            }}
          >
            Player Session Changed
          </h1>

          <p style={mutedTextStyle}>
            This browser is now using a different player
            session. Rejoin the game to continue with the
            current player.
          </p>

          <Link
            href="/join"
            style={primaryLinkStyle}
          >
            Return to Join Page
          </Link>
        </section>
      </main>
    );
  }

  if (gameEnded) {
    return (
      <main style={centeredPageStyle}>
        <section
          style={{
            ...emptyCardStyle,
            maxWidth: "620px",
          }}
        >
          <div
            style={{
              fontSize: "72px",
              lineHeight: 1,
            }}
          >
            🎵
          </div>

          <p
            style={{
              ...eyebrowStyle,
              marginTop: "22px",
            }}
          >
            Bingo to the Beats
          </p>

          <h1
            style={{
              margin: "10px 0 0",
              fontSize: "clamp(42px, 10vw, 68px)",
            }}
          >
            Game Ended
          </h1>

          <p
            style={{
              ...mutedTextStyle,
              fontSize: "18px",
            }}
          >
            Thanks for playing!
          </p>

          <p
            style={{
              ...mutedTextStyle,
              marginTop: "8px",
            }}
          >
            {session.game.playlistName}
          </p>

          <button
            type="button"
            onClick={leaveGame}
            style={{
              ...primaryActionStyle,
              width: "100%",
              marginTop: "28px",
              cursor: "pointer",
            }}
          >
            Return to Join Screen
          </button>
        </section>
      </main>
    );
  }

  const { player, game, pricing, availability } = session;
  const winningCard = cards.find(
    (card) => card.id === winningCardId
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px 16px 70px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {winningCard && (
        <div style={modalOverlayStyle}>
          <section style={bingoModalStyle}>
            <div style={{ fontSize: "68px" }}>🎉</div>
            <p style={eyebrowStyle}>Winning Pattern Complete</p>
            <h2
              style={{
                margin: "8px 0 0",
                color: "#ecfccb",
                fontSize: "clamp(48px, 10vw, 76px)",
              }}
            >
              BINGO!
            </h2>
            <p
              style={{
                margin: "14px 0 0",
                color: "#d9f99d",
                fontSize: "20px",
                fontWeight: 900,
              }}
            >
              Card #{winningCard.cardNumber}
            </p>
            <PlayerBingoClaimPanel
              gameId={game.id}
              playerId={player.playerId}
              playerName={player.playerName}
              cardId={winningCard.id}
              cardNumber={winningCard.cardNumber}
              onClose={closeWinningCard}
            />
          </section>
        </div>
      )}

      <section
        style={{
          width: "min(100%, 980px)",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "18px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={eyebrowStyle}>Bingo to the Beats</p>
            <h1
              style={{
                margin: "7px 0 0",
                fontSize: "clamp(34px, 7vw, 56px)",
              }}
            >
              {player.playerName}&apos;s Cards
            </h1>
            <p style={{ margin: "10px 0 0", color: "#cbd5e1" }}>
              {game.playlistName}
            </p>
          </div>

          <div style={codeBadgeStyle}>
            <span style={codeLabelStyle}>Game Code</span>
            <strong style={codeValueStyle}>{game.joinCode}</strong>
          </div>
        </header>

        <div style={{ marginTop: "22px" }}>
          <GameAccessPanel
            joinCode={game.joinCode}
            title="Invite Another Player"
            compact
          />
        </div>

        <section style={summaryPanelStyle}>
          <div>
            <span style={summaryLabelStyle}>Cards Purchased</span>
            <strong style={summaryValueStyle}>{cards.length}</strong>
          </div>

          <div>
            <span style={summaryLabelStyle}>Package Total</span>
            <strong style={summaryValueStyle}>
              {formatMoney(
                pricing?.amountCents ??
                  player.amountCents ??
                  0
              )}
            </strong>
          </div>

          <div>
            <span style={summaryLabelStyle}>Pattern</span>
            <strong style={summaryValueStyle}>
              {formatWinningPattern(game.bingoPattern)}
            </strong>
          </div>

          {availability && (
            <div>
              <span style={summaryLabelStyle}>Cards Remaining</span>
              <strong style={summaryValueStyle}>
                {availability.remainingCards}
              </strong>
            </div>
          )}
        </section>

                <section
          style={{
            marginTop: "22px",
            padding: "18px",
            border: "1px solid rgba(167, 139, 250, 0.42)",
            borderRadius: "18px",
            background:
              "linear-gradient(145deg, rgba(76, 29, 149, 0.28), rgba(15, 23, 42, 0.95))",
          }}
        >
          <span
            style={
              summaryLabelStyle
            }
          >
            Search Your Cards
          </span>

          <p
            style={{
              margin:
                "8px 0 0",
              color:
                "#cbd5e1",
              fontSize:
                "13px",
              lineHeight:
                1.5,
            }}
          >
            Type the name of
            the song you hear.
            Only songs that are
            actually on your
            bingo cards will
            appear.
          </p>

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop:
                "12px",
            }}
          >
            <input
              type="search"
              value={songSearch}
              onChange={(event) =>
                setSongSearch(
                  event.target
                    .value
                )
              }
              placeholder="Search song name..."
              autoComplete="off"
              spellCheck={false}
              aria-label="Search songs on your bingo cards"
              style={{
                width: "100%",
                minWidth: 0,
                padding:
                  "13px 14px",
                border:
                  "1px solid #64748b",
                borderRadius:
                  "12px",
                outline:
                  "none",
                background:
                  "#020617",
                color:
                  "#ffffff",
                fontSize:
                  "16px",
              }}
            />

            {songSearch && (
              <button
                type="button"
                onClick={() =>
                  setSongSearch(
                    ""
                  )
                }
                aria-label="Clear song search"
                style={{
                  flex:
                    "0 0 auto",
                  padding:
                    "0 15px",
                  border:
                    "1px solid #475569",
                  borderRadius:
                    "12px",
                  background:
                    "#111827",
                  color:
                    "#cbd5e1",
                  fontWeight:
                    900,
                  cursor:
                    "pointer",
                }}
              >
                Clear
              </button>
            )}
          </div>

          {normalizedSongSearch && (
            <div
              style={{
                marginTop:
                  "12px",
              }}
            >
              {cardSongSearchResults.length ===
              0 ? (
                <div
                  style={{
                    padding:
                      "14px",
                    border:
                      "1px solid rgba(248, 113, 113, 0.32)",
                    borderRadius:
                      "12px",
                    background:
                      "rgba(127, 29, 29, 0.14)",
                    color:
                      "#fecaca",
                    textAlign:
                      "center",
                    fontSize:
                      "13px",
                    fontWeight:
                      800,
                  }}
                >
                  That song is
                  not on any of
                  your cards.
                </div>
              ) : (
                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "1fr",
                    gap:
                      "8px",
                  }}
                >
                  {cardSongSearchResults.map(
                    (
                      result
                    ) => {
                      const selected =
                        selectedSongKeySet.has(
                          result.songKey
                        );

                      return (
                        <button
                          key={
                            result.songKey
                          }
                          type="button"
                          onClick={() =>
                            selectSongSearchResult(
                              result
                            )
                          }
                          aria-pressed={
                            selected
                          }
                          style={{
                            width:
                              "100%",
                            display:
                              "grid",
                            gridTemplateColumns:
                              "minmax(0, 1fr) auto",
                            alignItems:
                              "center",
                            gap:
                              "12px",
                            padding:
                              "12px 14px",
                            border:
                              selected
                                ? "2px solid #a3e635"
                                : "1px solid #475569",
                            borderRadius:
                              "12px",
                            background:
                              selected
                                ? "rgba(77, 124, 15, 0.28)"
                                : "rgba(2, 6, 23, 0.82)",
                            color:
                              "white",
                            textAlign:
                              "left",
                            cursor:
                              "pointer",
                          }}
                        >
                          <span
                            style={{
                              minWidth:
                                0,
                            }}
                          >
                            <strong
                              style={{
                                display:
                                  "block",
                                overflow:
                                  "hidden",
                                textOverflow:
                                  "ellipsis",
                                whiteSpace:
                                  "nowrap",
                                fontSize:
                                  "15px",
                              }}
                            >
                              {
                                result.title
                              }
                            </strong>

                            <span
                              style={{
                                display:
                                  "block",
                                marginTop:
                                  "4px",
                                overflow:
                                  "hidden",
                                color:
                                  "#94a3b8",
                                textOverflow:
                                  "ellipsis",
                                whiteSpace:
                                  "nowrap",
                                fontSize:
                                  "12px",
                              }}
                            >
                              {
                                result.artist
                              }
                            </span>

                            <span
                              style={{
                                display:
                                  "block",
                                marginTop:
                                  "4px",
                                color:
                                  "#c4b5fd",
                                fontSize:
                                  "10px",
                                fontWeight:
                                  800,
                              }}
                            >
                              Card
                              {result.cardNumbers.length >
                              1
                                ? "s "
                                : " "}
                              {result.cardNumbers.join(
                                ", "
                              )}
                            </span>
                          </span>

                          <span
                            style={{
                              flex:
                                "0 0 auto",
                              padding:
                                "7px 10px",
                              borderRadius:
                                "999px",
                              background:
                                selected
                                  ? "#a3e635"
                                  : "rgba(124, 58, 237, 0.24)",
                              color:
                                selected
                                  ? "#172554"
                                  : "#ddd6fe",
                              fontSize:
                                "11px",
                              fontWeight:
                                900,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {selected
                              ? "✓ Selected"
                              : "Select"}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}
        </section>

<section
          style={{
            marginTop: "22px",
            padding: "18px",
            border: "1px solid #334155",
            borderRadius: "18px",
            background: "rgba(15, 23, 42, 0.94)",
          }}
        >
          <span style={summaryLabelStyle}>Select a Card</span>
          <p
            style={{
              margin: "8px 0 0",
              color: "#94a3b8",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            Marking a song marks that same song on every card
            that contains it. Only songs already played by the DJ
            can be selected.
          </p>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "13px",
              paddingBottom: "4px",
              overflowX: "auto",
            }}
          >
            {cards.map((card, index) => {
              const selected = index === activeCardIndex;
              const winner = winningCardIds.includes(card.id);

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setActiveCardIndex(index)}
                  style={{
                    flex: "0 0 auto",
                    padding: "12px 16px",
                    border: selected
                      ? "2px solid #a78bfa"
                      : "1px solid #475569",
                    borderRadius: "999px",
                    background: winner
                      ? "rgba(163, 230, 53, 0.18)"
                      : selected
                        ? "rgba(124, 58, 237, 0.18)"
                        : "#0f172a",
                    color: winner ? "#bef264" : "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Card #{card.cardNumber}
                  {winner ? " — BINGO" : ""}
                </button>
              );
            })}
          </div>
        </section>

        {activeCard && (
          <section
            style={{
              marginTop: "22px",
              padding: "18px",
              border: "1px solid #334155",
              borderRadius: "22px",
              background: "rgba(15, 23, 42, 0.95)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "14px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={eyebrowStyle}>
                  Card {activeCardIndex + 1} of {cards.length}
                </p>
                <h2 style={{ margin: "6px 0 0" }}>
                  Card #{activeCard.cardNumber}
                </h2>
                <p
                  style={{
                    margin: "7px 0 0",
                    color: "#94a3b8",
                    fontSize: "12px",
                    overflowWrap: "anywhere",
                  }}
                >
                  Unique ID: {activeCard.id}
                </p>
              </div>

              <strong style={{ color: "#c4b5fd" }}>
                {activeMarks.size} / {activeCard.squareCount} marked
              </strong>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(5, minmax(0, 1fr))",
                aspectRatio: "1 / 1",
                marginTop: "20px",
                border: "3px solid #a78bfa",
                background: "#020617",
              }}
            >
              {activeCard.squares.map((square) => {
                const isMarked = activeMarks.has(
                  square.squareIndex
                );
                const isPlayed =
                  isSquarePlayed(square);

                return (
                  <button
                    key={`${activeCard.id}-${square.squareIndex}`}
                    type="button"
                    disabled={
                      !isMarked &&
                      !isPlayed
                    }
                    onClick={() =>
                      toggleSong(square)
                    }
                    aria-pressed={isMarked}
                    title={
                      !isMarked &&
                      !isPlayed
                        ? "This song has not been played yet."
                        : undefined
                    }
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      minWidth: 0,
                      padding: "6px",
                      border: "1px solid #475569",
                      background: isMarked
                        ? "linear-gradient(145deg, #84cc16, #4d7c0f)"
                        : isPlayed
                          ? "#020617"
                          : "#111827",
                      color:
                        isMarked || isPlayed
                          ? "white"
                          : "#64748b",
                      opacity:
                        !isMarked && !isPlayed
                          ? 0.48
                          : 1,
                      overflow: "hidden",
                      textAlign: "center",
                      cursor:
                        !isMarked && !isPlayed
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <strong
                      style={{
                        fontSize: "clamp(8px, 1.6vw, 14px)",
                        lineHeight: 1.1,
                      }}
                    >
                      {square.title}
                    </strong>

                    <span
                      style={{
                        marginTop: "5px",
                        color: isMarked ? "#ecfccb" : "#cbd5e1",
                        fontSize: "clamp(7px, 1.2vw, 11px)",
                        lineHeight: 1.1,
                      }}
                    >
                      {square.artist}
                    </span>

                    {isMarked && (
                      <span
                        style={{
                          marginTop: "4px",
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
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "10px",
                marginTop: "18px",
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
                  ...secondaryActionStyle,
                  opacity: activeCardIndex === 0 ? 0.45 : 1,
                }}
              >
                ← Previous
              </button>

              <button
                type="button"
                disabled={activeCardIndex === cards.length - 1}
                onClick={() =>
                  setActiveCardIndex((current) =>
                    Math.min(cards.length - 1, current + 1)
                  )
                }
                style={{
                  ...secondaryActionStyle,
                  opacity:
                    activeCardIndex === cards.length - 1
                      ? 0.45
                      : 1,
                }}
              >
                Next →
              </button>

              <button
                type="button"
                onClick={clearAllCards}
                style={secondaryActionStyle}
              >
                Clear All Cards
              </button>

              <button
                type="button"
                disabled={!winningCardIds.includes(activeCard.id)}
                onClick={() => setWinningCardId(activeCard.id)}
                style={{
                  ...primaryActionStyle,
                  opacity: winningCardIds.includes(activeCard.id)
                    ? 1
                    : 0.45,
                  cursor: winningCardIds.includes(activeCard.id)
                    ? "pointer"
                    : "not-allowed",
                }}
              >
                Call BINGO
              </button>
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={() => {
            /* BTTB_LEAVE_GAME_CONFIRM_V1 */
            const confirmed =
              window.confirm(
                "Leave this game? Your current card selections on this device will be cleared."
              );

            if (confirmed) {
              leaveGame();
            }
          }}
          style={{
            width: "100%",
            marginTop: "18px",
            padding: "14px",
            border: "1px solid #fb7185",
            borderRadius: "999px",
            background: "rgba(244, 63, 94, 0.08)",
            color: "#fda4af",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Leave Game
        </button>
      </section>
    </main>
  );
}

const centeredPageStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background:
    "radial-gradient(circle at top, #312e81, #030712 65%)",
  color: "white",
  fontFamily: "Arial, sans-serif",
};

const emptyCardStyle = {
  width: "min(100%, 520px)",
  padding: "34px",
  border: "1px solid #334155",
  borderRadius: "24px",
  background: "rgba(15, 23, 42, 0.95)",
  textAlign: "center" as const,
};

const eyebrowStyle = {
  margin: 0,
  color: "#c4b5fd",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.15em",
  textTransform: "uppercase" as const,
};

const mutedTextStyle = {
  margin: "14px 0 0",
  color: "#cbd5e1",
  lineHeight: 1.6,
};

const primaryLinkStyle = {
  display: "inline-block",
  marginTop: "22px",
  padding: "14px 22px",
  borderRadius: "999px",
  background:
    "linear-gradient(90deg, #2563eb, #9333ea)",
  color: "white",
  textDecoration: "none",
  fontWeight: 900,
};

const codeBadgeStyle = {
  minWidth: "180px",
  padding: "14px 18px",
  border: "1px solid rgba(167, 139, 250, 0.35)",
  borderRadius: "16px",
  background: "rgba(124, 58, 237, 0.12)",
  textAlign: "center" as const,
};

const codeLabelStyle = {
  display: "block",
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
};

const codeValueStyle = {
  display: "block",
  marginTop: "5px",
  fontSize: "24px",
  letterSpacing: "0.14em",
};

const summaryPanelStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  marginTop: "22px",
  padding: "18px",
  border: "1px solid #334155",
  borderRadius: "18px",
  background: "rgba(15, 23, 42, 0.94)",
};

const summaryLabelStyle = {
  display: "block",
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
};

const summaryValueStyle = {
  display: "block",
  marginTop: "6px",
  fontSize: "18px",
};

const secondaryActionStyle = {
  padding: "13px 15px",
  border: "1px solid #64748b",
  borderRadius: "999px",
  background: "transparent",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const primaryActionStyle = {
  padding: "13px 15px",
  border: 0,
  borderRadius: "999px",
  background: "#a3e635",
  color: "#172554",
  fontWeight: 900,
};

const modalOverlayStyle = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "rgba(2, 6, 23, 0.9)",
  backdropFilter: "blur(8px)",
};

const bingoModalStyle = {
  width: "min(100%, 520px)",
  padding: "36px",
  border: "2px solid #bef264",
  borderRadius: "28px",
  background:
    "linear-gradient(145deg, rgba(77,124,15,.98), rgba(15,23,42,.98))",
  boxShadow: "0 30px 100px rgba(163,230,53,.3)",
  color: "white",
  textAlign: "center" as const,
};

const modalButtonStyle = {
  width: "100%",
  marginTop: "26px",
  padding: "15px 20px",
  border: 0,
  borderRadius: "999px",
  background: "#a3e635",
  color: "#172554",
  fontWeight: 900,
  cursor: "pointer",
};

