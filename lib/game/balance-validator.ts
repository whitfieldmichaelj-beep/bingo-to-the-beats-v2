import type { BingoPattern } from "./types";

export type GameBalanceStatus =
  | "ready"
  | "warning"
  | "blocked";

export type GameRiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "extreme";

export interface GameBalanceInput {
  uniqueSongCount: number;
  requestedCardCount: number;
  bingoPattern: BingoPattern;
  clipLength?: number;
  rows?: number;
  columns?: number;
}

export interface GameBalanceAnalysis {
  status: GameBalanceStatus;
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  risk: GameRiskLevel;

  uniqueSongCount: number;
  requestedCardCount: number;
  songsPerCard: number;
  winningPattern: BingoPattern;

  recommendedMaximumCards: number;
  minimumRequiredSongs: number;
  recommendedSongCount: number;
  additionalSongsRecommended: number;

  winningPathsPerCard: number;
  minimumMarksToWin: number;

  estimatedCalledSongs: {
    minimum: number;
    maximum: number;
  };

  estimatedDurationMinutes: {
    minimum: number;
    maximum: number;
  };

  summary: string;
  patternGuideline: string;
  recommendations: string[];
  checks: string[];
}

type PatternProfile = {
  winningPaths: number;
  minimumMarks: number;
  capacityMultiplier: number;
  recommendedSongs: number;
  scorePenalty: number;
  calledSongRange: [number, number];
  guideline: string;
};

const MINIMUM_SONGS_PER_CARD = 25;
const DEFAULT_CLIP_LENGTH = 30;
const MAX_RECOMMENDED_CARDS = 5000;

const PATTERN_PROFILES: Record<string, PatternProfile> = {
  "single-line": {
    winningPaths: 12,
    minimumMarks: 5,
    capacityMultiplier: 0.18,
    recommendedSongs: 40,
    scorePenalty: 8,
    calledSongRange: [0.42, 0.68],
    guideline:
      "Any-line games have 12 possible winning lines on every card. Use more songs or fewer cards to reduce simultaneous winners.",
  },
  "any-line": {
    winningPaths: 12,
    minimumMarks: 5,
    capacityMultiplier: 0.18,
    recommendedSongs: 40,
    scorePenalty: 8,
    calledSongRange: [0.42, 0.68],
    guideline:
      "Any-line games have 12 possible winning lines on every card. Use more songs or fewer cards to reduce simultaneous winners.",
  },
  across: {
    winningPaths: 5,
    minimumMarks: 5,
    capacityMultiplier: 0.24,
    recommendedSongs: 36,
    scorePenalty: 4,
    calledSongRange: [0.46, 0.72],
    guideline:
      "Across-only games have five winning rows per card. Avoid repeating the same five-song row combinations across many cards.",
  },
  down: {
    winningPaths: 5,
    minimumMarks: 5,
    capacityMultiplier: 0.24,
    recommendedSongs: 36,
    scorePenalty: 4,
    calledSongRange: [0.46, 0.72],
    guideline:
      "Down-only games have five winning columns per card. More playlist variation helps keep column combinations unique.",
  },
  diagonal: {
    winningPaths: 2,
    minimumMarks: 5,
    capacityMultiplier: 0.32,
    recommendedSongs: 32,
    scorePenalty: 2,
    calledSongRange: [0.5, 0.78],
    guideline:
      "Diagonal-only games have two winning paths per card. They generally support more cards than any-line games with the same playlist.",
  },
  "four-corners": {
    winningPaths: 1,
    minimumMarks: 4,
    capacityMultiplier: 0.14,
    recommendedSongs: 45,
    scorePenalty: 10,
    calledSongRange: [0.25, 0.52],
    guideline:
      "Four-corners can produce an early winner after only four songs. Use a larger playlist and fewer cards to limit early ties.",
  },
  "x-pattern": {
    winningPaths: 1,
    minimumMarks: 9,
    capacityMultiplier: 0.22,
    recommendedSongs: 38,
    scorePenalty: 5,
    calledSongRange: [0.56, 0.8],
    guideline:
      "The X pattern uses both diagonals. Keep the nine-song X combination different across cards whenever possible.",
  },
  "full-card": {
    winningPaths: 1,
    minimumMarks: 25,
    capacityMultiplier: 0.2,
    recommendedSongs: 50,
    scorePenalty: 7,
    calledSongRange: [0.78, 0.98],
    guideline:
      "Full-card games last longer. Cards must not share identical 25-song sets, even when their square positions differ.",
  },
  blackout: {
    winningPaths: 1,
    minimumMarks: 25,
    capacityMultiplier: 0.2,
    recommendedSongs: 50,
    scorePenalty: 7,
    calledSongRange: [0.78, 0.98],
    guideline:
      "Blackout requires every square. Use a large playlist so cards do not finish together from nearly identical song sets.",
  },
};

