export type CalledTrack = { id?: string; gameTrackId?: string };

/** One queue per mounted game; acknowledgments never clear another game's songs. */
export function createCalledTrackQueue(gameId: string) {
  const pending = new Map<string, CalledTrack>();
  const sent = new Set<string>();
  const controller = new AbortController();
  let flushing = false;

  async function flush() {
    if (flushing || controller.signal.aborted) return;
    flushing = true;
    try {
      for (const [key, track] of pending) {
        if (controller.signal.aborted) break;
        try {
          const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/called-tracks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              gameTrackIds: track.gameTrackId ? [track.gameTrackId] : [],
              providerTrackIds: track.id ? [track.id] : [],
            }),
          });
          if (!response.ok) continue;
          const result = await response.json();
          if (result.ok && result.matched > 0 && !controller.signal.aborted) {
            sent.add(key);
            pending.delete(key);
          }
        } catch {
          // Retain this song for the next retry, even if playback moves on.
        }
      }
    } finally {
      flushing = false;
    }
  }

  return {
    enqueue(track: CalledTrack) {
      const key = track.gameTrackId || track.id;
      if (!key || sent.has(key) || controller.signal.aborted) return;
      pending.set(key, track);
      void flush();
    },
    flush,
    dispose() { controller.abort(); pending.clear(); },
  };
}
