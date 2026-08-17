import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  isSupportedLocalAudioExtension,
  type LocalMusicFolder,
  type LocalMusicLibraryStats,
  type LocalMusicPlaylist,
  type LocalMusicScanRequest,
  type LocalMusicScanResult,
  type LocalMusicTrack,
} from "@/types/local-music";

import {
  createDuplicateKey,
  createLocalMusicTrack,
} from "./parser";

const DEFAULT_MAX_FILES = 50_000;

type ScanOptions = {
  recursive: boolean;
  buildFolderPlaylists: boolean;
  includeHiddenFiles: boolean;
  maximumFiles: number;
};

type FolderAccumulator = {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  relativePath: string;
  directTrackIds: string[];
  childFolderPaths: string[];
};

type WalkState = {
  rootFolderPath: string;
  options: ScanOptions;
  tracks: LocalMusicTrack[];
  folders: Map<string, FolderAccumulator>;
  unsupportedFiles: number;
  totalFilesScanned: number;
  totalSizeBytes: number;
  warnings: string[];
  reachedFileLimit: boolean;
};

function normalizeFolderPath(value: string): string {
  return path.resolve(value.trim());
}

function normalizeRelativePath(value: string): string {
  if (!value || value === ".") {
    return "";
  }

  return value.split(path.sep).join("/");
}

function createStableId(prefix: string, value: string): string {
  const digest = createHash("sha256")
    .update(path.resolve(value).replace(/\\/g, "/").toLowerCase())
    .digest("hex")
    .slice(0, 20);

  return `${prefix}-${digest}`;
}

function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

function formatFileSystemError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown filesystem error";
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureFolderAccumulator(
  state: WalkState,
  folderPath: string,
  parentPath: string | null
): FolderAccumulator {
  const existing = state.folders.get(folderPath);

  if (existing) {
    return existing;
  }

  const relativePath = normalizeRelativePath(
    path.relative(state.rootFolderPath, folderPath)
  );

  const folder: FolderAccumulator = {
    id: createStableId("folder", folderPath),
    name:
      path.basename(folderPath) ||
      path.basename(state.rootFolderPath) ||
      "Local Music",
    path: folderPath,
    parentPath,
    relativePath,
    directTrackIds: [],
    childFolderPaths: [],
  };

  state.folders.set(folderPath, folder);

  if (parentPath) {
    const parent = state.folders.get(parentPath);

    if (parent && !parent.childFolderPaths.includes(folderPath)) {
      parent.childFolderPaths.push(folderPath);
    }
  }

  return folder;
}

async function addAudioFile(
  state: WalkState,
  filePath: string,
  folder: FolderAccumulator
): Promise<void> {
  if (state.totalFilesScanned >= state.options.maximumFiles) {
    state.reachedFileLimit = true;
    return;
  }

  state.totalFilesScanned += 1;

  let fileStats: Awaited<ReturnType<typeof stat>> | null = null;

  try {
    fileStats = await stat(filePath);
  } catch (error) {
    state.warnings.push(
      `Could not inspect ${filePath}: ${formatFileSystemError(error)}`
    );
  }

  const readable = await isReadable(filePath);

  const track = createLocalMusicTrack({
    filePath,
    rootFolderPath: state.rootFolderPath,
    sizeBytes: fileStats?.size,
    modifiedAt: fileStats?.mtime
      ? fileStats.mtime.toISOString()
      : null,
    readable,
  });

  state.tracks.push(track);
  folder.directTrackIds.push(track.id);

  if (fileStats?.size) {
    state.totalSizeBytes += fileStats.size;
  }

  if (!readable) {
    state.warnings.push(`The file is not readable: ${filePath}`);
  }
}

async function walkFolder(
  state: WalkState,
  folderPath: string,
  parentPath: string | null
): Promise<void> {
  if (state.reachedFileLimit) {
    return;
  }

  const folder = ensureFolderAccumulator(
    state,
    folderPath,
    parentPath
  );

  let entries: Dirent<string>[];

  try {
    entries = await readdir(folderPath, {
      withFileTypes: true,
    });
  } catch (error) {
    state.warnings.push(
      `Could not open folder ${folderPath}: ${formatFileSystemError(
        error
      )}`
    );
    return;
  }

  entries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  for (const entry of entries) {
    if (state.reachedFileLimit) {
      break;
    }

    if (
      !state.options.includeHiddenFiles &&
      isHiddenName(entry.name)
    ) {
      continue;
    }

    const entryPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      if (state.options.recursive) {
        await walkFolder(state, entryPath, folderPath);
      }
      continue;
    }

    if (entry.isSymbolicLink() || !entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();

    if (!isSupportedLocalAudioExtension(extension)) {
      state.totalFilesScanned += 1;
      state.unsupportedFiles += 1;
      continue;
    }

    await addAudioFile(state, entryPath, folder);
  }
}

