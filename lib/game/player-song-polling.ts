export type PlayedSongsUpdate = {
  ok: boolean;
  calledGameTrackIds?: string[];
  calledTrackIds?: string[];
  gameStatus?: string;
  prize?: unknown;
  winner?: { playerName: string; cardNumber: number; cardId: string } | null;
};

/** One request at a time; slow responses must not build an unbounded queue. */
export function startPlayerSongPolling(
  gameId: string,
  onUpdate: (data: PlayedSongsUpdate) => void,
  onError: () => void,
) {
  let stopped = false;
  let inFlight = false;
  let controller: AbortController | null = null;
  let deadline: number | undefined;

  async function refresh() {
    if (stopped || inFlight || document.hidden) return;
    inFlight = true;
    controller = new AbortController();
    deadline = window.setTimeout(() => controller?.abort(), 10_000);
    try {
      const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/called-tracks`, {
        cache: "no-store", signal: controller.signal,
      });
      const data = await response.json() as PlayedSongsUpdate;
      if (!response.ok || !data.ok || !Array.isArray(data.calledTrackIds) || !Array.isArray(data.calledGameTrackIds)) {
        throw new Error("Played songs are unavailable.");
      }
      if (!stopped) {
        onUpdate(data);
        if (data.gameStatus === "COMPLETED" || data.gameStatus === "CANCELLED") {
          stopped = true;
          window.clearInterval(timer);
        }
      }
    } catch {
      if (!stopped) onError();
    } finally {
      window.clearTimeout(deadline);
      inFlight = false;
      controller = null;
    }
  }
  const wake = () => { void refresh(); };
  const timer = window.setInterval(wake, 2000);
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", wake);
  wake();
  return () => {
    stopped = true;
    controller?.abort();
    window.clearTimeout(deadline);
    window.clearInterval(timer);
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
