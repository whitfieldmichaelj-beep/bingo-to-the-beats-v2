export const LOCAL_AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".mp4",
  ".aac",
  ".wav",
  ".aif",
  ".aiff",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
] as const;

export type LocalAudioExtension =
  (typeof LOCAL_AUDIO_EXTENSIONS)[number];

export type LocalMusicScanStatus =
  | "idle"
  | "scanning"
  | "complete"
  | "error";

export type LocalPlaylistHealth =
  | "excellent"
  | "good"
  | "warning"
  | "blocked";

export type LocalMusicSort =
  | "title"
  | "artist"
  | "album"
  | "folder"
  | "file-name";

export type LocalMusicTrack = {
  id: string;

  title: string;
  artist: string;
  album: string;

  fileName: string;
  filePath: string;
  folderPath: string;
  extension: string;

  durationMs: number;
  bpm: number | null;
  artwork: string | null;

  readable: boolean;
  duplicate: boolean;
  duplicateOf?: string | null;

  sizeBytes?: number;
  modifiedAt?: string | null;
};

export type LocalMusicFolder = {
  id: string;
  name: string;
  path: string;

  parentPath: string | null;
  relativePath: string;

  directTrackCount: number;
  totalTrackCount: number;

  childFolderCount: number;
  playableTrackCount: number;
  unreadableTrackCount: number;
  duplicateTrackCount: number;
};

export type LocalMusicPlaylist = {
  id: string;
  name: string;
  description: string;

  folderPath: string;
  relativePath: string;

  trackCount: number;
  playableTrackCount: number;
  duplicateTrackCount: number;
  unreadableTrackCount: number;

  artwork: string | null;
  tracks: LocalMusicTrack[];
};

export type LocalMusicLibraryStats = {
  rootFolderPath: string;
  rootFolderName: string;

  folderCount: number;
  playlistCount: number;

  totalFilesScanned: number;
  supportedAudioFiles: number;
  unsupportedFiles: number;

  playableTracks: number;
  duplicateTracks: number;
  unreadableTracks: number;

  missingTitleCount: number;
  missingArtistCount: number;
  missingAlbumCount: number;
  missingArtworkCount: number;
  missingBpmCount: number;

  totalSizeBytes: number;
  scanDurationMs: number;
};

export type LocalMusicScanResult = {
  ok: boolean;
  status: LocalMusicScanStatus;

  libraryId: string;
  scannedAt: string;

  rootFolderPath: string;
  rootFolderName: string;

  folders: LocalMusicFolder[];
  playlists: LocalMusicPlaylist[];
  tracks: LocalMusicTrack[];

  stats: LocalMusicLibraryStats;

  warnings: string[];
  message: string;
  error?: string;
};

export type LocalMusicLibraryCache = {
  version: 1;
  libraryId: string;
  createdAt: string;
  updatedAt: string;

  rootFolderPath: string;
  rootFolderName: string;

  folders: LocalMusicFolder[];
  playlists: LocalMusicPlaylist[];
  tracks: LocalMusicTrack[];

  stats: LocalMusicLibraryStats;
};

export type LocalMusicScanRequest = {
  folderPath: string;
  recursive?: boolean;
  buildFolderPlaylists?: boolean;
  includeHiddenFiles?: boolean;
};

export type LocalMusicPlaylistRequest = {
  libraryId?: string;
  folderPath?: string;
  search?: string;
  sort?: LocalMusicSort;
};

export type LocalMusicGameRequest = {
  folderPath: string;
  playlistId?: string;

  cardCount: number;
  clipLength: number;
  winningPattern: string;
  shuffle: boolean;
};

export type LocalMusicGameAdvisor = {
  status: LocalPlaylistHealth;

  score: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";

  playlistName: string;
  uniqueSongCount: number;
  requestedCardCount: number;
  recommendedMaximumCards: number;

  estimatedDurationMinutes: {
    minimum: number;
    maximum: number;
  };

  recommendations: string[];
  warnings: string[];
};

export type LocalMusicGameResponse = {
  ok: boolean;

  game?: {
    id: string;
    joinCode: string;
    playlistId: string;
    playlistName: string;
    playlistTrackCount: number;
  };

  advisor?: LocalMusicGameAdvisor;

  message: string;
  error?: string;
};

export function isSupportedLocalAudioExtension(
  extension: string
): extension is LocalAudioExtension {
  return LOCAL_AUDIO_EXTENSIONS.includes(
    extension.toLowerCase() as LocalAudioExtension
  );
}