function markDuplicates(
  tracks: LocalMusicTrack[]
): LocalMusicTrack[] {
  const firstTrackByKey = new Map<string, LocalMusicTrack>();

  return tracks.map((track) => {
    if (!track.readable) {
      return track;
    }

    const duplicateKey = createDuplicateKey(track);

    if (
      !duplicateKey ||
      duplicateKey === "unknown artist::unknown song"
    ) {
      return track;
    }

    const originalTrack = firstTrackByKey.get(duplicateKey);

    if (!originalTrack) {
      firstTrackByKey.set(duplicateKey, track);
      return track;
    }

    return {
      ...track,
      duplicate: true,
      duplicateOf: originalTrack.id,
    };
  });
}

function getDescendantTrackIds(
  folderPath: string,
  folderMap: Map<string, FolderAccumulator>,
  memo: Map<string, string[]>
): string[] {
  const cached = memo.get(folderPath);

  if (cached) {
    return cached;
  }

  const folder = folderMap.get(folderPath);

  if (!folder) {
    return [];
  }

  const trackIds = [...folder.directTrackIds];

  for (const childPath of folder.childFolderPaths) {
    trackIds.push(
      ...getDescendantTrackIds(childPath, folderMap, memo)
    );
  }

  const uniqueTrackIds = Array.from(new Set(trackIds));
  memo.set(folderPath, uniqueTrackIds);

  return uniqueTrackIds;
}

function buildFolders(
  folderMap: Map<string, FolderAccumulator>,
  trackById: Map<string, LocalMusicTrack>
): LocalMusicFolder[] {
  const descendantMemo = new Map<string, string[]>();

  return Array.from(folderMap.values())
    .map((folder) => {
      const totalTrackIds = getDescendantTrackIds(
        folder.path,
        folderMap,
        descendantMemo
      );

      const totalTracks = totalTrackIds
        .map((trackId) => trackById.get(trackId))
        .filter(
          (track): track is LocalMusicTrack => Boolean(track)
        );

      return {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        parentPath: folder.parentPath,
        relativePath: folder.relativePath,
        directTrackCount: folder.directTrackIds.length,
        totalTrackCount: totalTracks.length,
        childFolderCount: folder.childFolderPaths.length,
        playableTrackCount: totalTracks.filter(
          (track) => track.readable && !track.duplicate
        ).length,
        unreadableTrackCount: totalTracks.filter(
          (track) => !track.readable
        ).length,
        duplicateTrackCount: totalTracks.filter(
          (track) => track.duplicate
        ).length,
      };
    })
    .sort((left, right) => {
      if (left.relativePath === "") {
        return -1;
      }

      if (right.relativePath === "") {
        return 1;
      }

      return left.relativePath.localeCompare(
        right.relativePath,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      );
    });
}

function buildPlaylists(
  folders: LocalMusicFolder[],
  folderMap: Map<string, FolderAccumulator>,
  trackById: Map<string, LocalMusicTrack>,
  buildFolderPlaylists: boolean
): LocalMusicPlaylist[] {
  if (!buildFolderPlaylists) {
    return [];
  }

  const descendantMemo = new Map<string, string[]>();

  return folders
    .map((folder) => {
      const sourceFolder =
        folderMap.get(folder.path);

      const trackIds =
        folder.relativePath === ""
          ? getDescendantTrackIds(
              folder.path,
              folderMap,
              descendantMemo
            )
          : [
              ...(
                sourceFolder?.directTrackIds ??
                []
              ),
            ];

      const tracks = trackIds
        .map((trackId) => trackById.get(trackId))
        .filter(
          (track): track is LocalMusicTrack => Boolean(track)
        )
        .sort((left, right) => {
          const artistCompare = left.artist.localeCompare(
            right.artist,
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          );

          if (artistCompare !== 0) {
            return artistCompare;
          }

          return left.title.localeCompare(
            right.title,
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          );
        });

      const playableTracks = tracks.filter(
        (track) => track.readable && !track.duplicate
      );

      return {
        id: createStableId("playlist", folder.path),
        name:
          folder.relativePath === ""
            ? `${folder.name} — All Music`
            : folder.name,
        description:
          folder.relativePath === ""
            ? `All playable music found under ${folder.path}`
            : `Music found in ${folder.path} and its subfolders`,
        folderPath: folder.path,
        relativePath: folder.relativePath,
        trackCount: tracks.length,
        playableTrackCount: playableTracks.length,
        duplicateTrackCount: tracks.filter(
          (track) => track.duplicate
        ).length,
        unreadableTrackCount: tracks.filter(
          (track) => !track.readable
        ).length,
        artwork:
          tracks.find((track) => Boolean(track.artwork))?.artwork ??
          null,
        tracks,
      };
    })
    .filter((playlist) => playlist.trackCount > 0);
}

