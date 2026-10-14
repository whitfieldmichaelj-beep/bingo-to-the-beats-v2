import type { MiniViewProps } from "@/components/dj-console/DjMiniView";

export type WidgetSnapshot = Omit<MiniViewProps, "onModeChange" | "onOpenConsole" | "onFloat"> & { updatedAt: number };

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const label = (value: unknown, limit = 200) => typeof value === "string" ? value.slice(0, limit) : "";
const number = (value: unknown, max = 100000) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;

// Only display information crosses into the local panel. No IDs, tokens, payments,
// card squares, game commands, or database credentials are needed by the widget.
export function widgetSnapshot(input: unknown, now = Date.now()): WidgetSnapshot {
  const data = object(input), track = object(data.track), claim = object(data.claim);
  return {
    updatedAt: now,
    mode: data.mode === "compact" ? "compact" : "standard",
    gameCode: label(data.gameCode, 12), gameStatus: label(data.gameStatus, 40),
    connection: data.connection === "connected" ? "connected" : data.connection === "loading" ? "loading" : "error",
    providerName: label(data.providerName, 60), providerConnected: data.providerConnected === true,
    track: data.track ? { name: label(track.name), artist: label(track.artist) } : null,
    progress: number(data.progress, 100), secondsRemaining: number(data.secondsRemaining),
    songStatus: label(data.songStatus, 80), calledCount: number(data.calledCount), totalSongs: number(data.totalSongs),
    players: (Array.isArray(data.players) ? data.players : []).slice(0, 500).map(value => {
      const player = object(value);
      return { playerName: label(player.playerName, 80), connected: player.connected === true,
        cardQuantity: number(player.cardQuantity, 1000),
        cardNumbers: (Array.isArray(player.cardNumbers) ? player.cardNumbers : []).filter(n => Number.isInteger(n) && n > 0).slice(0, 1000) as number[] };
    }),
    claim: label(claim.id) ? { id: label(claim.id), playerName: label(claim.playerName, 80), cardNumber: number(claim.cardNumber) } : null,
    claimConnectionLost: data.claimConnectionLost === true,
  };
}
