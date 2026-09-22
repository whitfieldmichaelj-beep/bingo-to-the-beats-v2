export type CalledTrack = { id?: string; gameTrackId?: string };

type QueueStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

function browserStorage(): QueueStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}

/** One queue per mounted game; acknowledgments never clear another game's songs. */
export function createCalledTrackQueue(gameId: string, storage: QueueStorage | undefined = browserStorage()) {
  const pending = new Map<string, CalledTrack>();
  const sent = new Set<string>();
  const controller = new AbortController();
  let flushing = false;
  // Store each song separately so another console tab cannot overwrite the queue.
  const prefix = `bttb:pending-called:v1:${encodeURIComponent(gameId)}:`;
  const storageKey = (key: string) => prefix + encodeURIComponent(key);
  try {
    for (let i = 0; storage && i < storage.length; i++) {
      const itemKey = storage.key(i);
      if (!itemKey?.startsWith(prefix)) continue;
      try {
        const track = JSON.parse(storage.getItem(itemKey) ?? "null");
        if (!track || typeof track !== "object") continue;
        const id = typeof track.id === "string" && track.id ? track.id : undefined;
        const gameTrackId = typeof track.gameTrackId === "string" && track.gameTrackId ? track.gameTrackId : undefined;
        const key = gameTrackId || id;
        if (key && itemKey === storageKey(key)) pending.set(key, { id, gameTrackId });
      } catch { /* Ignore a corrupt record without discarding other songs. */ }
    }
  } catch { /* Storage may be disabled; the in-memory queue still works. */ }

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
            try { storage?.removeItem(storageKey(key)); } catch { /* A later replay is idempotent. */ }
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
      const record = { id: track.id, gameTrackId: track.gameTrackId };
      pending.set(key, record);
      // Write before sending, so even an immediate reload preserves the song.
      try { storage?.setItem(storageKey(key), JSON.stringify(record)); } catch { /* Keep retrying in memory. */ }
      void flush();
    },
    flush,
    dispose() { controller.abort(); pending.clear(); },
  };
}