function buildStats(
  rootFolderPath: string,
  rootFolderName: string,
  folders: LocalMusicFolder[],
  playlists: LocalMusicPlaylist[],
  tracks: LocalMusicTrack[],
  state: WalkState,
  scanDurationMs: number
): LocalMusicLibraryStats {
  return {
    rootFolderPath,
    rootFolderName,
    folderCount: folders.length,
    playlistCount: playlists.length,
    totalFilesScanned: state.totalFilesScanned,
    supportedAudioFiles: tracks.length,
    unsupportedFiles: state.unsupportedFiles,
    playableTracks: tracks.filter(
      (track) => track.readable && !track.duplicate
    ).length,
    duplicateTracks: tracks.filter((track) => track.duplicate).length,
    unreadableTracks: tracks.filter((track) => !track.readable).length,
    missingTitleCount: tracks.filter(
      (track) => !track.title || track.title === "Unknown Song"
    ).length,
    missingArtistCount: tracks.filter(
      (track) =>
        !track.artist || track.artist === "Unknown Artist"
    ).length,
    missingAlbumCount: tracks.filter(
      (track) => !track.album || track.album === "Local Music"
    ).length,
    missingArtworkCount: tracks.filter((track) => !track.artwork).length,
    missingBpmCount: tracks.filter((track) => !track.bpm).length,
    totalSizeBytes: state.totalSizeBytes,
    scanDurationMs,
  };
}

function createSuccessMessage(
  stats: LocalMusicLibraryStats
): string {
  const songWord = stats.playableTracks === 1 ? "song" : "songs";

  return `${stats.playableTracks.toLocaleString(
    "en-US"
  )} playable ${songWord} found in ${stats.folderCount.toLocaleString(
    "en-US"
  )} folder${stats.folderCount === 1 ? "" : "s"}.`;
}

export async function scanLocalMusicLibrary(
  request: LocalMusicScanRequest
): Promise<LocalMusicScanResult> {
  const startedAt = Date.now();

  const requestedPath =
    typeof request.folderPath === "string"
      ? request.folderPath.trim()
      : "";

  if (!requestedPath) {
    throw new Error("A local music folder path is required.");
  }

  const rootFolderPath = normalizeFolderPath(requestedPath);
  const rootStats = await stat(rootFolderPath);

  if (!rootStats.isDirectory()) {
    throw new Error(
      "The selected local music path is not a folder."
    );
  }

  const options: ScanOptions = {
    recursive: request.recursive !== false,
    buildFolderPlaylists:
      request.buildFolderPlaylists !== false,
    includeHiddenFiles:
      request.includeHiddenFiles === true,
    maximumFiles: DEFAULT_MAX_FILES,
  };

  const state: WalkState = {
    rootFolderPath,
    options,
    tracks: [],
    folders: new Map(),
    unsupportedFiles: 0,
    totalFilesScanned: 0,
    totalSizeBytes: 0,
    warnings: [],
    reachedFileLimit: false,
  };

  await walkFolder(state, rootFolderPath, null);

  const tracks = markDuplicates(state.tracks);

  const trackById = new Map(
    tracks.map((track) => [track.id, track])
  );

  const folders = buildFolders(state.folders, trackById);

  const playlists = buildPlaylists(
    folders,
    state.folders,
    trackById,
    options.buildFolderPlaylists
  );

  if (state.reachedFileLimit) {
    state.warnings.push(
      `The scan stopped after ${DEFAULT_MAX_FILES.toLocaleString(
        "en-US"
      )} files. Select a smaller folder or increase the scanner limit.`
    );
  }

  const rootFolderName =
    path.basename(rootFolderPath) || "Local Music";

  const scanDurationMs = Date.now() - startedAt;

  const stats = buildStats(
    rootFolderPath,
    rootFolderName,
    folders,
    playlists,
    tracks,
    state,
    scanDurationMs
  );

  const scannedAt = new Date().toISOString();
  const libraryId = createStableId("library", rootFolderPath);

  return {
    ok: true,
    status: "complete",
    libraryId,
    scannedAt,
    rootFolderPath,
    rootFolderName,
    folders,
    playlists,
    tracks,
    stats,
    warnings: state.warnings,
    message: createSuccessMessage(stats),
  };
}

export async function scanLocalMusicFolder(
  folderPath: string
): Promise<LocalMusicScanResult> {
  return scanLocalMusicLibrary({
    folderPath,
    recursive: true,
    buildFolderPlaylists: true,
    includeHiddenFiles: false,
  });
}

export const scanLocalMusic = scanLocalMusicLibrary;
