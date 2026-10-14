"use client";
import { patternGroups } from "@/lib/game/card-layout";
import { startPlayerSongPolling } from "@/lib/game/player-song-polling";
import BackstagePass from "@/components/game/BackstagePass";

import RehearsalPanel from "@/components/game/RehearsalPanel";
import Link from "next/link";
import { parseGamePrize, type GamePrize } from "@/lib/game/prize";
import { useEffect, useMemo, useRef, useState } from "react";

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
    prize?: GamePrize | null;
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

function formatWinningPattern(pattern: WinningPattern, size = 5) {
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
      return `Any ${size} in a Row`;
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
  return patternGroups(pattern, card.rows, card.columns).some(group =>
    group.every(index => markedIndexes.has(index) && card.squares.some(square => square.squareIndex === index))
  );
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
  const [winner, setWinner] = useState<{ playerName: string; cardNumber: number; cardId: string } | null>(null);
  const [marksReady, setMarksReady] = useState(false);
  const [marksReload, setMarksReload] = useState(0);
  const [playedSongsMessage, setPlayedSongsMessage] = useState("");
  const [marksMessage, setMarksMessage] = useState("Loading saved marks…");
  const savingMarks = useRef(false);
  const [marksSaving, setMarksSaving] = useState(false);
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [livePrize, setLivePrize] = useState<GamePrize | null | undefined>(undefined);
  const prize = livePrize === undefined ? session?.game.prize : livePrize;

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
              winner?: { cardId: string; playerName: string; cardNumber: number } | null;
            };

          if (data.winner) setWinner(data.winner);
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

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let retry: number | undefined;
    let requestInProgress = false;
    let restored = false;
    async function restoreMarks() {
      if (cancelled || requestInProgress || restored) return;
      requestInProgress = true;
      window.clearTimeout(retry);
      setMarksMessage("Loading saved marks…");
      try {
        const response = await fetch(`/api/game/player/marks?gameId=${encodeURIComponent(session!.game.id)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (!cancelled) setMarksMessage("Your player session needs to be restored. Rejoin using the same name and game code.");
            return;
          }
          throw new Error(data.message);
        }
        if (!Array.isArray(data.marks)) throw new Error("Invalid saved marks response.");
        if (cancelled) return;
        const saved = new Set<string>();
        for (const card of cards) for (const square of card.squares) {
          if (data.marks.some((mark: { cardId: string; position: number }) => mark.cardId === card.id && mark.position === square.squareIndex)) saved.add(getSongKey(square));
        }
        // Preserve legacy browser selections on this device during the transition.
        const storageKey = getMarksStorageKey(session!.game.id, session!.player.playerId);
        let migrated = false;
        try { migrated = localStorage.getItem(`${storageKey}:server-saved`) === "true"; } catch { /* Server marks remain available. */ }
        const local = migrated ? [] : readSelectedSongKeys(storageKey);
        const keys = Array.from(new Set([...saved, ...local]));
        setSelectedSongKeys(keys);
        restored = true;
        setMarksReady(true);
        setMarksMessage("");
        if (data.winner) setWinner(data.winner);
        if (["COMPLETED", "CANCELLED"].includes(data.gameStatus)) setGameEnded(true);
      } catch {
        if (!cancelled) {
          setMarksMessage("Reconnecting to your saved marks… Retrying automatically.");
          retry = window.setTimeout(() => { void restoreMarks(); }, 3000);
        }
      } finally { requestInProgress = false; }
    }
    const wake = () => { if (!document.hidden) void restoreMarks(); };
    window.addEventListener("online", wake);
    void restoreMarks();
    return () => { cancelled = true; window.clearTimeout(retry); window.removeEventListener("online", wake); };
  }, [session, cards, marksReload]);

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

    return startPlayerSongPolling(gameId, (data) => {
      setCalledGameTrackIds(data.calledGameTrackIds ?? []);
      setCalledTrackIds(data.calledTrackIds ?? []);
      setPlayedSongsLoaded(true);
      setPlayedSongsMessage("");
      if (data.winner) setWinner(data.winner);
      if (["COMPLETED", "CANCELLED"].includes(data.gameStatus ?? "")) setGameEnded(true);
      setLivePrize(parseGamePrize(data.prize));
    }, () => {
      setPlayedSongsMessage("Reconnecting to played songs… Your saved marks are safe. Updates will retry automatically.");
    });
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

  async function saveSelectedSongKeys(nextSongKeys: string[]) {
    if (!session || !marksReady || gameEnded || savingMarks.current) return;
    savingMarks.current = true;
    setMarksSaving(true);
    setMarksMessage("Saving marks…");
    try {
      const selected = new Set(nextSongKeys);
      const marks = cards.flatMap((card) => card.squares.filter((square) => selected.has(getSongKey(square)) && isSquarePlayed(square)).map((square) => ({ cardId: card.id, position: square.squareIndex })));
      const response = await fetch("/api/game/player/marks", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ gameId: session.game.id, marks }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) setGameEnded(true);
        throw new Error(data.message || "Could not save marks. Please tap the song again.");
      }
      if (data.winner) setWinner(data.winner);
      if (["COMPLETED", "CANCELLED"].includes(data.gameStatus)) setGameEnded(true);
      setSelectedSongKeys(nextSongKeys);
      try {
        localStorage.setItem(marksStorageKey, JSON.stringify(nextSongKeys));
        localStorage.setItem(`${marksStorageKey}:server-saved`, "true");
      } catch { /* Database save succeeded. */ }
      setMarksMessage("Marks saved");
    } catch (error) {
      setMarksMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Could not save marks. Check your connection and tap the song again.");
    } finally { savingMarks.current = false; setMarksSaving(false); }
  }

  function toggleSong(square: CardSquare) {
    if (gameEnded || !marksReady || savingMarks.current) return;
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
      setSelectedSongKeys(filtered);
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
      <main className="backstage-page" style={centeredPageStyle}>
        <p>Loading your bingo cards...</p>
      </main>
    );
  }

  if (!session || cards.length === 0) {
    return (
      <main className="backstage-page" style={centeredPageStyle}>
        <section style={emptyCardStyle}>
          <BackstagePass compact />
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

  if (playerSessionChanged && !gameEnded) {
    return (
      <main className="backstage-page" style={centeredPageStyle}>
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
      <main className="backstage-page" style={centeredPageStyle}>
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
            🏆
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
            {winner ? `${winner.playerName} wins!` : "Game Ended"}
          </h1>

          <p role="status" aria-live="polite" style={{ fontSize: "24px", fontWeight: 700 }}>
            {winner ? `BINGO! Card #${winner.cardNumber} • Game over` : "This game has ended."}
          </p>
          {prize && <p className="game-prize-display"><strong>Prize:</strong> {prize.description}</p>}
          <Link href={`/game/results?gameId=${encodeURIComponent(session.game.id)}`} style={primaryLinkStyle}>
            View game results
          </Link>

          <p
            style={{
              ...mutedTextStyle,
              marginTop: "8px",
            }}
          >
            {session.game.playlistName}
          </p>

          <p role="status">{marksMessage}</p>
          {!marksReady && <button type="button" onClick={() => setMarksReload((value) => value + 1)}>Retry loading marks</button>}
          <details style={{ textAlign: "left", marginTop: "20px" }}>
            <summary>View your final cards (locked)</summary>
            {cards.map((card) => <section key={card.id}>
              <h2>Card {card.cardNumber}</h2>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${card.columns}, minmax(0, 1fr))`, gap: "4px" }}>
                {card.squares.map((square) => {
                  const marked = selectedSongKeySet.has(getSongKey(square));
                  return <div key={square.squareIndex} style={{ padding: "8px 3px", fontSize: "11px", overflowWrap: "anywhere", background: marked ? "#166534" : "#1e293b", border: "1px solid #64748b", borderRadius: "6px" }}>
                    {marked ? "✓ " : ""}{square.title}<br />{square.artist}
                  </div>;
                })}
              </div>
            </section>)}
          </details>
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
      className="backstage-page"
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
        <RehearsalPanel key={game.id} gameId={game.id} />
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
            <BackstagePass compact />
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

        {prize && <p className="game-prize-display"><strong>Tonight’s prize:</strong> {prize.description}</p>}
        <section className="player-play-guide" aria-label="Game instructions">
          <div><span>Winning pattern</span><strong>{formatWinningPattern(game.bingoPattern, activeCard?.columns ?? 5)}</strong></div>
          <p>Tap songs after the host calls them. Marking a song updates every card that contains it.</p>
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

{cards.length > 1 && <section
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
                  aria-pressed={selected}
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
        </section>}

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

              </div>

              <strong style={{ color: "#c4b5fd" }}>
                {activeMarks.size} / {activeCard.squareCount} marked
                <span role="status" style={{ display: "block" }}>{marksMessage}</span>
                {!marksReady && <button type="button" onClick={() => setMarksReload((value) => value + 1)}>Retry loading marks</button>}
              </strong>
            </div>

            {playedSongsMessage && <p role="status">{playedSongsMessage}</p>}
            <p className="player-card-legend"><span>Waiting for song</span><span>Called — tap to mark</span><span>✓ Marked</span></p>
            <div className="player-song-grid" style={{ gridTemplateColumns: `repeat(${activeCard.columns}, minmax(0, 1fr))` }} aria-label={`Card ${activeCard.cardNumber} songs`}>
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
                    disabled={!marksReady || marksSaving || (!isMarked && !isPlayed)}
                    onClick={() =>
                      toggleSong(square)
                    }
                    aria-pressed={isMarked}
                    aria-label={`${square.title} by ${square.artist}${isMarked ? ", marked" : isPlayed ? ", called — tap to mark" : ", waiting to be called"}`}
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
                      border: isPlayed ? "1px solid #a78bfa" : "1px solid #475569",
                      background: isMarked ? "#bef264" : isPlayed ? "#252047" : "#172033",
                      color: isMarked ? "#172554" : "#e2e8f0",
                      overflow: "hidden",
                      textAlign: "center",
                      cursor:
                        !isMarked && !isPlayed
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <strong>
                      {square.title}
                    </strong>

                    <span className="player-song-artist" style={{ color: isMarked ? "#253d19" : "#cbd5e1" }}>
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
                  "repeat(auto-fit, minmax(min(150px, 100%), 1fr))",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              {cards.length > 1 && <>
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

              </>}

              <button
                type="button"
                disabled={!marksReady || marksSaving || selectedSongKeys.length === 0}
                aria-expanded={confirmClear}
                aria-controls="clear-marks-confirmation"
                onClick={() => setConfirmClear(true)}
                style={{...secondaryActionStyle, opacity: !marksReady || marksSaving || selectedSongKeys.length === 0 ? 0.45 : 1}}
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
            {confirmClear && <div id="clear-marks-confirmation" className="player-clear-confirmation" role="group" aria-labelledby="clear-marks-title">
              <strong id="clear-marks-title">Clear all marked songs?</strong>
              <p>Your cards will stay assigned to you.</p>
              <div><button type="button" style={secondaryActionStyle} onClick={() => setConfirmClear(false)}>Keep my marks</button>
                <button type="button" style={secondaryActionStyle} disabled={!marksReady || marksSaving}
                  onClick={() => { setConfirmClear(false); clearAllCards(); }}>Yes, clear marks</button></div>
            </div>}
          </section>
        )}

        <details className="player-details">
          <summary>Game details &amp; invite a friend</summary>
        <section style={summaryPanelStyle}>
          <div>
            <span style={summaryLabelStyle}>Your Cards</span>
            <strong style={summaryValueStyle}>{cards.length}</strong>
          </div>

          <div>
            <span style={summaryLabelStyle}>Your Entry</span>
            <strong style={summaryValueStyle}>
              {(pricing?.amountCents ?? player.amountCents ?? 0) === 0 ? "Free entry" : formatMoney(pricing?.amountCents ?? player.amountCents ?? 0)}
            </strong>
          </div>

          <div>
            <span style={summaryLabelStyle}>Pattern</span>
            <strong style={summaryValueStyle}>
              {formatWinningPattern(game.bingoPattern, activeCard?.columns ?? 5)}
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

          <GameAccessPanel joinCode={game.joinCode} title="Invite Another Player" compact showOpenButton={false} />
        </details>

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
    "repeat(auto-fit, minmax(min(150px, 100%), 1fr))",
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
