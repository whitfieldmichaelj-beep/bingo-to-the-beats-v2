export type GameMusicSource = "apple" | "spotify" | "serato" | "local";
export type PlaybackTrackConfig = {
  id: string;
  appleCatalogId?: string;
  appleLibraryId?: string;
  audioUrl?: string;
};
export type GamePlaybackConfig = {
  version: 1;
  source: GameMusicSource;
  clipLength: number;
  tracks: PlaybackTrackConfig[];
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function makePlaybackConfig(
  source: GameMusicSource,
  clipLength: unknown,
  input: unknown,
): GamePlaybackConfig {
  const tracks: PlaybackTrackConfig[] = [];
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    const id = text(value.id);
    if (!id) continue;
    const track: PlaybackTrackConfig = { id };
    if (source === "apple") {
      const catalog = text(value.appleCatalogId);
      const library = text(value.appleLibraryId);
      if (catalog) track.appleCatalogId = catalog;
      if (library) track.appleLibraryId = library;
    }
    const audioUrl = text(value.audioUrl);
    if (source === "spotify" && /^https:\/\//.test(audioUrl)) track.audioUrl = audioUrl;
    tracks.push(track);
  }
  return {
    version: 1,
    source,
    clipLength: typeof clipLength === "number" && [15, 20, 30, 45, 60].includes(clipLength) ? clipLength : 30,
    tracks,
  };
}

export function restorePlaybackConfig(
  saved: unknown,
  playlistId: string,
  tracks: Array<{ id: string; filePath: string }>,
): GamePlaybackConfig | null {
  if (saved && typeof saved === "object") {
    const value = saved as Record<string, unknown>;
    if (value.version === 1 && ["apple", "spotify", "serato", "local"].includes(String(value.source))) {
      return makePlaybackConfig(value.source as GameMusicSource, value.clipLength, value.tracks);
    }
  }
  // Older Apple games saved their original library/catalog identifiers but lost
  // the source field. Require both playlist and track namespaces to agree.
  if (/^(p\.|pl\.)/.test(playlistId) && tracks.length > 0 &&
      tracks.every(track => /^(i\.|a\.|\d+$)/.test(track.id))) {
    return makePlaybackConfig("apple", 30, tracks.map(track => ({
      id: track.id,
      ...(track.id.startsWith("i.") ? { appleLibraryId: track.id } : {}),
    })));
  }
  if (tracks.length > 0 && tracks.every(track => track.filePath.trim())) {
    return makePlaybackConfig("serato", 30, tracks);
  }
  // Do not guess a local audio source for unidentified streaming games.
  return null;
}
