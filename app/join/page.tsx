"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

type CardQuantity = 1 | 2 | 3 | 5 | 10;

type PlayerCard = {
  id: string;
  cardNumber: number;
  gameId: string;
  rows: number;
  columns: number;
  squareCount: number;
  signature: string;
  squares: Array<{
    squareIndex: number;
    row: number;
    column: number;
    trackId: string;
    gameTrackId: string;
    title: string;
    artist: string;
    marked: boolean;
    markedAt: string | null;
  }>;
  createdAt: string;
};

type JoinResponse = {
  ok: boolean;
  message?: string;
  rejoined?: boolean;
  player?: {
    playerId: string;
    playerName: string;
    gameId: string;
    joinCode: string;
    purchaseId: string;
    cardIds: string[];
    cardQuantity: CardQuantity;
    amountCents: number;
    joinedAt: string;
  };
  game?: {
    id: string;
    joinCode: string;
    playlistName: string;
    status: string;
    bingoPattern: string;
    playlistTrackCount: number;
  };
  cards?: PlayerCard[];
  card?: PlayerCard | null;
  pricing?: {
    quantity: CardQuantity;
    amountCents: number;
  };
  availability?: {
    totalCards: number;
    assignedCards: number;
    remainingCards: number;
  };
};

const PLAYER_ID_KEY = "bttb-v2-player-id";
const PLAYER_SESSION_KEY = "bttb-v2-player-session";

