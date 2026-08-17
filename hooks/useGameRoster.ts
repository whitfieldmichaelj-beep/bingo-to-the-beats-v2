"use client";

import {
  useEffect,
  useState,
} from "react";

export type LivePlayer = {
  playerId: string;
  playerName: string;
  connected: boolean;
  joinedAt: string;
  lastSeenAt: string;
  cardQuantity: number;
  cardIds: string[];
  amountCents: number;
  paymentStatus: "PENDING" | "PAID" | "NONE";
};

export type LivePlayerActivity = {
  id: string;
  type: "joined" | "rejoined";
  playerId: string;
  playerName: string;
  cardQuantity: number;
  createdAt: string;
};

export type GameRoster = {
  players: LivePlayer[];
  activities: LivePlayerActivity[];
  totals: {
    totalPlayers: number;
    pendingPlayers: number;
    noPaymentPlayers: number;
    connectedPlayers: number;
    totalCards: number;
    totalPotCents: number;
  };
  payout: {
    winnerPercent: number;
    hostPercent: number;
    totalPotCents: number;
    winnerPayoutCents: number;
    hostPayoutCents: number;
  };
};

type GameRosterApiResponse = {
  ok?: boolean;
  message?: string;
  players?: LivePlayer[];
  activities?: LivePlayerActivity[];
  totals?: GameRoster["totals"];
  payout?: GameRoster["payout"];
};

const DEFAULT_POLL_INTERVAL_MS =
  10_000;

const MINIMUM_POLL_INTERVAL_MS =
  5_000;

const EMPTY_ROSTER: GameRoster = {
  players: [],
  activities: [],
  totals: {
    totalPlayers: 0,
    pendingPlayers: 0,
    noPaymentPlayers: 0,
    connectedPlayers: 0,
    totalCards: 0,
    totalPotCents: 0,
  },
  payout: {
    winnerPercent: 70,
    hostPercent: 30,
    totalPotCents: 0,
    winnerPayoutCents: 0,
    hostPayoutCents: 0,
  },
};

export function useGameRoster(
  gameId: string | null | undefined,
  winnerPercent = 70,
  intervalMs =
    DEFAULT_POLL_INTERVAL_MS
) {
  const [roster, setRoster] =
    useState<GameRoster>(
      EMPTY_ROSTER
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!gameId) {
      setRoster(EMPTY_ROSTER);
      setLoading(false);
      setError(null);
      return;
    }

    const currentGameId = gameId;

    const pollingInterval =
      Math.max(
        MINIMUM_POLL_INTERVAL_MS,
        intervalMs
      );

    let cancelled = false;
    let requestInProgress = false;
    let timer:
      | number
      | null = null;

    let controller:
      | AbortController
      | null = null;

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleNextPoll() {
      clearTimer();

      if (cancelled) {
        return;
      }

      timer = window.setTimeout(
        () => {
          void loadRoster(false);
        },
        pollingInterval
      );
    }

    async function loadRoster(
      showLoading: boolean
    ) {
      if (
        cancelled ||
        requestInProgress ||
        document.hidden ||
        !navigator.onLine
      ) {
        scheduleNextPoll();
        return;
      }

      requestInProgress = true;

      if (showLoading) {
        setLoading(true);
      }

      controller?.abort();
      controller =
        new AbortController();

      try {
        const response = await fetch(
          `/api/game/${encodeURIComponent(
            currentGameId
          )}/players?winnerPercent=${winnerPercent}`,
          {
            cache: "no-store",
            signal:
              controller.signal,
          }
        );

        const data =
          (await response.json()) as
            GameRosterApiResponse;

        if (
          !response.ok ||
          !data.ok
        ) {
          throw new Error(
            data.message ||
              "Unable to load players."
          );
        }

        if (!cancelled) {
          setRoster({
            players:
              data.players ?? [],
            activities:
              data.activities ?? [],
            totals:
              data.totals ??
              EMPTY_ROSTER.totals,
            payout:
              data.payout ??
              EMPTY_ROSTER.payout,
          });

          setError(null);
        }
      } catch (loadError) {
        if (
          cancelled ||
          loadError instanceof DOMException &&
            loadError.name ===
              "AbortError"
        ) {
          return;
        }

        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load players."
          );
        }
      } finally {
        requestInProgress = false;

        if (!cancelled) {
          setLoading(false);
          scheduleNextPoll();
        }
      }
    }

    function refreshWhenActive() {
      if (
        document.hidden ||
        !navigator.onLine
      ) {
        return;
      }

      clearTimer();
      void loadRoster(false);
    }

    void loadRoster(true);

    document.addEventListener(
      "visibilitychange",
      refreshWhenActive
    );

    window.addEventListener(
      "online",
      refreshWhenActive
    );

    window.addEventListener(
      "focus",
      refreshWhenActive
    );

    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();

      document.removeEventListener(
        "visibilitychange",
        refreshWhenActive
      );

      window.removeEventListener(
        "online",
        refreshWhenActive
      );

      window.removeEventListener(
        "focus",
        refreshWhenActive
      );
    };
  }, [
    gameId,
    winnerPercent,
    intervalMs,
  ]);

  return {
    roster,
    loading,
    error,
  };
}
