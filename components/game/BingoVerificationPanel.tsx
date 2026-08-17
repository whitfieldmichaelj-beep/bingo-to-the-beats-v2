"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type BingoClaim,
  useBingoClaims,
} from "@/hooks/useBingoClaims";

type Props = {
  gameId?: string | null;
  onNewClaim?: (
    claim: BingoClaim
  ) => void;
};

function formatPattern(value: string) {
  return value
    .replace(/-/g, " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function alertTone() {
  try {
    const context = new AudioContext();
    const oscillator =
      context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = 880;

    gain.gain.setValueAtTime(
      0.12,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + 0.55
    );

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(
      context.currentTime + 0.55
    );

    oscillator.onended = () => {
      void context.close();
    };
  } catch {
    // Visual alert still works if browser audio is blocked.
  }
}

export default function BingoVerificationPanel({
  gameId,
  onNewClaim,
}: Props) {
  const {
    claims,
    refresh,
  } = useBingoClaims(gameId, 1500);

  const [reviewing, setReviewing] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const lastNotifiedId =
    useRef<string | null>(null);

  const pending = claims.filter(
    (claim) =>
      claim.status === "pending"
  );

  const activeClaim = pending[0] ?? null;

  useEffect(() => {
    if (
      !activeClaim ||
      activeClaim.id === lastNotifiedId.current
    ) {
      return;
    }

    lastNotifiedId.current = activeClaim.id;

    alertTone();
    onNewClaim?.(activeClaim);
  }, [activeClaim, onNewClaim]);

  async function review(
    action: "verify" | "reject"
  ) {
    if (
      !gameId ||
      !activeClaim ||
      reviewing
    ) {
      return;
    }

    setReviewing(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/game/${encodeURIComponent(
          gameId
        )}/bingo`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            claimId: activeClaim.id,
            action,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.message ||
            "Unable to review claim."
        );
      }

      setMessage(
        action === "verify"
          ? "Winner verified."
          : "Claim rejected."
      );

      await refresh();
    } catch (reviewError) {
      setMessage(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to review claim."
      );
    } finally {
      setReviewing(false);
    }
  }

  if (!gameId || !activeClaim) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="BINGO claim verification"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "rgba(2, 6, 23, .88)",
        backdropFilter: "blur(10px)",
      }}
    >
      <section
        style={{
          width: "min(100%, 680px)",
          maxHeight: "min(88vh, 820px)",
          overflowY: "auto",
          padding: "26px",
          border: "2px solid #facc15",
          borderRadius: "26px",
          background:
            "linear-gradient(145deg, rgba(69, 26, 3, .98), rgba(15, 23, 42, .99))",
          boxShadow:
            "0 30px 120px rgba(250, 204, 21, .24)",
          color: "white",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#fde047",
            fontSize: "13px",
            fontWeight: 950,
            letterSpacing: ".16em",
            textTransform: "uppercase",
          }}
        >
          ★ BINGO CLAIM
        </p>

        <h2
          style={{
            margin: "8px 0 0",
            fontSize:
              "clamp(34px, 5vw, 54px)",
          }}
        >
          {activeClaim.playerName}
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: "10px",
            marginTop: "16px",
          }}
        >
          <div
            style={{
              padding: "12px",
              border: "1px solid #713f12",
              borderRadius: "12px",
              background:
                "rgba(120, 53, 15, .24)",
            }}
          >
            <small style={{ color: "#fef3c7" }}>
              CARD
            </small>
            <strong
              style={{
                display: "block",
                marginTop: "4px",
                fontSize: "20px",
              }}
            >
              #{activeClaim.cardNumber}
            </strong>
          </div>

          <div
            style={{
              padding: "12px",
              border: "1px solid #713f12",
              borderRadius: "12px",
              background:
                "rgba(120, 53, 15, .24)",
            }}
          >
            <small style={{ color: "#fef3c7" }}>
              PATTERN
            </small>
            <strong
              style={{
                display: "block",
                marginTop: "4px",
                fontSize: "15px",
              }}
            >
              {formatPattern(
                activeClaim.pattern
              )}
            </strong>
          </div>

          <div
            style={{
              padding: "12px",
              border: "1px solid #166534",
              borderRadius: "12px",
              background:
                "rgba(22, 101, 52, .24)",
            }}
          >
            <small style={{ color: "#bbf7d0" }}>
              SERVER CHECK
            </small>
            <strong
              style={{
                display: "block",
                marginTop: "4px",
                color: activeClaim.eligible
                  ? "#bef264"
                  : "#fca5a5",
              }}
            >
              {activeClaim.eligible
                ? "VALID"
                : "NOT VALID"}
            </strong>
          </div>
        </div>

        <p
          style={{
            margin: "18px 0 0",
            color: "#cbd5e1",
            lineHeight: 1.5,
          }}
        >
          Verification is based on songs
          recorded as called by the DJ system,
          not solely on the player&apos;s taps.
        </p>

        <div
          style={{
            display: "grid",
            gap: "7px",
            marginTop: "14px",
          }}
        >
          {activeClaim.winningSquares.map(
            (square) => (
              <div
                key={square.squareIndex}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "22px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: "9px",
                  padding: "9px 11px",
                  border:
                    "1px solid #334155",
                  borderRadius: "10px",
                  background:
                    "rgba(2, 6, 23, .65)",
                }}
              >
                <span
                  style={{
                    color: square.called
                      ? "#a3e635"
                      : "#f87171",
                    fontWeight: 900,
                  }}
                >
                  {square.called ? "✓" : "×"}
                </span>

                <span style={{ minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow:
                        "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {square.title}
                  </strong>
                  <small
                    style={{
                      color: "#94a3b8",
                    }}
                  >
                    {square.artist}
                  </small>
                </span>

                <small
                  style={{
                    color: square.called
                      ? "#bef264"
                      : "#fca5a5",
                    fontWeight: 900,
                  }}
                >
                  {square.called
                    ? "CALLED"
                    : "NOT CALLED"}
                </small>
              </div>
            )
          )}
        </div>

        {message && (
          <p
            role="status"
            style={{
              margin: "14px 0 0",
              color: "#fde68a",
              fontWeight: 800,
            }}
          >
            {message}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "10px",
            marginTop: "18px",
          }}
        >
          <button
            type="button"
            disabled={
              reviewing ||
              !activeClaim.eligible
            }
            onClick={() =>
              void review("verify")
            }
            style={{
              padding: "14px",
              border: 0,
              borderRadius: "999px",
              background: "#a3e635",
              color: "#172554",
              fontWeight: 950,
              cursor: reviewing
                ? "wait"
                : "pointer",
              opacity: activeClaim.eligible
                ? 1
                : 0.45,
            }}
          >
            ✓ VERIFY WINNER
          </button>

          <button
            type="button"
            disabled={reviewing}
            onClick={() =>
              void review("reject")
            }
            style={{
              padding: "14px",
              border:
                "1px solid #fb7185",
              borderRadius: "999px",
              background:
                "rgba(244, 63, 94, .12)",
              color: "#fecdd3",
              fontWeight: 950,
              cursor: reviewing
                ? "wait"
                : "pointer",
            }}
          >
            × REJECT CLAIM
          </button>
        </div>

        {pending.length > 1 && (
          <p
            style={{
              margin: "13px 0 0",
              color: "#c4b5fd",
              textAlign: "center",
              fontSize: "12px",
              fontWeight: 800,
            }}
          >
            {pending.length - 1} additional
            BINGO claim
            {pending.length - 1 === 1
              ? ""
              : "s"}{" "}
            waiting.
          </p>
        )}
      </section>
    </div>
  );
}
