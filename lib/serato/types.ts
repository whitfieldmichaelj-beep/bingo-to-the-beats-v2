export interface SeratoTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  bpm: number | null;
  filePath: string;
  fileName: string;
}

export interface SeratoLibrary {
  seratoPath: string;
  databasePath: string;
  trackCount: number;
  tracks: SeratoTrack[];
}

export interface SeratoResult {
  ok: boolean;
  libraryCount: number;
  totalTracks: number;
  libraries: SeratoLibrary[];
}

export interface SeratoPlaylist {
  id: string;
  name: string;
  filePath: string;
  trackCount: number;
  tracks: SeratoTrack[];
}

export interface ActiveGamePlaylist {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  tracks: SeratoTrack[];
  locked: boolean;
  selectedAt: string;
}