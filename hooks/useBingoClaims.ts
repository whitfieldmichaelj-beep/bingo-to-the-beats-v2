"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

export type BingoClaim = {
  id: string;
  gameId: string;
  cardId: string;
  cardNumber: number;
  playerId: string | null;
  playerName: string;
  pattern: string;
  status: "pending" | "verified";
  eligible: boolean;
  createdAt: string;
  verifiedAt: string | null;
  winningSquares: Array<{
    squareIndex: number;
    title: string;
    artist: string;
    called: boolean;
  }>;
};

export function useBingoClaims(
  gameId:
    | string
    | null
    | undefined,
  intervalMs = 1500
) {
  const [claims, setClaims] =
    useState<BingoClaim[]>([]);

  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gameId) {
      setClaims([]);
      setError(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/game/${encodeURIComponent(
          gameId
        )}/bingo`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.message ||
            "Unable to load BINGO claims."
        );
      }

      setClaims(
        Array.isArray(data.claims)
          ? data.claims
          : []
      );

      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to load BINGO claims."
      );
    }
  }, [gameId]);

  useEffect(() => {
    void refresh();

    if (!gameId) {
      return;
    }

    const timer = window.setInterval(
      () => {
        if (!document.hidden) {
          void refresh();
        }
      },
      Math.max(1000, intervalMs)
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [gameId, intervalMs, refresh]);

  return {
    claims,
    error,
    refresh,
  };
}
