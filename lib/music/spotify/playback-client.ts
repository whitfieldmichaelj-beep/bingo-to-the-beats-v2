let selectedDeviceId: string | null = null;
export function selectSpotifyDevice(id: string | null) { selectedDeviceId = id; }
// Serialize commands so a slow pause cannot arrive after the next song starts.
let queue: Promise<unknown> = Promise.resolve();
export function spotifyPlayback(action: "play" | "resume" | "pause", trackId?: string, positionMs = 0) {
  const deviceId = selectedDeviceId;
  if (!deviceId) {
    if (action === "pause") return Promise.resolve();
    return Promise.reject(new Error("Choose this computer under Spotify Playback Device before starting the game."));
  }
  const operation = queue.catch(() => undefined).then(async () => {
    const response = await fetch("/api/spotify/player", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, trackId, positionMs, deviceId }), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Spotify playback failed.");
  });
  queue = operation;
  return operation;
}
