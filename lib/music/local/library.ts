import path from "node:path";

import type {
  LocalMusicFolder,
  LocalMusicPlaylist,
  LocalMusicScanResult,
  LocalMusicTrack,
} from "@/types/local-music";

type LocalMusicLibraryListener = (
  library: LocalMusicScanResult | null
) => void;

let currentLibrary: LocalMusicScanResult | null = null;

const listeners = new Set<LocalMusicLibraryListener>();

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(currentLibrary);
    } catch {
      // A listener should never prevent the library from updating.
    }
  }
}

function requireLibrary(): LocalMusicScanResult {
  if (!currentLibrary) {
    throw new Error("No local music library has been loaded.");
  }

  return currentLibrary;
}

export function setLocalMusicLibrary(
  library: LocalMusicScanResult
): LocalMusicScanResult {
  currentLibrary = library;
  notifyListeners();

  return library;
}

export function getLocalMusicLibrary(): LocalMusicScanResult | null {
  return currentLibrary;
}

export function hasLocalMusicLibrary(): boolean {
  return currentLibrary !== null;
}

export function clearLocalMusicLibrary(): void {
  currentLibrary = null;
  notifyListeners();
}

export function subscribeToLocalMusicLibrary(
  listener: LocalMusicLibraryListener
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getLocalMusicLibraryId(): string | null {
  return currentLibrary?.libraryId ?? null;
}

export function getLocalMusicRootFolder(): string | null {
  return currentLibrary?.rootFolderPath ?? null;
}

export function getLocalMusicTracks(): LocalMusicTrack[] {
  return currentLibrary ? [...currentLibrary.tracks] : [];
}

export function getPlayableLocalMusicTracks(): LocalMusicTrack[] {
  return getLocalMusicTracks().filter(
    (track) => track.readable && !track.duplicate
  );
}

export function getDuplicateLocalMusicTracks(): LocalMusicTrack[] {
  return getLocalMusicTracks().filter((track) => track.duplicate);
}

export function getUnreadableLocalMusicTracks(): LocalMusicTrack[] {
  return getLocalMusicTracks().filter((track) => !track.readable);
}

export function getLocalMusicTrackById(
  trackId: string
): LocalMusicTrack | null {
  if (!trackId.trim()) {
    return null;
  }

  return (
    currentLibrary?.tracks.find((track) => track.id === trackId) ??
    null
  );
}

export function getLocalMusicTrackByPath(
  filePath: string
): LocalMusicTrack | null {
  if (!filePath.trim()) {
    return null;
  }

  const normalizedPath = path.resolve(filePath);

  return (
    currentLibrary?.tracks.find(
      (track) => path.resolve(track.filePath) === normalizedPath
    ) ?? null
  );
}

export function getLocalMusicFolders(): LocalMusicFolder[] {
  return currentLibrary ? [...currentLibrary.folders] : [];
}

export function getLocalMusicFolderById(
  folderId: string
): LocalMusicFolder | null {
  if (!folderId.trim()) {
    return null;
  }

  return (
    currentLibrary?.folders.find((folder) => folder.id === folderId) ??
    null
  );
}

export function getLocalMusicFolderByPath(
  folderPath: string
): LocalMusicFolder | null {
  if (!folderPath.trim()) {
    return null;
  }

  const normalizedPath = path.resolve(folderPath);

  return (
    currentLibrary?.folders.find(
      (folder) => path.resolve(folder.path) === normalizedPath
    ) ?? null
  );
}

export function getLocalMusicPlaylists(): LocalMusicPlaylist[] {
  return currentLibrary ? [...currentLibrary.playlists] : [];
}

export function getLocalMusicPlaylistById(
  playlistId: string
): LocalMusicPlaylist | null {
  if (!playlistId.trim()) {
    return null;
  }

  return (
    currentLibrary?.playlists.find(
      (playlist) => playlist.id === playlistId
    ) ?? null
  );
}

export function getLocalMusicPlaylistByFolderPath(
  folderPath: string
): LocalMusicPlaylist | null {
  if (!folderPath.trim()) {
    return null;
  }

  const normalizedPath = path.resolve(folderPath);

  return (
    currentLibrary?.playlists.find(
      (playlist) =>
        path.resolve(playlist.folderPath) === normalizedPath
    ) ?? null
  );
}

export function getPlayableTracksForPlaylist(
  playlistId: string
): LocalMusicTrack[] {
  const playlist = getLocalMusicPlaylistById(playlistId);

  if (!playlist) {
    return [];
  }

  return playlist.tracks.filter(
    (track) => track.readable && !track.duplicate
  );
}

export function searchLocalMusicTracks(
  query: string,
  limit = 100
): LocalMusicTrack[] {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return getPlayableLocalMusicTracks().slice(0, Math.max(0, limit));
  }

  const searchTerms = normalizedQuery.split(" ").filter(Boolean);

  const matches = getLocalMusicTracks()
    .map((track) => {
      const searchable = normalizeSearchValue(
        [
          track.title,
          track.artist,
          track.album,
          track.fileName,
          track.folderPath,
        ].join(" ")
      );

      const matchedTerms = searchTerms.filter((term) =>
        searchable.includes(term)
      ).length;

      const exactTitle =
        normalizeSearchValue(track.title) === normalizedQuery;
      const exactArtist =
        normalizeSearchValue(track.artist) === normalizedQuery;

      return {
        track,
        score:
          matchedTerms * 10 +
          (exactTitle ? 50 : 0) +
          (exactArtist ? 25 : 0) +
          (track.readable ? 5 : 0) -
          (track.duplicate ? 5 : 0),
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const artistCompare = left.track.artist.localeCompare(
        right.track.artist,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      );

      if (artistCompare !== 0) {
        return artistCompare;
      }

      return left.track.title.localeCompare(
        right.track.title,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      );
    });

  return matches
    .slice(0, Math.max(0, limit))
    .map(({ track }) => track);
}

export function getLocalMusicLibrarySummary() {
  const library = requireLibrary();

  return {
    libraryId: library.libraryId,
    scannedAt: library.scannedAt,
    rootFolderPath: library.rootFolderPath,
    rootFolderName: library.rootFolderName,
    stats: library.stats,
    warnings: [...library.warnings],
    message: library.message,
  };
}
