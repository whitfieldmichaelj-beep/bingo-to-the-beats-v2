"use client";

import {
  useEffect,
  useRef,
} from "react";

type Track = {
  id?: string;
  gameTrackId?: string;
};

export function useCalledTrackSync(
  gameId:
    | string
    | null
    | undefined,
  tracks: Track[],
  currentIndex: number,
  currentHasStarted: boolean
) {
  const sent =
    useRef<Set<string>>(
      new Set()
    );

  const previousGameId =
    useRef<string | null>(
      null
    );

  useEffect(() => {
    if (
      previousGameId.current !==
      (gameId ?? null)
    ) {
      previousGameId.current =
        gameId ?? null;

      sent.current =
        new Set();
    }

    if (
      !gameId ||
      tracks.length === 0
    ) {
      return;
    }

    /*
     * BTTB_PLAYED_SONG_SYNC_V2
     *
     * Send the database GameTrack ID when available AND the
     * Serato/provider track ID. This repairs both new sessions
     * and older/current sessions that lost gameTrackId.
     */
    const end =
      Math.max(
        0,
        currentIndex +
          (currentHasStarted
            ? 1
            : 0)
      );

    const candidates =
      tracks.slice(0, end);

    const unsent =
      candidates.filter(
        (track) => {
          const key =
            track.gameTrackId ||
            track.id;

          return Boolean(
            key &&
              !sent.current.has(
                key
              )
          );
        }
      );

    if (
      unsent.length === 0
    ) {
      return;
    }

    const gameTrackIds:
      string[] =
      Array.from(
        new Set<string>(
          unsent
            .map(
              (track) =>
                track.gameTrackId
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
        )
      );

    const providerTrackIds:
      string[] =
      Array.from(
        new Set<string>(
          unsent
            .map(
              (track) =>
                track.id
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
        )
      );

    let cancelled =
      false;

    void (async () => {
      try {
        const response =
          await fetch(
            `/api/game/${encodeURIComponent(
              gameId
            )}/called-tracks`,
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  gameTrackIds,
                  providerTrackIds,
                }),
            }
          );

        if (
          response.ok &&
          !cancelled
        ) {
          unsent.forEach(
            (track) => {
              const key =
                track.gameTrackId ||
                track.id;

              if (key) {
                sent.current.add(
                  key
                );
              }
            }
          );
        }
      } catch {
        // Leave unsent so the next playback update can retry.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gameId,
    tracks,
    currentIndex,
    currentHasStarted,
  ]);
}
