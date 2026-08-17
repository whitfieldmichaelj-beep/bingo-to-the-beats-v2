import { createHash } from "node:crypto";
import path from "node:path";
import {
  readFile,
  readdir,
} from "node:fs/promises";

import {
  getSeratoLibrary,
} from "./service";

import type {
  SeratoPlaylist,
  SeratoResult,
  SeratoTrack,
} from "./types";

/*
 * BTTB_SERATO_SMART_CRATES_V1
 *
 * Reads Serato .scrate files from each detected
 * _Serato_/SmartCrates folder.
 *
 * Existing .crate behavior is intentionally left alone.
 */

const SMART_CRATE_EXTENSION = ".scrate";
const LIBRARY_CACHE_MS = 5000;

let libraryCache:
  | {
      createdAt: number;
      promise: Promise<SeratoResult>;
    }
  | null = null;

function getLibrarySnapshot(): Promise<SeratoResult> {
  const now = Date.now();

  if (
    !libraryCache ||
    now - libraryCache.createdAt > LIBRARY_CACHE_MS
  ) {
    const promise = getSeratoLibrary().catch((error) => {
      libraryCache = null;
      throw error;
    });

    libraryCache = {
      createdAt: now,
      promise,
    };
  }

  return libraryCache.promise;
}

async function walkSmartCrates(
  directory: string
): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directory, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  const found: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      found.push(
        ...(await walkSmartCrates(entryPath))
      );
      continue;
    }

    if (
      entry.isFile() &&
      entry.name
        .toLowerCase()
        .endsWith(SMART_CRATE_EXTENSION)
    ) {
      found.push(entryPath);
    }
  }

  return found;
}

function makeSmartCrateId(filePath: string) {
  const digest = createHash("sha256")
    .update(filePath)
    .digest("hex")
    .slice(0, 24);

  return `serato-smart-${digest}`;
}

function makeSmartCrateName(
  filePath: string
) {
  const fileName = path.basename(
    filePath,
    path.extname(filePath)
  );

  const friendlyName = fileName
    .replace(/≫≫/g, " › ")
    .replace(/>>/g, " › ")
    .replace(/\s*›\s*/g, " › ")
    .trim();

  return `⚡ ${friendlyName}`;
}

function decodeUtf16Be(buffer: Buffer) {
  const evenLength =
    buffer.length - (buffer.length % 2);

  const swapped =
    Buffer.allocUnsafe(evenLength);

  for (
    let index = 0;
    index < evenLength;
    index += 2
  ) {
    swapped[index] =
      buffer[index + 1];
    swapped[index + 1] =
      buffer[index];
  }

  return swapped.toString("utf16le");
}

