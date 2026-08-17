import {
  createHash,
  randomUUID,
} from "node:crypto";

import type {
  LocalMusicTrack,
} from "@/types/local-music";

import {
  getLocalMusicPlaylistById,
  getLocalMusicTrackById,
  getPlayableLocalMusicTracks,
} from "./library";

const DEFAULT_MINIMUM_SONGS = 25;
const DEFAULT_IDEAL_SONGS = 75;
const DEFAULT_REQUESTED_SONGS = 80;
const DEFAULT_MAXIMUM_SONGS = 200;

export type LocalMusicGameReadiness =
  | "ready"
  | "warning"
  | "blocked";

export type LocalMusicGameAdvisor = {
  readiness: LocalMusicGameReadiness;
  availableTrackCount: number;
  selectedTrackCount: number;
  minimumTrackCount: number;
  idealTrackCount: number;
  recommendedTrackCount: number;
  duplicateTrackCount: number;
  unreadableTrackCount: number;
  missingArtistCount: number;
  missingTitleCount: number;
  issues: string[];
  recommendations: string[];
};

export type BuildLocalMusicGameOptions = {
  gameName?: string;
  playlistId?: string | null;
  trackIds?: string[];
  requestedTrackCount?: number;
  minimumTrackCount?: number;
  idealTrackCount?: number;
  maximumTrackCount?: number;
  includeDuplicates?: boolean;
  includeUnreadable?: boolean;
  seed?: string;
};

export type LocalMusicGame = {
  id: string;
  name: string;
  source: "local";
  createdAt: string;
  playlistId: string | null;
  seed: string;
  tracks: LocalMusicTrack[];
  advisor: LocalMusicGameAdvisor;
};

function clampInteger(
  value: number,
  minimum: number,
  maximum: number
): number {
  const normalized = Number.isFinite(value)
    ? Math.floor(value)
    : minimum;

  return Math.min(
    maximum,
    Math.max(minimum, normalized)
  );
}

function normalizeSeed(
  seed: string | undefined
): string {
  const normalized = seed?.trim();

  if (normalized) {
    return normalized;
  }

  return randomUUID();
}

function hashSeed(seed: string): number {
  const digest = createHash("sha256")
    .update(seed)
    .digest();

  return digest.readUInt32LE(0);
}

function createSeededRandom(
  seed: string
): () => number {
  let state = hashSeed(seed) || 1;

  return () => {
    state += 0x6d2b79f5;

    let value = state;

    value = Math.imul(
      value ^ (value >>> 15),
      value | 1
    );

    value ^= value +
      Math.imul(
        value ^ (value >>> 7),
        value | 61
      );

    return (
      (
        value ^ (value >>> 14)
      ) >>> 0
    ) / 4294967296;
  };
}

function shuffleTracks(
  tracks: LocalMusicTrack[],
  seed: string
): LocalMusicTrack[] {
  const shuffled = [...tracks];
  const random = createSeededRandom(seed);

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const targetIndex = Math.floor(
      random() * (index + 1)
    );

    [
      shuffled[index],
      shuffled[targetIndex],
    ] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function uniqueTracksById(
  tracks: LocalMusicTrack[]
): LocalMusicTrack[] {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    if (seen.has(track.id)) {
      return false;
    }

    seen.add(track.id);
    return true;
  });
}

function resolveRequestedTracks(
  options: BuildLocalMusicGameOptions
): LocalMusicTrack[] {
  if (
    options.trackIds &&
    options.trackIds.length > 0
  ) {
    return uniqueTracksById(
      options.trackIds
        .map((trackId) =>
          getLocalMusicTrackById(trackId)
        )
        .filter(
          (
            track
          ): track is LocalMusicTrack =>
            Boolean(track)
        )
    );
  }

  if (options.playlistId) {
    const playlist =
      getLocalMusicPlaylistById(
        options.playlistId
      );

    if (!playlist) {
      throw new Error(
        "The selected local music playlist could not be found."
      );
    }

    return uniqueTracksById(
      playlist.tracks
    );
  }

  return uniqueTracksById(
    getPlayableLocalMusicTracks()
  );
}

function filterTracks(
  tracks: LocalMusicTrack[],
  options: BuildLocalMusicGameOptions
): LocalMusicTrack[] {
  return tracks.filter((track) => {
    if (
      !options.includeUnreadable &&
      !track.readable
    ) {
      return false;
    }

    if (
      !options.includeDuplicates &&
      track.duplicate
    ) {
      return false;
    }

    return true;
  });
}

