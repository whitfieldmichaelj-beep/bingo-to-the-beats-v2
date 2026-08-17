import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";

import type {
  MusicPlaylist,
  MusicTrack,
} from "@/app/lib/music/types";

const SUPPORTED_EXTENSIONS = new Set([
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
]);

const MAX_FILES = 5000;

export type LocalMusicScanSummary = {
  folderPath: string;
  playlistName: string;
  totalAudioFiles: number;
  usableTrackCount: number;
  duplicateCount: number;
  unreadableCount: number;
  unsupportedCount: number;
};

export type LocalMusicScanResult = {
  playlist: MusicPlaylist;
  tracks: MusicTrack[];
  summary: LocalMusicScanSummary;
};

function normalizeFilePath(filePath: string): string {
  return path
    .resolve(filePath)
    .replace(/\\/g, "/")
    .toLowerCase();
}

function createTrackId(filePath: string): string {
  return createHash("sha256")
    .update(normalizeFilePath(filePath))
    .digest("hex");
}

function cleanFileStem(fileName: string): string {
  return fileName
    .replace(
      /(\.(?:mp3|m4a|mp4|aac|wav|aiff|aif|flac|ogg|oga|opus))+$/i,
      ""
    )
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArtistAndTitle(
  fileName: string
): {
  artist: string;
  title: string;
} {
  const stem = cleanFileStem(fileName);
  const separatorIndex = stem.indexOf(" - ");

  if (separatorIndex > 0) {
    return {
      artist:
        stem.slice(0, separatorIndex).trim() ||
        "Unknown Artist",
      title:
        stem.slice(separatorIndex + 3).trim() ||
        stem,
    };
  }

  return {
    artist: "Unknown Artist",
    title: stem || fileName,
  };
}

async function collectFiles(
  folderPath: string
): Promise<{
  audioFiles: string[];
  unsupportedCount: number;
}> {
  const audioFiles: string[] = [];
  let unsupportedCount = 0;

  async function walk(currentPath: string) {
    if (audioFiles.length >= MAX_FILES) {
      return;
    }

    const entries = await readdir(currentPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(
        currentPath,
        entry.name
      );

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path
        .extname(entry.name)
        .toLowerCase();

      if (SUPPORTED_EXTENSIONS.has(extension)) {
        audioFiles.push(fullPath);

        if (audioFiles.length >= MAX_FILES) {
          break;
        }
      } else {
        unsupportedCount += 1;
      }
    }
  }

  await walk(folderPath);

  return {
    audioFiles,
    unsupportedCount,
  };
}

export async function scanLocalMusicFolder(
  rawFolderPath: string
): Promise<LocalMusicScanResult> {
  const trimmedFolderPath = rawFolderPath.trim();

  if (!trimmedFolderPath) {
    throw new Error("Enter a folder path.");
  }

  const folderPath = path.resolve(
    trimmedFolderPath
  );

  const folderStats = await stat(folderPath);

  if (!folderStats.isDirectory()) {
    throw new Error(
      "The selected path is not a folder."
    );
  }

  const {
    audioFiles,
    unsupportedCount,
  } = await collectFiles(folderPath);

  const tracks: MusicTrack[] = [];
  const seenPaths = new Set<string>();

  let duplicateCount = 0;
  let unreadableCount = 0;

  for (const filePath of audioFiles) {
    const normalized = normalizeFilePath(
      filePath
    );

    if (seenPaths.has(normalized)) {
      duplicateCount += 1;
      continue;
    }

    seenPaths.add(normalized);

    try {
      await access(
        filePath,
        constants.R_OK
      );
    } catch {
      unreadableCount += 1;
      continue;
    }

    const fileName = path.basename(filePath);

    const {
      artist,
      title,
    } = parseArtistAndTitle(fileName);

    const trackId = createTrackId(filePath);

    tracks.push({
      id: trackId,
      providerTrackId: trackId,
      provider: "local",
      title,
      artist,
      album:
        path.basename(
          path.dirname(filePath)
        ) || "Local Music",
      artwork: null,
      durationMs: 0,
      bpm: null,
      filePath,
      fileName,
    });
  }

  const playlistName =
    path.basename(folderPath) ||
    "Local Music";

  const playlist: MusicPlaylist = {
    id: `local-${createTrackId(
      folderPath
    )}`,
    providerPlaylistId: folderPath,
    provider: "local",
    name: playlistName,
    description: `Imported from ${folderPath}`,
    totalTracks: tracks.length,
    tracks,
  };

  return {
    playlist,
    tracks,
    summary: {
      folderPath,
      playlistName,
      totalAudioFiles:
        audioFiles.length,
      usableTrackCount:
        tracks.length,
      duplicateCount,
      unreadableCount,
      unsupportedCount,
    },
  };
}
