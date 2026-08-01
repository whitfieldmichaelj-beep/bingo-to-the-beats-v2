import path from "node:path";

import { parseCrate } from "serato-connect";

import { getSeratoLibrary } from "./service";
import type { SeratoPlaylist, SeratoTrack } from "./types";

interface TrackLookup {
  byPath: Map<string, SeratoTrack>;
  byExactFileName: Map<string, SeratoTrack | null>;
  byCleanFileName: Map<string, SeratoTrack | null>;
}

function normalizePath(value: string): string {
  let normalized = value
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .replace(/^file:\/\//i, "")
    .replace(/\/+/g, "/")
    .trim();

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original value when URI decoding is not possible.
  }

  return normalized.toLowerCase();
}

function normalizeExactFileName(value: string): string {
  return path
    .basename(normalizePath(value))
    .trim()
    .toLowerCase();
}

function normalizeCleanFileName(value: string): string {
  let fileName = normalizeExactFileName(value);

  // Convert repeated audio extensions such as .mp3.mp3 to one extension.
  fileName = fileName.replace(
    /(\.(?:mp3|m4a|aac|wav|aiff|aif|flac|ogg|alac|mp4))+$/i,
    ""
  );

  return fileName
    .replace(/[_-]+/g, " ")
    .replace(/[()[\]{}'",.&+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createPathVariants(value: string): string[] {
  const normalized = normalizePath(value);
  const variants = new Set<string>();

  if (!normalized) {
    return [];
  }

  variants.add(normalized);
  variants.add(normalized.replace(/^\/+/, ""));
  variants.add(`/${normalized.replace(/^\/+/, "")}`);

  const volumeMatch = normalized.match(
    /^\/?volumes\/[^/]+\/(.+)$/
  );

  if (volumeMatch?.[1]) {
    variants.add(volumeMatch[1]);
    variants.add(`/${volumeMatch[1]}`);
  }

  const userMatch = normalized.match(
    /^\/?users\/[^/]+\/(.+)$/
  );

  if (userMatch?.[1]) {
    variants.add(userMatch[1]);
    variants.add(`/${userMatch[1]}`);
  }

  return Array.from(variants);
}

function addUniqueLookupEntry(
  lookup: Map<string, SeratoTrack | null>,
  key: string,
  track: SeratoTrack
): void {
  if (!key) {
    return;
  }

  if (!lookup.has(key)) {
    lookup.set(key, track);
    return;
  }

  const existingTrack = lookup.get(key);

  if (existingTrack?.id !== track.id) {
    lookup.set(key, null);
  }
}

function buildTrackLookup(tracks: SeratoTrack[]): TrackLookup {
  const byPath = new Map<string, SeratoTrack>();
  const byExactFileName = new Map<string, SeratoTrack | null>();
  const byCleanFileName = new Map<string, SeratoTrack | null>();

  for (const track of tracks) {
    for (const pathVariant of createPathVariants(track.filePath)) {
      if (!byPath.has(pathVariant)) {
        byPath.set(pathVariant, track);
      }
    }

    addUniqueLookupEntry(
      byExactFileName,
      normalizeExactFileName(track.filePath),
      track
    );

    addUniqueLookupEntry(
      byCleanFileName,
      normalizeCleanFileName(track.filePath),
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
  crateTrackPath: string,
  lookup: TrackLookup
): SeratoTrack | undefined {
  for (const pathVariant of createPathVariants(crateTrackPath)) {
    const pathMatch = lookup.byPath.get(pathVariant);

    if (pathMatch) {
      return pathMatch;
    }
  }

  const exactFileName = normalizeExactFileName(crateTrackPath);
  const exactFileNameMatch =
    lookup.byExactFileName.get(exactFileName);

  if (exactFileNameMatch) {
    return exactFileNameMatch;
  }

  const cleanFileName = normalizeCleanFileName(crateTrackPath);
  const cleanFileNameMatch =
    lookup.byCleanFileName.get(cleanFileName);

  if (cleanFileNameMatch) {
    return cleanFileNameMatch;
  }

  return undefined;
}

export async function loadPlaylist(
  playlist: SeratoPlaylist
): Promise<SeratoPlaylist> {
  const parsedCrate = await parseCrate(playlist.filePath);
  const libraryResult = await getSeratoLibrary();

  const allLibraryTracks = libraryResult.libraries.flatMap(
    (library) => library.tracks
  );

  const lookup = buildTrackLookup(allLibraryTracks);
  const tracks: SeratoTrack[] = [];
  const addedTrackIds = new Set<string>();

  for (const crateTrackPath of parsedCrate.trackPaths) {
    const matchedTrack = findTrack(crateTrackPath, lookup);

    if (!matchedTrack || addedTrackIds.has(matchedTrack.id)) {
      continue;
    }

    addedTrackIds.add(matchedTrack.id);
    tracks.push(matchedTrack);
  }

  return {
    ...playlist,
    name: parsedCrate.name || playlist.name,
    trackCount: tracks.length,
    tracks,
  };
}