export type MusicProviderName =
  | "spotify"
  | "apple"
  | "tidal"
  | "upload";

export type MusicImage = {
  url: string;
  width: number | null;
  height: number | null;
};

export type MusicPlaylist = {
  id: string;
  provider: MusicProviderName;
  name: string;
  description: string;
  artwork: MusicImage | null;
  ownerName: string;
  totalTracks: number;
};

export type MusicTrack = {
  id: string;
  provider: MusicProviderName;
  title: string;
  artist: string;
  album: string;
  artwork: MusicImage | null;
  durationMs: number;
  explicit: boolean;
};

export type MusicConnectionStatus = {
  provider: MusicProviderName;
  connected: boolean;
  requiresReconnect: boolean;
};