function normalizeTrackPath(
  rawValue: string
) {
  let normalized = rawValue
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .replace(/^file:\/\//i, "")
    .replace(/\/+/g, "/")
    .trim();

  try {
    normalized =
      decodeURIComponent(normalized);
  } catch {
    // Keep original text if URI decoding fails.
  }

  return normalized;
}

function readTaggedTrackPaths(
  buffer: Buffer,
  output: Set<string>,
  depth = 0
) {
  if (
    depth > 16 ||
    buffer.length < 8
  ) {
    return;
  }

  let offset = 0;

  while (offset + 8 <= buffer.length) {
    const tag = buffer
      .subarray(offset, offset + 4)
      .toString("ascii");

    const length =
      buffer.readUInt32BE(offset + 4);

    const payloadStart =
      offset + 8;

    const payloadEnd =
      payloadStart + length;

    if (
      length > buffer.length ||
      payloadEnd > buffer.length
    ) {
      break;
    }

    const payload =
      buffer.subarray(
        payloadStart,
        payloadEnd
      );

    if (tag === "ptrk") {
      const trackPath =
        normalizeTrackPath(
          decodeUtf16Be(payload)
        );

      if (trackPath) {
        output.add(trackPath);
      }
    }

    if (
      tag.startsWith("o") &&
      payload.length >= 8
    ) {
      readTaggedTrackPaths(
        payload,
        output,
        depth + 1
      );
    }

    offset = payloadEnd;
  }
}

const AUDIO_EXTENSIONS =
  /\.(mp3|m4a|aac|wav|aiff|aif|flac|ogg|opus|wma|alac|mp4)$/i;

function collectAudioPaths(
  text: string
) {
  const results =
    new Set<string>();

  const patterns = [
    /(?:\/Volumes\/|\/Users\/|[A-Za-z]:\/)[^\u0000\r\n"'<>]+?\.(?:mp3|m4a|aac|wav|aiff|aif|flac|ogg|opus|wma|alac|mp4)/gi,
    /[^\u0000\r\n"'<>]{2,}?\.(?:mp3|m4a|aac|wav|aiff|aif|flac|ogg|opus|wma|alac|mp4)/gi,
  ];

  for (const pattern of patterns) {
    for (
      const match of text.matchAll(pattern)
    ) {
      const candidate =
        normalizeTrackPath(match[0]);

      if (
        candidate.length >= 5 &&
        candidate.length <= 2048 &&
        AUDIO_EXTENSIONS.test(candidate)
      ) {
        results.add(candidate);
      }
    }
  }

  return results;
}

async function extractSmartCrateTrackPaths(
  filePath: string
) {
  const buffer =
    await readFile(filePath);

  const paths =
    new Set<string>();

  readTaggedTrackPaths(
    buffer,
    paths
  );

  if (paths.size === 0) {
    const decodedVersions = [
      buffer.toString("utf8"),
      buffer.toString("latin1"),
      buffer.toString("utf16le"),
      decodeUtf16Be(buffer),
    ];

    for (
      const decoded of decodedVersions
    ) {
      for (
        const trackPath of
          collectAudioPaths(decoded)
      ) {
        paths.add(trackPath);
      }
    }
  }

  return Array.from(paths);
}

function normalizeLookupPath(
  value: string
) {
  return normalizeTrackPath(value)
    .toLowerCase();
}

function createPathVariants(
  value: string
) {
  const normalized =
    normalizeLookupPath(value);

  const variants =
    new Set<string>();

  if (!normalized) {
    return [];
  }

  variants.add(normalized);
  variants.add(
    normalized.replace(/^\/+/, "")
  );
  variants.add(
    `/${normalized.replace(/^\/+/, "")}`
  );

  const volumeMatch =
    normalized.match(
      /^\/?volumes\/[^/]+\/(.+)$/
    );

  if (volumeMatch?.[1]) {
    variants.add(volumeMatch[1]);
    variants.add(
      `/${volumeMatch[1]}`
    );
  }

  const userMatch =
    normalized.match(
      /^\/?users\/[^/]+\/(.+)$/
    );

  if (userMatch?.[1]) {
    variants.add(userMatch[1]);
    variants.add(
      `/${userMatch[1]}`
    );
  }

  return Array.from(variants);
}

function exactFileName(
  value: string
) {
  return path
    .basename(normalizeLookupPath(value))
    .trim()
    .toLowerCase();
}

function cleanFileName(
  value: string
) {
  return exactFileName(value)
    .replace(
      /(\.(?:mp3|m4a|aac|wav|aiff|aif|flac|ogg|opus|wma|alac|mp4))+$/i,
      ""
    )
    .replace(/[_-]+/g, " ")
    .replace(/[()[\]{}'",.&+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type TrackLookup = {
  byPath: Map<string, SeratoTrack>;
  byExactFileName:
    Map<string, SeratoTrack | null>;
  byCleanFileName:
    Map<string, SeratoTrack | null>;
};

function addUnique(
  lookup:
    Map<string, SeratoTrack | null>,
  key: string,
  track: SeratoTrack
) {
  if (!key) {
    return;
  }

  if (!lookup.has(key)) {
    lookup.set(key, track);
    return;
  }

  const existing =
    lookup.get(key);

  if (
    existing &&
    existing.id !== track.id
  ) {
    lookup.set(key, null);
  }
}

function buildTrackLookup(
  tracks: SeratoTrack[]
): TrackLookup {
  const byPath =
    new Map<string, SeratoTrack>();

  const byExactFileName =
    new Map<
      string,
      SeratoTrack | null
    >();

  const byCleanFileName =
    new Map<
      string,
      SeratoTrack | null
    >();

  for (const track of tracks) {
    for (
      const variant of
        createPathVariants(
          track.filePath
        )
    ) {
      if (!byPath.has(variant)) {
        byPath.set(
          variant,
          track
        );
      }
    }

    addUnique(
      byExactFileName,
      exactFileName(track.filePath),
      track
    );

    addUnique(
      byCleanFileName,
      cleanFileName(track.filePath),
      track
    );
  }

  return {
    byPath,
    byExactFileName,
    byCleanFileName,
  };
}

function findTrack(
  smartCrateTrackPath: string,
  lookup: TrackLookup
) {
  for (
    const variant of
      createPathVariants(
        smartCrateTrackPath
      )
  ) {
    const match =
      lookup.byPath.get(variant);

    if (match) {
      return match;
    }
  }

  const exact =
    lookup.byExactFileName.get(
      exactFileName(
        smartCrateTrackPath
      )
    );

  if (exact) {
    return exact;
  }

  const clean =
    lookup.byCleanFileName.get(
      cleanFileName(
        smartCrateTrackPath
      )
    );

  return clean ?? undefined;
}

export function isSeratoSmartCrate(
  playlist: SeratoPlaylist
) {
  return playlist.filePath
    .toLowerCase()
    .endsWith(
      SMART_CRATE_EXTENSION
    );
}

export async function getSeratoSmartCrates():
  Promise<SeratoPlaylist[]> {
  const libraryResult =
    await getLibrarySnapshot();

  const filePaths =
    (
      await Promise.all(
        libraryResult.libraries.map(
          (library) =>
            walkSmartCrates(
              path.join(
                library.seratoPath,
                "SmartCrates"
              )
            )
        )
      )
    ).flat();

  const uniqueFilePaths =
    Array.from(
      new Set(filePaths)
    );

  return uniqueFilePaths
    .map((filePath) => ({
      id:
        makeSmartCrateId(
          filePath
        ),
      name:
        makeSmartCrateName(
          filePath
        ),
      filePath,
      trackCount: 0,
      tracks: [],
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
}

export async function loadSeratoSmartCrate(
  playlist: SeratoPlaylist
): Promise<SeratoPlaylist> {
  if (
    !isSeratoSmartCrate(
      playlist
    )
  ) {
    throw new Error(
      "This playlist is not a Serato Smart Crate."
    );
  }

  const [
    trackPaths,
    libraryResult,
  ] = await Promise.all([
    extractSmartCrateTrackPaths(
      playlist.filePath
    ),
    getLibrarySnapshot(),
  ]);

  const allLibraryTracks =
    libraryResult.libraries.flatMap(
      (library) =>
        library.tracks
    );

  const lookup =
    buildTrackLookup(
      allLibraryTracks
    );

  const tracks:
    SeratoTrack[] = [];

  const addedTrackIds =
    new Set<string>();

  for (
    const trackPath of trackPaths
  ) {
    const matchedTrack =
      findTrack(
        trackPath,
        lookup
      );

    if (
      !matchedTrack ||
      addedTrackIds.has(
        matchedTrack.id
      )
    ) {
      continue;
    }

    addedTrackIds.add(
      matchedTrack.id
    );

    tracks.push(
      matchedTrack
    );
  }

  return {
    ...playlist,
    trackCount:
      tracks.length,
    tracks,
  };
}