const PACKAGES: Array<{
  quantity: CardQuantity;
  priceCents: number;
  label: string;
  badge?: string;
  savings?: string;
}> = [
  {
    quantity: 1,
    priceCents: 500,
    label: "1 Card",
  },
  {
    quantity: 2,
    priceCents: 900,
    label: "2 Cards",
    savings: "Save $1",
  },
  {
    quantity: 3,
    priceCents: 1200,
    label: "3 Cards",
    badge: "Most Popular",
    savings: "Save $3",
  },
  {
    quantity: 5,
    priceCents: 2000,
    label: "5 Cards",
    savings: "Save $5",
  },
  {
    quantity: 10,
    priceCents: 3700,
    label: "10 Cards",
    badge: "Best Value",
    savings: "Save $13",
  },
];

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function JoinGameForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [cardQuantity, setCardQuantity] =
    useState<CardQuantity>(3);
  const [message, setMessage] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const codeFromUrl = normalizeCode(
      searchParams.get("code") ?? ""
    );

    if (codeFromUrl) {
      setJoinCode(codeFromUrl);
    }
  }, [searchParams]);

  const selectedPackage = useMemo(
    () =>
      PACKAGES.find(
        (option) => option.quantity === cardQuantity
      ) ?? PACKAGES[2],
    [cardQuantity]
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const normalizedJoinCode = normalizeCode(joinCode);
    const normalizedPlayerName = playerName
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 50);

    if (!normalizedPlayerName) {
      setMessage("Enter your name.");
      return;
    }

    if (!normalizedJoinCode) {
      setMessage("Enter the game code shown by the host.");
      return;
    }

    setJoining(true);
    setMessage("");

    try {
      let playerId =
        localStorage.getItem(PLAYER_ID_KEY) ?? "";

      if (!playerId) {
        playerId = crypto.randomUUID();
        localStorage.setItem(PLAYER_ID_KEY, playerId);
      }

      const response = await fetch("/api/game/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          joinCode: normalizedJoinCode,
          playerName: normalizedPlayerName,
          playerId,
          cardQuantity,
        }),
      });

      const data = (await response.json()) as JoinResponse;

      if (
        !response.ok ||
        !data.ok ||
        !data.player ||
        !data.game ||
        !Array.isArray(data.cards) ||
        data.cards.length === 0
      ) {
        throw new Error(
          data.message || "Unable to join the game."
        );
      }

      localStorage.setItem(
        PLAYER_SESSION_KEY,
        JSON.stringify({
          player: data.player,
          game: data.game,
          cards: data.cards,
          card: data.cards[0],
          pricing: data.pricing,
          availability: data.availability,
          joinedAt: new Date().toISOString(),
        })
      );

      router.push("/game/cards");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to join the game."
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "640px",
          padding: "32px",
          border: "1px solid rgba(167, 139, 250, 0.28)",
          borderRadius: "24px",
          background: "rgba(17, 24, 39, 0.96)",
          boxShadow: "0 28px 80px rgba(0, 0, 0, 0.42)",
        }}
      >
        <header style={{ textAlign: "center" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              display: "grid",
              placeItems: "center",
              margin: "0 auto",
              borderRadius: "18px",
              background:
                "linear-gradient(135deg, #2563eb, #9333ea)",
              fontSize: "30px",
            }}
          >
            ♫
          </div>

          <p
            style={{
              margin: "18px 0 0",
              color: "#c4b5fd",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Bingo to the Beats
          </p>

          <h1
            style={{
              margin: "8px 0 0",
              fontSize: "clamp(34px, 7vw, 48px)",
            }}
          >
            Join a Game
          </h1>

          <p
            style={{
              margin: "14px auto 0",
              maxWidth: "430px",
              color: "#cbd5e1",
              lineHeight: 1.6,
            }}
          >
            Enter your name, confirm the game code, and
            choose your card package.
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
              marginTop: "28px",
            }}
          >
            <label style={fieldLabelStyle}>
              Your name
              <input
                type="text"
                value={playerName}
                onChange={(event) =>
                  setPlayerName(event.target.value)
                }
                placeholder="Enter your name"
                autoComplete="name"
                maxLength={50}
                disabled={joining}
                style={fieldInputStyle}
              />
            </label>

            <label style={fieldLabelStyle}>
              Game code
              <input
                type="text"
                value={joinCode}
                onChange={(event) =>
                  setJoinCode(
                    normalizeCode(event.target.value)
                  )
                }
                placeholder="ABC123"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                disabled={joining}
                style={{
                  ...fieldInputStyle,
                  fontSize: "22px",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
              />
            </label>
          </div>

          <section
            style={{
              marginTop: "24px",
              paddingTop: "22px",
              borderTop: "1px solid #334155",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "24px",
              }}
            >
              Choose Your Cards
            </h2>

            <p
              style={{
                margin: "8px 0 0",
                color: "#94a3b8",
              }}
            >
              Cards are randomly assigned and each card has
              its own unique ID.
            </p>

            <div
              style={{
                display: "grid",
                gap: "11px",
                marginTop: "18px",
              }}
            >
              {PACKAGES.map((option) => {
                const selected =
                  cardQuantity === option.quantity;

                return (
                  <button
                    key={option.quantity}
                    type="button"
                    onClick={() =>
                      setCardQuantity(option.quantity)
                    }
                    disabled={joining}
                    aria-pressed={selected}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: "14px",
                      width: "100%",
                      padding: "16px",
                      border: selected
                        ? "2px solid #a78bfa"
                        : "1px solid #475569",
                      borderRadius: "16px",
                      background: selected
                        ? "rgba(124, 58, 237, 0.18)"
                        : "#0f172a",
                      color: "white",
                      textAlign: "left",
                      cursor: joining
                        ? "not-allowed"
                        : "pointer",
                    }}
                  >
                    <span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "9px",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "18px",
                          }}
                        >
                          {option.label}
                        </strong>

                        {option.badge && (
                          <span
                            style={{
                              padding: "5px 8px",
                              borderRadius: "999px",
                              background: "#a3e635",
                              color: "#172554",
                              fontSize: "10px",
                              fontWeight: 900,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                            }}
                          >
                            {option.badge}
                          </span>
                        )}
                      </span>

                      {option.savings && (
                        <small
                          style={{
                            display: "block",
                            marginTop: "6px",
                            color: "#bef264",
                            fontWeight: 800,
                          }}
                        >
                          {option.savings}
                        </small>
                      )}
                    </span>

                    <strong
                      style={{
                        fontSize: "24px",
                        color: selected
                          ? "#ddd6fe"
                          : "white",
                      }}
                    >
                      {formatMoney(option.priceCents)}
                    </strong>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              marginTop: "22px",
              padding: "18px",
              border: "1px solid #334155",
              borderRadius: "16px",
              background: "#020617",
            }}
          >
            <span>
              <small
                style={{
                  display: "block",
                  color: "#94a3b8",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Total
              </small>
              <strong
                style={{
                  display: "block",
                  marginTop: "5px",
                  fontSize: "30px",
                }}
              >
                {formatMoney(
                  selectedPackage.priceCents
                )}
              </strong>
            </span>

            <span
              style={{
                color: "#cbd5e1",
                fontWeight: 800,
                textAlign: "right",
              }}
            >
              {cardQuantity}{" "}
              {cardQuantity === 1 ? "card" : "cards"}
            </span>
          </section>

          {message && (
            <div
              role="alert"
              style={{
                marginTop: "18px",
                padding: "13px",
                border:
                  "1px solid rgba(244, 63, 94, 0.4)",
                borderRadius: "12px",
                background: "rgba(244, 63, 94, 0.1)",
                color: "#fda4af",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={joining}
            style={{
              width: "100%",
              marginTop: "22px",
              padding: "16px",
              border: 0,
              borderRadius: "999px",
              background:
                "linear-gradient(90deg, #2563eb, #9333ea)",
              color: "white",
              boxShadow:
                "0 15px 36px rgba(99, 102, 241, 0.3)",
              fontWeight: 900,
              fontSize: "17px",
              cursor: joining
                ? "not-allowed"
                : "pointer",
              opacity: joining ? 0.62 : 1,
            }}
          >
            {joining
              ? "Assigning Your Cards..."
              : `Continue — ${formatMoney(
                  selectedPackage.priceCents
                )}`}
          </button>

          <p
            style={{
              margin: "12px 0 0",
              color: "#94a3b8",
              fontSize: "12px",
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            Payment is temporarily bypassed during development.
          </p>
        </form>

        <div style={{ textAlign: "center" }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              marginTop: "22px",
              color: "#93c5fd",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            ← Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#030712",
            color: "white",
          }}
        >
          Loading join page...
        </main>
      }
    >
      <JoinGameForm />
    </Suspense>
  );
}

const fieldLabelStyle = {
  display: "block",
  color: "#e2e8f0",
  fontSize: "13px",
  fontWeight: 800,
};

const fieldInputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  marginTop: "9px",
  padding: "15px",
  border: "1px solid #475569",
  borderRadius: "12px",
  background: "#0f172a",
  color: "white",
  fontSize: "17px",
  outline: "none",
};