export function adviseLocalMusicGame(
  tracks: LocalMusicTrack[],
  options: Pick<
    BuildLocalMusicGameOptions,
    | "minimumTrackCount"
    | "idealTrackCount"
    | "maximumTrackCount"
    | "requestedTrackCount"
  > = {}
): LocalMusicGameAdvisor {
  const minimumTrackCount =
    clampInteger(
      options.minimumTrackCount ??
        DEFAULT_MINIMUM_SONGS,
      1,
      DEFAULT_MAXIMUM_SONGS
    );

  const idealTrackCount =
    clampInteger(
      options.idealTrackCount ??
        DEFAULT_IDEAL_SONGS,
      minimumTrackCount,
      DEFAULT_MAXIMUM_SONGS
    );

  const maximumTrackCount =
    clampInteger(
      options.maximumTrackCount ??
        DEFAULT_MAXIMUM_SONGS,
      idealTrackCount,
      10_000
    );

  const requestedTrackCount =
    clampInteger(
      options.requestedTrackCount ??
        DEFAULT_REQUESTED_SONGS,
      1,
      maximumTrackCount
    );

  const availableTrackCount =
    tracks.length;

  const selectedTrackCount =
    Math.min(
      requestedTrackCount,
      availableTrackCount
    );

  const duplicateTrackCount =
    tracks.filter(
      (track) => track.duplicate
    ).length;

  const unreadableTrackCount =
    tracks.filter(
      (track) => !track.readable
    ).length;

  const missingArtistCount =
    tracks.filter(
      (track) =>
        !track.artist ||
        track.artist ===
          "Unknown Artist"
    ).length;

  const missingTitleCount =
    tracks.filter(
      (track) =>
        !track.title ||
        track.title ===
          "Unknown Song"
    ).length;

  const issues: string[] = [];
  const recommendations: string[] = [];

  let readiness: LocalMusicGameReadiness =
    "ready";

  if (
    availableTrackCount <
    minimumTrackCount
  ) {
    readiness = "blocked";

    issues.push(
      `Only ${availableTrackCount} playable songs are available. At least ${minimumTrackCount} are required.`
    );

    recommendations.push(
      `Add at least ${
        minimumTrackCount -
        availableTrackCount
      } more playable songs.`
    );
  } else if (
    availableTrackCount <
    idealTrackCount
  ) {
    readiness = "warning";

    issues.push(
      `${availableTrackCount} playable songs are available, which is below the recommended ${idealTrackCount}.`
    );

    recommendations.push(
      `Add ${
        idealTrackCount -
        availableTrackCount
      } more songs for better card variety.`
    );
  }

  if (duplicateTrackCount > 0) {
    if (readiness === "ready") {
      readiness = "warning";
    }

    issues.push(
      `${duplicateTrackCount} duplicate song${
        duplicateTrackCount === 1
          ? ""
          : "s"
      } detected.`
    );

    recommendations.push(
      "Exclude duplicate songs before creating the game."
    );
  }

  if (unreadableTrackCount > 0) {
    if (readiness === "ready") {
      readiness = "warning";
    }

    issues.push(
      `${unreadableTrackCount} unreadable song file${
        unreadableTrackCount === 1
          ? ""
          : "s"
      } detected.`
    );

    recommendations.push(
      "Remove or repair unreadable song files."
    );
  }

  if (
    missingArtistCount > 0 ||
    missingTitleCount > 0
  ) {
    if (readiness === "ready") {
      readiness = "warning";
    }

    issues.push(
      `${missingArtistCount} song${
        missingArtistCount === 1
          ? ""
          : "s"
      } missing an artist and ${missingTitleCount} missing a title.`
    );

    recommendations.push(
      "Rename music files using the format Artist - Song Title."
    );
  }

  if (issues.length === 0) {
    recommendations.push(
      "This music selection is ready to create a game."
    );
  }

  return {
    readiness,
    availableTrackCount,
    selectedTrackCount,
    minimumTrackCount,
    idealTrackCount,
    recommendedTrackCount:
      Math.min(
        idealTrackCount,
        availableTrackCount
      ),
    duplicateTrackCount,
    unreadableTrackCount,
    missingArtistCount,
    missingTitleCount,
    issues,
    recommendations,
  };
}

export function buildLocalMusicGame(
  options: BuildLocalMusicGameOptions = {}
): LocalMusicGame {
  const seed = normalizeSeed(
    options.seed
  );

  const availableTracks =
    resolveRequestedTracks(options);

  const advisor =
    adviseLocalMusicGame(
      availableTracks,
      options
    );

  if (
    advisor.readiness ===
    "blocked"
  ) {
    throw new Error(
      advisor.issues[0] ??
        "There are not enough songs to create this game."
    );
  }

  const maximumTrackCount =
    clampInteger(
      options.maximumTrackCount ??
        DEFAULT_MAXIMUM_SONGS,
      1,
      10_000
    );

  const requestedTrackCount =
    clampInteger(
      options.requestedTrackCount ??
        DEFAULT_REQUESTED_SONGS,
      1,
      maximumTrackCount
    );

  const filteredTracks =
    filterTracks(
      availableTracks,
      options
    );

  const tracks = shuffleTracks(
    filteredTracks,
    seed
  ).slice(0, requestedTrackCount);

  if (
    tracks.length <
    advisor.minimumTrackCount
  ) {
    throw new Error(
      `Only ${tracks.length} eligible songs remain after filtering. At least ${advisor.minimumTrackCount} are required.`
    );
  }

  return {
    id: `local-game-${randomUUID()}`,
    name:
      options.gameName?.trim() ||
      "Local Music Game",
    source: "local",
    createdAt:
      new Date().toISOString(),
    playlistId:
      options.playlistId ?? null,
    seed,
    tracks,
    advisor: {
      ...advisor,
      selectedTrackCount:
        tracks.length,
    },
  };
}
