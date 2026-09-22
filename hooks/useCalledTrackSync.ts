"use client";

import { useEffect, useRef } from "react";
import { createCalledTrackQueue, type CalledTrack } from "../lib/game/called-track-queue";

export function useCalledTrackSync(
  gameId: string | null | undefined,
  tracks: CalledTrack[],
  currentIndex: number,
  currentHasStarted: boolean
) {
  const queue = useRef<ReturnType<typeof createCalledTrackQueue> | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const active = createCalledTrackQueue(gameId);
    queue.current = active;
    void active.flush();
    const timer = window.setInterval(() => void active.flush(), 2000);
    return () => {
      window.clearInterval(timer);
      active.dispose();
      queue.current = null;
    };
  }, [gameId]);

  useEffect(() => {
    // DJs can play in any order. Never mark skipped or merely selected songs.
    const track = tracks[currentIndex];
    if (currentHasStarted && track) queue.current?.enqueue(track);
  }, [gameId, tracks, currentIndex, currentHasStarted]);
}