function normalizeWholeNumber(
  value: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function getProfile(
  pattern: BingoPattern
): PatternProfile {
  return (
    PATTERN_PROFILES[pattern] ??
    PATTERN_PROFILES["any-line"]
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function getGrade(
  score: number
): GameBalanceAnalysis["grade"] {
  if (score >= 95) return "A+";
  if (score >= 88) return "A";
  if (score >= 78) return "B";
  if (score >= 68) return "C";
  if (score >= 55) return "D";
  return "F";
}

function getRisk(
  status: GameBalanceStatus,
  score: number
): GameRiskLevel {
  if (status === "blocked") return "extreme";
  if (score >= 88) return "low";
  if (score >= 72) return "moderate";
  return "high";
}

function getStatus(
  uniqueSongCount: number,
  requestedCardCount: number,
  recommendedMaximumCards: number,
  score: number
): GameBalanceStatus {
  if (
    uniqueSongCount < MINIMUM_SONGS_PER_CARD ||
    recommendedMaximumCards < 1
  ) {
    return "blocked";
  }

  if (
    requestedCardCount >
    Math.max(
      recommendedMaximumCards + 10,
      Math.ceil(recommendedMaximumCards * 1.5)
    )
  ) {
    return "blocked";
  }

  if (
    requestedCardCount > recommendedMaximumCards ||
    score < 72
  ) {
    return "warning";
  }

  return "ready";
}

function createSummary(
  status: GameBalanceStatus
): string {
  if (status === "ready") {
    return "This playlist and card count provide a healthy amount of variation for the selected winning pattern.";
  }

  if (status === "warning") {
    return "This game can be created, but the selected setup has an elevated chance of simultaneous winners.";
  }

  return "This game is too unbalanced to create safely with the current playlist, card count, and winning pattern.";
}

export function evaluateGameBalance(
  input: GameBalanceInput
): GameBalanceAnalysis {
  const rows = Math.max(
    1,
    normalizeWholeNumber(input.rows ?? 5, 5)
  );

  const columns = Math.max(
    1,
    normalizeWholeNumber(input.columns ?? 5, 5)
  );

  const songsPerCard = rows * columns;

  const uniqueSongCount =
    normalizeWholeNumber(
      input.uniqueSongCount,
      0
    );

  const requestedCardCount = Math.max(
    1,
    normalizeWholeNumber(
      input.requestedCardCount,
      1
    )
  );

  const clipLength = Math.max(
    5,
    normalizeWholeNumber(
      input.clipLength ?? DEFAULT_CLIP_LENGTH,
      DEFAULT_CLIP_LENGTH
    )
  );

  const profile =
    getProfile(input.bingoPattern);

  const songVariation =
    Math.max(
      0,
      uniqueSongCount -
        songsPerCard +
        1
    );

  const recommendedMaximumCards =
    uniqueSongCount < songsPerCard
      ? 0
      : clamp(
          Math.floor(
            songVariation *
              songVariation *
              profile.capacityMultiplier
          ),
          1,
          MAX_RECOMMENDED_CARDS
        );

  const pressure =
    recommendedMaximumCards > 0
      ? requestedCardCount /
        recommendedMaximumCards
      : Number.POSITIVE_INFINITY;

  const songShortagePenalty =
    uniqueSongCount < songsPerCard
      ? 100
      : uniqueSongCount <
          profile.recommendedSongs
        ? clamp(
            (profile.recommendedSongs -
              uniqueSongCount) *
              1.8,
            0,
            36
          )
        : 0;

  const cardPressurePenalty =
    pressure <= 0.5
      ? 0
      : pressure <= 1
        ? (pressure - 0.5) * 34
        : 17 +
          Math.min(
            48,
            (pressure - 1) * 46
          );

  const exactMinimumPenalty =
    uniqueSongCount === songsPerCard
      ? 24
      : 0;

  const rawScore =
    100 -
    profile.scorePenalty -
    songShortagePenalty -
    cardPressurePenalty -
    exactMinimumPenalty;

  const score = clamp(
    Math.round(rawScore),
    0,
    100
  );

  const status = getStatus(
    uniqueSongCount,
    requestedCardCount,
    recommendedMaximumCards,
    score
  );

  const risk = getRisk(status, score);
  const grade = getGrade(score);

  const recommendedSongCount = Math.max(
    songsPerCard,
    profile.recommendedSongs,
    Math.ceil(
      songsPerCard -
        1 +
        Math.sqrt(
          requestedCardCount /
            profile.capacityMultiplier
        )
    )
  );

  const additionalSongsRecommended =
    Math.max(
      0,
      recommendedSongCount -
        uniqueSongCount
    );

  const minimumCalledSongs = clamp(
    Math.ceil(
      uniqueSongCount *
        profile.calledSongRange[0]
    ),
    profile.minimumMarks,
    Math.max(
      profile.minimumMarks,
      uniqueSongCount
    )
  );

  const maximumCalledSongs = clamp(
    Math.ceil(
      uniqueSongCount *
        profile.calledSongRange[1]
    ),
    minimumCalledSongs,
    Math.max(
      minimumCalledSongs,
      uniqueSongCount
    )
  );

  const secondsPerCall =
    clipLength + 2.5;

  const durationMinimum = Math.max(
    1,
    Math.round(
      (minimumCalledSongs *
        secondsPerCall) /
        60
    )
  );

  const durationMaximum = Math.max(
    durationMinimum,
    Math.round(
      (maximumCalledSongs *
        secondsPerCall) /
        60
    )
  );

  const recommendations: string[] = [];

  if (
    uniqueSongCount <
    songsPerCard
  ) {
    recommendations.push(
      `Add at least ${
        songsPerCard -
        uniqueSongCount
      } more unique song${
        songsPerCard -
          uniqueSongCount ===
        1
          ? ""
          : "s"
      }.`
    );
  } else {
    if (
      requestedCardCount >
      recommendedMaximumCards
    ) {
      recommendations.push(
        `Reduce the card count to approximately ${recommendedMaximumCards.toLocaleString(
          "en-US"
        )} or fewer.`
      );
    }

    if (
      additionalSongsRecommended > 0
    ) {
      recommendations.push(
        `Add approximately ${additionalSongsRecommended.toLocaleString(
          "en-US"
        )} more unique song${
          additionalSongsRecommended === 1
            ? ""
            : "s"
        } for a healthier setup.`
      );
    }

    if (
      uniqueSongCount ===
      songsPerCard
    ) {
      recommendations.push(
        "Using exactly 25 songs gives every card the same song set. Add more songs to create meaningful card variation."
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "This setup is within the recommended balance range."
    );
  }

  const checks = [
    uniqueSongCount >= songsPerCard
      ? `Playlist minimum passed: ${uniqueSongCount} unique songs are available.`
      : `Playlist minimum failed: ${songsPerCard} unique songs are required.`,
    requestedCardCount <=
    recommendedMaximumCards
      ? `Card count is within the recommended maximum of ${recommendedMaximumCards.toLocaleString(
          "en-US"
        )}.`
      : `Requested cards exceed the recommended maximum of ${recommendedMaximumCards.toLocaleString(
          "en-US"
        )}.`,
    `${profile.winningPaths} winning path${
      profile.winningPaths === 1
        ? ""
        : "s"
    } per card will be evaluated for this pattern.`,
  ];

  return {
    status,
    score,
    grade,
    risk,

    uniqueSongCount,
    requestedCardCount,
    songsPerCard,
    winningPattern:
      input.bingoPattern,

    recommendedMaximumCards,
    minimumRequiredSongs:
      songsPerCard,
    recommendedSongCount,
    additionalSongsRecommended,

    winningPathsPerCard:
      profile.winningPaths,
    minimumMarksToWin:
      profile.minimumMarks,

    estimatedCalledSongs: {
      minimum: minimumCalledSongs,
      maximum: maximumCalledSongs,
    },

    estimatedDurationMinutes: {
      minimum: durationMinimum,
      maximum: durationMaximum,
    },

    summary:
      createSummary(status),
    patternGuideline:
      profile.guideline,
    recommendations,
    checks,
  };
}
