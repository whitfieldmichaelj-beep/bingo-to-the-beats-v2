"use client";

import {
  useEffect,
  useState,
} from "react";

type ClaimStatus =
  | "ready"
  | "submitting"
  | "pending"
  | "verified"
  | "rejected"
  | "error";

type Props = {
  gameId: string;
  playerId: string;
  playerName: string;
  cardId: string;
  cardNumber: number;
  onClose: () => void;
};

export default function PlayerBingoClaimPanel({
  gameId,
  playerId,
  playerName,
  cardId,
  cardNumber,
  onClose,
}: Props) {
  const [status, setStatus] =
    useState<ClaimStatus>("ready");

  const [message, setMessage] =
    useState("");

  async function loadStatus() {
    try {
      const response = await fetch(
        `/api/game/${encodeURIComponent(
          gameId
        )}/bingo?cardId=${encodeURIComponent(
          cardId
        )}&playerId=${encodeURIComponent(
          playerId
        )}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        return;
      }

      const claim = data.claim;

      if (!claim) {
        if (status === "pending") {
          setStatus("rejected");
          setMessage(
            "The host did not verify this claim. Review your card and keep playing."
          );
        }
        return;
      }

      if (claim.status === "verified") {
        setStatus("verified");
        setMessage(
          "The host verified your BINGO!"
        );
        return;
      }

      setStatus("pending");
      setMessage(
        "BINGO sent to the host. Waiting for verification..."
      );
    } catch {
      // Keep the current player-facing state.
    }
  }

  useEffect(() => {
    if (status !== "pending") {
      return;
    }

    const timer = window.setInterval(
      () => void loadStatus(),
      1500
    );

    return () =>
      window.clearInterval(timer);
  }, [status]);

  async function submit() {
    if (status === "submitting") {
      return;
    }

    setStatus("submitting");
    setMessage("Checking your card...");

    try {
      const response = await fetch(
        `/api/game/${encodeURIComponent(
          gameId
        )}/bingo`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            cardId,
            playerId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setStatus("error");
        setMessage(
          data.message ||
            "The server could not verify this BINGO yet."
        );
        return;
      }

      if (
        data.claim?.status === "verified"
      ) {
        setStatus("verified");
        setMessage(
          "Your BINGO is verified!"
        );
      } else {
        setStatus("pending");
        setMessage(
          "BINGO sent to the host. Waiting for verification..."
        );
      }
    } catch (submitError) {
      setStatus("error");
      setMessage(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send BINGO to the host."
      );
    }
  }

  const verified =
    status === "verified";

  return (
    <div style={{ marginTop: "16px" }}>
      <p
        style={{
          margin: 0,
          color: verified
            ? "#bef264"
            : "#e2e8f0",
          fontSize: verified
            ? "20px"
            : "15px",
          fontWeight: verified
            ? 900
            : 700,
          lineHeight: 1.5,
        }}
      >
        {verified
          ? `✓ ${playerName}, Card #${cardNumber} is a VERIFIED WINNER!`
          : status === "ready"
            ? "Your card shows a winning pattern. Send BINGO to the host for server verification."
            : message}
      </p>

      {status === "ready" && (
        <button
          type="button"
          onClick={() => void submit()}
          style={{
            width: "100%",
            marginTop: "16px",
            padding: "16px 20px",
            border: 0,
            borderRadius: "999px",
            background: "#a3e635",
            color: "#172554",
            fontSize: "16px",
            fontWeight: 950,
            cursor: "pointer",
          }}
        >
          ★ CALL BINGO — NOTIFY HOST
        </button>
      )}

      {status === "submitting" && (
        <button
          type="button"
          disabled
          style={{
            width: "100%",
            marginTop: "16px",
            padding: "16px 20px",
            border: 0,
            borderRadius: "999px",
            background: "#64748b",
            color: "white",
            fontWeight: 900,
          }}
        >
          VERIFYING CARD...
        </button>
      )}

      {status === "pending" && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            border:
              "1px solid #facc15",
            borderRadius: "14px",
            background:
              "rgba(113, 63, 18, .24)",
            color: "#fef3c7",
            fontWeight: 850,
          }}
        >
          ⏳ Host verification pending.
          The DJ Console is being notified.
        </div>
      )}

      {(status === "error" ||
        status === "rejected") && (
        <button
          type="button"
          onClick={() => void submit()}
          style={{
            width: "100%",
            marginTop: "14px",
            padding: "14px 18px",
            border:
              "1px solid #a78bfa",
            borderRadius: "999px",
            background:
              "rgba(124, 58, 237, .18)",
            color: "#ddd6fe",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          TRY BINGO AGAIN
        </button>
      )}

      {status !== "pending" && (
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "12px 18px",
            border:
              verified
                ? "1px solid #bef264"
                : "1px solid #475569",
            borderRadius: "999px",
            background:
              verified
                ? "rgba(77, 124, 15, .22)"
                : "transparent",
            color:
              verified
                ? "#ecfccb"
                : "#cbd5e1",
            fontWeight: 850,
            cursor: "pointer",
          }}
        >
          Return to Cards
        </button>
      )}
    </div>
  );
}
