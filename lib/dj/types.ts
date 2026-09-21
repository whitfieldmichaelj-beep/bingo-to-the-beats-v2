import type { DjProvider } from "./providers";
// Structurally compatible with existing game tracks and saved Serato games.
export interface DjTrack {
  id: string;
  source: DjProvider;
  sourceTrackId: string;
  title: string;
  artist: string;
  album?: string;
  version?: string;
  duration?: number;
  key?: string;
  bpm: number | null;
  filePath: string;
  fileName: string;
}
export interface DjPlaylist {
  id: string;
  name: string;
  filePath: string;
  trackCount: number;
  tracks: DjTrack[];
}
export interface DjDetection {
  id: string;
  title: string;
  artist: string;
  filePath?: string;
  displayText: string;
  playedAtText: string | null;
}
export interface DjAdapter {
  listPlaylists(): Promise<DjPlaylist[]>;
  loadPlaylist(id: string): Promise<DjPlaylist | null>;
  nowPlaying(): Promise<DjDetection | null>;
}
