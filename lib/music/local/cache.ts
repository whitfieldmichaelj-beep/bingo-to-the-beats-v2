import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  LocalMusicScanResult,
} from "@/types/local-music";

const CACHE_VERSION = 1;
const CACHE_FOLDER_NAME =
  "bingo-to-the-beats";
const CACHE_FILE_PREFIX =
  "local-music-library";

type LocalMusicCacheEnvelope = {
  version: number;
  savedAt: string;
  library: LocalMusicScanResult;
};

export type LocalMusicCacheInfo = {
  exists: boolean;
  cacheFilePath: string;
  sizeBytes: number;
  modifiedAt: string | null;
};

function createLibraryKey(
  value: string
): string {
  return createHash("sha256")
    .update(
      value
        .replace(/\\/g, "/")
        .toLowerCase()
    )
    .digest("hex")
    .slice(0, 20);
}

function sanitizeFilePart(
  value: string
): string {
  return value
    .trim()
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-"
    )
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getDefaultCacheDirectory(): string {
  const override =
    process.env
      .BINGO_LOCAL_MUSIC_CACHE_DIR
      ?.trim();

  if (override) {
    return path.resolve(override);
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Caches",
      CACHE_FOLDER_NAME
    );
  }

  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA?.trim();

    if (localAppData) {
      return path.join(
        localAppData,
        CACHE_FOLDER_NAME,
        "Cache"
      );
    }
  }

  return path.join(
    os.homedir(),
    ".cache",
    CACHE_FOLDER_NAME
  );
}

export function getLocalMusicCacheDirectory(): string {
  return getDefaultCacheDirectory();
}

export function getLocalMusicCacheFilePath(
  libraryIdOrRootFolder: string
): string {
  const value =
    libraryIdOrRootFolder.trim();

  if (!value) {
    throw new Error(
      "A library ID or root folder path is required."
    );
  }

  const readablePart =
    sanitizeFilePart(
      path.basename(value)
    ) || "library";

  const key =
    createLibraryKey(value);

  return path.join(
    getLocalMusicCacheDirectory(),
    `${CACHE_FILE_PREFIX}-${readablePart}-${key}.json`
  );
}

async function ensureCacheDirectory(): Promise<string> {
  const cacheDirectory =
    getLocalMusicCacheDirectory();

  await mkdir(cacheDirectory, {
    recursive: true,
  });

  return cacheDirectory;
}

function validateCacheEnvelope(
  value: unknown
): value is LocalMusicCacheEnvelope {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const record =
    value as Partial<
      LocalMusicCacheEnvelope
    >;

  if (
    record.version !==
      CACHE_VERSION ||
    typeof record.savedAt !==
      "string" ||
    !record.library ||
    typeof record.library !==
      "object"
  ) {
    return false;
  }

  const library =
    record.library as Partial<
      LocalMusicScanResult
    >;

  return (
    library.ok === true &&
    typeof library.libraryId ===
      "string" &&
    typeof library.rootFolderPath ===
      "string" &&
    Array.isArray(library.tracks) &&
    Array.isArray(library.folders) &&
    Array.isArray(library.playlists)
  );
}

async function writeJsonAtomically(
  filePath: string,
  contents: string
): Promise<void> {
  const temporaryFilePath =
    `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(
      temporaryFilePath,
      contents,
      "utf8"
    );

    await rename(
      temporaryFilePath,
      filePath
    );
  } catch (error) {
    await rm(
      temporaryFilePath,
      {
        force: true,
      }
    ).catch(() => undefined);

    throw error;
  }
}

export async function saveLocalMusicCache(
  library: LocalMusicScanResult
): Promise<string> {
  await ensureCacheDirectory();

  const cacheFilePath =
    getLocalMusicCacheFilePath(
      library.libraryId ||
        library.rootFolderPath
    );

  const envelope: LocalMusicCacheEnvelope = {
    version: CACHE_VERSION,
    savedAt:
      new Date().toISOString(),
    library,
  };

  await writeJsonAtomically(
    cacheFilePath,
    JSON.stringify(
      envelope,
      null,
      2
    )
  );

  return cacheFilePath;
}

export async function loadLocalMusicCache(
  libraryIdOrRootFolder: string
): Promise<
  LocalMusicScanResult | null
> {
  const cacheFilePath =
    getLocalMusicCacheFilePath(
      libraryIdOrRootFolder
    );

  let raw: string;

  try {
    raw = await readFile(
      cacheFilePath,
      "utf8"
    );
  } catch (error) {
    const code =
      (
        error as NodeJS.ErrnoException
      ).code;

    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    await rm(
      cacheFilePath,
      {
        force: true,
      }
    );

    return null;
  }

  if (!validateCacheEnvelope(parsed)) {
    await rm(
      cacheFilePath,
      {
        force: true,
      }
    );

    return null;
  }

  return parsed.library;
}

export async function deleteLocalMusicCache(
  libraryIdOrRootFolder: string
): Promise<void> {
  const cacheFilePath =
    getLocalMusicCacheFilePath(
      libraryIdOrRootFolder
    );

  await rm(cacheFilePath, {
    force: true,
  });
}

export async function getLocalMusicCacheInfo(
  libraryIdOrRootFolder: string
): Promise<LocalMusicCacheInfo> {
  const cacheFilePath =
    getLocalMusicCacheFilePath(
      libraryIdOrRootFolder
    );

  try {
    const fileStats =
      await stat(cacheFilePath);

    return {
      exists: true,
      cacheFilePath,
      sizeBytes:
        fileStats.size,
      modifiedAt:
        fileStats.mtime.toISOString(),
    };
  } catch (error) {
    const code =
      (
        error as NodeJS.ErrnoException
      ).code;

    if (code === "ENOENT") {
      return {
        exists: false,
        cacheFilePath,
        sizeBytes: 0,
        modifiedAt: null,
      };
    }

    throw error;
  }
}

export async function loadOrCreateLocalMusicCache(
  libraryIdOrRootFolder: string,
  createLibrary: () =>
    Promise<LocalMusicScanResult>
): Promise<LocalMusicScanResult> {
  const cachedLibrary =
    await loadLocalMusicCache(
      libraryIdOrRootFolder
    );

  if (cachedLibrary) {
    return cachedLibrary;
  }

  const library =
    await createLibrary();

  await saveLocalMusicCache(
    library
  );

  return library;
}

export const LOCAL_MUSIC_CACHE_VERSION =
  CACHE_VERSION;
