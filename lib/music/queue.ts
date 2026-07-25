// lib/music/queue.ts

import type {
  QueueHealth,
  QueueSong,
} from "@/lib/game/GameSession";

export type AppleMusicIdType = "catalog" | "library";

export interface PlayableQueueSong extends QueueSong {
  playbackId: string;
  playbackIdType: AppleMusicIdType;
}

export interface SkippedQueueSong {
  song: QueueSong;
  reason: string;
}

export interface PreparedQueue {
  songs: PlayableQueueSong[];
  skippedSongs: SkippedQueueSong[];
  health: QueueHealth;
}

export interface QueuePreparationOptions {
  shuffle?: boolean;
  removeDuplicates?: boolean;
}

/**
 * Apple Music library song IDs commonly begin with "i.".
 */
export function isLibrarySongId(
  value: string | undefined
): value is string {
  return Boolean(
    value &&
      typeof value === "string" &&
      value.trim().startsWith("i.")
  );
}

/**
 * Apple Music catalog IDs are normally numeric strings.
 */
export function isCatalogSongId(
  value: string | undefined
): value is string {
  return Boolean(
    value &&
      typeof value === "string" &&
      /^\d+$/.test(value.trim())
  );
}

function cleanOptionalId(
  value: string | undefined
): string | undefined {
  const cleaned = value?.trim();

  return cleaned || undefined;
}

/**
 * Normalizes IDs without changing the original song object.
 *
 * The function also handles older song records where the general `id`
 * field may contain either a catalog ID or a library ID.
 */
export function normalizeQueueSong(
  song: QueueSong
): QueueSong {
  const originalId = cleanOptionalId(song.id);
  let catalogId = cleanOptionalId(song.catalogId);
  let libraryId = cleanOptionalId(song.libraryId);

  if (!catalogId && isCatalogSongId(originalId)) {
    catalogId = originalId;
  }

  if (!libraryId && isLibrarySongId(originalId)) {
    libraryId = originalId;
  }

  return {
    ...song,
    id:
      originalId ||
      catalogId ||
      libraryId ||
      crypto.randomUUID(),
    title: song.title?.trim() || "Unknown Song",
    artist: song.artist?.trim() || "Unknown Artist",
    catalogId,
    libraryId,
  };
}

/**
 * Chooses the best ID for Apple Music playback.
 *
 * Catalog IDs are preferred because imported Spotify playlists may contain
 * library entries whose library IDs cannot be resolved consistently by a
 * catalog queue.
 *
 * The library ID remains available as a fallback.
 */
export function getPreferredPlaybackId(
  song: QueueSong
): {
  playbackId: string;
  playbackIdType: AppleMusicIdType;
} | null {
  const normalizedSong = normalizeQueueSong(song);

  if (isCatalogSongId(normalizedSong.catalogId)) {
    return {
      playbackId: normalizedSong.catalogId,
      playbackIdType: "catalog",
    };
  }

  if (isLibrarySongId(normalizedSong.libraryId)) {
    return {
      playbackId: normalizedSong.libraryId,
      playbackIdType: "library",
    };
  }

  return null;
}

function getDuplicateKey(song: QueueSong): string {
  const normalizedSong = normalizeQueueSong(song);

  if (normalizedSong.catalogId) {
    return `catalog:${normalizedSong.catalogId}`;
  }

  if (normalizedSong.libraryId) {
    return `library:${normalizedSong.libraryId}`;
  }

  return [
    "metadata",
    normalizedSong.title.toLowerCase(),
    normalizedSong.artist.toLowerCase(),
  ].join(":");
}

function shuffleSongs<T>(songs: T[]): T[] {
  const shuffled = [...songs];

  for (
    let currentIndex = shuffled.length - 1;
    currentIndex > 0;
    currentIndex -= 1
  ) {
    const randomIndex = Math.floor(
      Math.random() * (currentIndex + 1)
    );

    [shuffled[currentIndex], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[currentIndex],
    ];
  }

  return shuffled;
}

/**
 * Prepares the playlist before it reaches the MusicKit player.
 *
 * This performs structural validation:
 * - normalizes catalog and library IDs;
 * - removes songs without any usable Apple Music ID;
 * - optionally removes duplicate songs;
 * - optionally shuffles the final queue;
 * - returns queue-health totals.
 *
 * MusicKit playback validation will happen in the player module because an ID
 * can be structurally valid but still unavailable for the user's storefront.
 */
export function prepareQueue(
  sourceSongs: QueueSong[],
  options: QueuePreparationOptions = {}
): PreparedQueue {
  const {
    shuffle = true,
    removeDuplicates = true,
  } = options;

  const playableSongs: PlayableQueueSong[] = [];
  const skippedSongs: SkippedQueueSong[] = [];
  const duplicateKeys = new Set<string>();

  for (const originalSong of sourceSongs) {
    const song = normalizeQueueSong(originalSong);
    const playback = getPreferredPlaybackId(song);

    if (!playback) {
      skippedSongs.push({
        song,
        reason:
          "No usable Apple Music catalog ID or library ID was found.",
      });

      continue;
    }

    const duplicateKey = getDuplicateKey(song);

    if (
      removeDuplicates &&
      duplicateKeys.has(duplicateKey)
    ) {
      skippedSongs.push({
        song,
        reason: "Duplicate song removed from the queue.",
      });

      continue;
    }

    duplicateKeys.add(duplicateKey);

    playableSongs.push({
      ...song,
      playbackId: playback.playbackId,
      playbackIdType: playback.playbackIdType,
    });
  }

  const finalSongs = shuffle
    ? shuffleSongs(playableSongs)
    : playableSongs;

  return {
    songs: finalSongs,
    skippedSongs,
    health: {
      totalSongs: sourceSongs.length,
      playableSongs: finalSongs.length,
      skippedSongs: skippedSongs.length,
    },
  };
}

/**
 * Returns the next queue index while respecting the end-of-playlist setting.
 */
export function getNextQueueIndex(
  currentIndex: number,
  queueLength: number,
  repeatPlaylist = false
): number | null {
  if (queueLength <= 0) {
    return null;
  }

  const nextIndex = currentIndex + 1;

  if (nextIndex < queueLength) {
    return nextIndex;
  }

  return repeatPlaylist ? 0 : null;
}

/**
 * Returns the previous queue index.
 */
export function getPreviousQueueIndex(
  currentIndex: number,
  queueLength: number
): number | null {
  if (queueLength <= 0) {
    return null;
  }

  if (currentIndex <= 0) {
    return 0;
  }

  return currentIndex - 1;
}

/**
 * Removes a song that MusicKit could not resolve during playback.
 */
export function removeUnplayableSong(
  queue: PlayableQueueSong[],
  songIndex: number,
  reason = "Apple Music could not resolve this song."
): {
  queue: PlayableQueueSong[];
  skippedSong: SkippedQueueSong | null;
} {
  if (
    songIndex < 0 ||
    songIndex >= queue.length
  ) {
    return {
      queue,
      skippedSong: null,
    };
  }

  const song = queue[songIndex];

  return {
    queue: queue.filter(
      (_, index) => index !== songIndex
    ),
    skippedSong: {
      song,
      reason,
    },
  };
}

/**
 * Produces a safe queue-health summary after runtime skips.
 */
export function calculateQueueHealth(
  originalTotal: number,
  currentQueueLength: number
): QueueHealth {
  return {
    totalSongs: originalTotal,
    playableSongs: currentQueueLength,
    skippedSongs: Math.max(
      originalTotal - currentQueueLength,
      0
    ),
  };
}