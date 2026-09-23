"use client";

import {
  useCallback,
  useEffect,
  useRef,
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
  gameId: string | null | undefined,
  intervalMs = 1500,
  polling = true
) {
  const [claims, setClaims] = useState<BingoClaim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    setClaims([]);
    setError(null);
    if (!gameId) return;
    let cancelled = false;
    let loaded = false;
    let pending: Promise<void> | null = null;
    let controller: AbortController | null = null;

    function load(): Promise<void> {
      if (pending) return pending;
      if (cancelled) return Promise.resolve();
      controller = new AbortController();
      const signal = controller.signal;
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      pending = (async () => {
        try {
          const response = await fetch(`/api/game/${encodeURIComponent(gameId!)}/bingo`, {
            cache: "no-store", signal,
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.message || "Unable to load BINGO claims.");
          if (!cancelled && !signal.aborted) {
            setClaims(Array.isArray(data.claims) ? data.claims : []);
            setError(null);
            loaded = true;
          }
        } catch (failure) {
          if (!cancelled) setError(signal.aborted
            ? "BINGO check timed out. Please retry."
            : failure instanceof Error ? failure.message : "Unable to load BINGO claims.");
        } finally {
          window.clearTimeout(timeout);
          pending = null;
        }
      })();
      return pending;
    }
    function checkWhenActive() {
      if (!document.hidden && navigator.onLine && (polling || !loaded)) void load();
    }
    refreshRef.current = load;
    checkWhenActive();
    const timer = polling ? window.setInterval(checkWhenActive, Math.max(1000, intervalMs)) : null;
    document.addEventListener("visibilitychange", checkWhenActive);
    window.addEventListener("online", checkWhenActive);
    window.addEventListener("focus", checkWhenActive);
    return () => {
      cancelled = true;
      controller?.abort();
      refreshRef.current = async () => {};
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkWhenActive);
      window.removeEventListener("online", checkWhenActive);
      window.removeEventListener("focus", checkWhenActive);
    };
  }, [gameId, intervalMs, polling]);

  return { claims, error, refresh };
}
