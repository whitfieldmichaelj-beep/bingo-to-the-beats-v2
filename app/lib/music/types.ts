export type MusicProvider =
  | "spotify"
  | "apple"
  | "tidal"
  | "serato"
  | "local";

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "coming-soon"
  | "error";

export interface MusicTrack {
  /**
   * Internal Bingo to the Beats track ID.
   */
  id: string;

  title: string;
  artist: string;
  album: string;

  artwork?: string | null;
  durationMs: number;

  /**
   * Service from which the track was imported.
   */
  provider: MusicProvider;

  /**
   * Original track ID from the source provider.
   */
  providerTrackId: string;

  bpm?: number | null;
  explicit?: boolean;

  /**
   * Local providers may supply a readable file path.
   */
  filePath?: string;
  fileName?: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  description?: string;

  artwork?: string | null;
  totalTracks: number;

  provider: MusicProvider;
  providerPlaylistId: string;

  tracks?: MusicTrack[];
}

export interface MusicProviderConnection {
  provider: MusicProvider;
  name: string;
  status: ConnectionStatus;
  accountName?: string;
  message?: string;
}

export interface CurrentPlayback {
  provider: MusicProvider;
  isPlaying: boolean;
  progressMs: number;

  track: MusicTrack | null;

  device?: {
    id?: string | null;
    name: string;
    type: string;
    volumePercent?: number | null;
  } | null;
}
