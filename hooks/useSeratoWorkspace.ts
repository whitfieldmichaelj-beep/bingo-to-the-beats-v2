"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export type WinningPattern =
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "x-pattern"
  | "blackout";

export type SeratoPlaylist = {
  id: string;
  name: string;
  trackCount: number;
  source?: string;
  path?: string;
};

type SeratoTrack = {
  id: string;
  title: string;
  artist: string;
  bpm?: number | null;
  filePath?: string;
  fileName?: string;
  gameTrackId?: string;
  position?: number;
  called?: boolean;
  calledAt?: string | null;
};

type CreatedGame = {
  id: string;
  joinCode: string;
  playlistId: string;
  playlistName: string;
  playlistTrackCount: number;
  tracks: SeratoTrack[];
};

type PlaylistsResponse = {
  ok?: boolean;
  playlists?: unknown[];
  message?: string;
  library?: {
    totalTracks?: number;
    localTracks?: number;
    externalTracks?: number;
  };
  totalTracks?: number;
};

type CreateGameResponse = {
  ok: boolean;
  game?: CreatedGame;
  message?: string;
  error?: string;
};

type ConsoleTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
};

type GameSession = {
  version: 2;
  sessionId: string;
  source: "serato";
  playlistId: string;
  playlistName: string;
  clipLength: number;
  cardCount: number;
  createdAt: string;
  currentIndex: number;
  status: "ready" | "playing" | "paused" | "complete";
  tracks: ConsoleTrack[];
  playedTrackIds: string[];
  joinCode: string;
  winningPattern: WinningPattern;
  gameName: string;
  venueName: string;
  hostName: string;
};

export type StoredGameDetails = {
  players?: number;
  billing?: string;
  winningPattern?: WinningPattern;
  gameName?: string;
  venueName?: string;
  eventDate?: string;
  eventTime?: string;
  hostName?: string;
  primaryColor?: string;
};

const GAME_SESSION_KEY = "bttb-v2-game-session";
const CREATED_GAME_KEY = "bttb-v2-created-game";
const GAME_DETAILS_KEY = "bttb-game-details";

export const WINNING_PATTERNS: Array<{
  value: WinningPattern;
  label: string;
}> = [
  { value: "any-line", label: "Any 5 in a Row" },
  { value: "across", label: "Across Only" },
  { value: "down", label: "Down Only" },
  { value: "diagonal", label: "Diagonal Only" },
  { value: "x-pattern", label: "X Pattern" },
  { value: "blackout", label: "Blackout" },
];

function readStoredGameDetails(): StoredGameDetails | null {
  try {
    const storedValue = sessionStorage.getItem(GAME_DETAILS_KEY);
    return storedValue
      ? (JSON.parse(storedValue) as StoredGameDetails)
      : null;
  } catch {
    return null;
  }
}

function shuffleTracks<T>(tracks: T[]) {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function getPlaylistName(value: unknown, index: number) {
  if (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string"
  ) {
    return value.name;
  }
  return `Serato Crate ${index + 1}`;
}

function getPlaylistId(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }
  return "";
}

function getPlaylistTrackCount(value: unknown) {
  if (typeof value !== "object" || value === null) return 0;

  const possibleKeys = [
    "trackCount",
    "tracksCount",
    "playlistTrackCount",
    "totalTracks",
    "count",
  ];

  for (const key of possibleKeys) {
    if (
      key in value &&
      typeof value[key as keyof typeof value] === "number"
    ) {
      return value[key as keyof typeof value] as number;
    }
  }

  if ("tracks" in value && Array.isArray(value.tracks)) {
    return value.tracks.length;
  }

  return 0;
}

function normalizePlaylists(values: unknown[]): SeratoPlaylist[] {
  return values
    .map((value, index): SeratoPlaylist => {
      const playlist =
        typeof value === "object" && value !== null ? value : {};

      return {
        id: getPlaylistId(value),
        name: getPlaylistName(value, index),
        trackCount: getPlaylistTrackCount(value),
        source:
          "source" in playlist && typeof playlist.source === "string"
            ? playlist.source
            : undefined,
        path:
          "path" in playlist && typeof playlist.path === "string"
            ? playlist.path
            : undefined,
      };
    })
    .filter((playlist) => playlist.id);
}

function convertGameTracks(tracks: SeratoTrack[]): ConsoleTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    name: track.title || "Unknown Song",
    artist: track.artist || "Unknown Artist",
    album:
      typeof track.bpm === "number" && track.bpm > 0
        ? `${track.bpm.toFixed(1)} BPM`
        : track.fileName || "Serato Library",
    image: null,
  }));
}

export function useSeratoWorkspace() {
  const router = useRouter();

  const [isHydrated, setIsHydrated] = useState(false);
  const [playlists, setPlaylists] = useState<SeratoPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [search, setSearch] = useState("");
  const [clipLength, setClipLength] = useState(30);
  const [cardCount, setCardCount] = useState(25);
  const [shuffle, setShuffle] = useState(true);
  const [winningPattern, setWinningPattern] =
    useState<WinningPattern>("any-line");
  const [gameDetails, setGameDetails] =
    useState<StoredGameDetails | null>(null);
  const [libraryTrackCount, setLibraryTrackCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(
    "Reading your Serato crates..."
  );
  const [error, setError] = useState("");

  const selectedPlaylist = useMemo(
    () =>
      playlists.find(
        (playlist) => playlist.id === selectedPlaylistId
      ) ?? null,
    [playlists, selectedPlaylistId]
  );

  const filteredPlaylists = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return playlists;
    return playlists.filter((playlist) =>
      playlist.name.toLowerCase().includes(normalizedSearch)
    );
  }, [playlists, search]);

  const loadPlaylists = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setMessage("Reading your Serato crates...");

      const response = await fetch("/api/serato/playlists", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as PlaylistsResponse;

      if (!response.ok) {
        throw new Error(
          data.message || "The Serato crates could not be loaded."
        );
      }

      const nextPlaylists = normalizePlaylists(
        Array.isArray(data.playlists) ? data.playlists : []
      );

      setPlaylists(nextPlaylists);

      const totalTracks =
        data.library?.totalTracks ??
        data.totalTracks ??
        nextPlaylists.reduce(
          (total, playlist) => total + playlist.trackCount,
          0
        );

      setLibraryTrackCount(totalTracks);
      setSelectedPlaylistId((currentId) => {
        if (
          currentId &&
          nextPlaylists.some((playlist) => playlist.id === currentId)
        ) {
          return currentId;
        }
        return nextPlaylists[0]?.id ?? "";
      });

      setMessage(
        nextPlaylists.length > 0
          ? `${nextPlaylists.length} Serato crates are ready.`
          : "No Serato crates were found. Confirm that the Serato library is connected."
      );
    } catch (loadError) {
      const loadMessage =
        loadError instanceof Error
          ? loadError.message
          : "The Serato library could not be loaded.";
      setError(loadMessage);
      setMessage(loadMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsHydrated(true);

    const storedDetails = readStoredGameDetails();
    if (storedDetails) {
      setGameDetails(storedDetails);
      if (
        typeof storedDetails.players === "number" &&
        storedDetails.players > 0
      ) {
        setCardCount(storedDetails.players);
      }
      if (storedDetails.winningPattern) {
        setWinningPattern(storedDetails.winningPattern);
      }
    }

    void loadPlaylists();
  }, [loadPlaylists]);

  const refreshPlaylists = useCallback(async () => {
    await loadPlaylists();
  }, [loadPlaylists]);

  const selectPlaylist = useCallback(
    (playlistId: string) => {
      const playlist = playlists.find((item) => item.id === playlistId);
      setSelectedPlaylistId(playlistId);
      setError("");
      if (playlist) setMessage(`${playlist.name} selected.`);
    },
    [playlists]
  );

  const updateCardCount = useCallback((value: number) => {
    setCardCount(Math.max(1, Math.min(500, value || 1)));
  }, []);

  const createGame = useCallback(async () => {
    if (!selectedPlaylist) {
      setError("Choose a Serato crate first.");
      return;
    }

    if (
      selectedPlaylist.trackCount > 0 &&
      selectedPlaylist.trackCount < 25
    ) {
      setError(
        "This crate needs at least 25 songs to create standard 5 × 5 bingo cards."
      );
      return;
    }

    try {
      setCreating(true);
      setError("");
      setMessage(`Creating a game from ${selectedPlaylist.name}...`);

      const response = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: selectedPlaylist.id,
          cardCount,
          winningPattern,
        }),
      });

      const data = (await response.json()) as CreateGameResponse;

      if (!response.ok || !data.ok || !data.game) {
        throw new Error(
          data.error || data.message || "The game could not be created."
        );
      }

      const createdGame = data.game;
      if (
        !Array.isArray(createdGame.tracks) ||
        createdGame.tracks.length < 25
      ) {
        throw new Error(
          "The selected crate did not return enough tracks to create bingo cards."
        );
      }

      const convertedTracks = convertGameTracks(createdGame.tracks);
      const preparedTracks = shuffle
        ? shuffleTracks(convertedTracks)
        : convertedTracks;

      const session: GameSession = {
        version: 2,
        sessionId: createdGame.id,
        source: "serato",
        playlistId: createdGame.playlistId,
        playlistName: createdGame.playlistName,
        clipLength,
        cardCount,
        createdAt: new Date().toISOString(),
        currentIndex: 0,
        status: "ready",
        tracks: preparedTracks,
        playedTrackIds: [],
        joinCode: createdGame.joinCode,
        winningPattern,
        gameName: gameDetails?.gameName || createdGame.playlistName,
        venueName: gameDetails?.venueName || "",
        hostName: gameDetails?.hostName || "",
      };

      localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(CREATED_GAME_KEY, JSON.stringify(createdGame));
      sessionStorage.setItem("bttbWinningPattern", winningPattern);

      setMessage(`Game created. Join code: ${createdGame.joinCode}`);
      router.push("/dj-console");
    } catch (createError) {
      const createMessage =
        createError instanceof Error
          ? createError.message
          : "The game could not be created.";
      setError(createMessage);
      setMessage(createMessage);
    } finally {
      setCreating(false);
    }
  }, [
    cardCount,
    clipLength,
    gameDetails,
    router,
    selectedPlaylist,
    shuffle,
    winningPattern,
  ]);

  const createDisabled =
    !isHydrated || loading || creating || selectedPlaylist === null;

  return {
    hero: {
      loading,
      playlistCount: playlists.length,
      libraryTrackCount,
      hasError: Boolean(error),
    },
    crates: {
      playlists: filteredPlaylists,
      selectedPlaylistId,
      search,
      loading,
      onSearchChange: setSearch,
      onSelectPlaylist: selectPlaylist,
      onRefresh: refreshPlaylists,
    },
    settings: {
      selectedPlaylist,
      gameDetails,
      clipLength,
      cardCount,
      shuffle,
      winningPattern,
      winningPatterns: WINNING_PATTERNS,
      creating,
      createDisabled,
      message,
      error,
      onClipLengthChange: setClipLength,
      onCardCountChange: updateCardCount,
      onShuffleChange: setShuffle,
      onWinningPatternChange: setWinningPattern,
      onCreateGame: createGame,
    },
    status: {
      isHydrated,
      loading,
      creating,
      message,
      error,
    },
    actions: {
      loadPlaylists,
      refreshPlaylists,
      selectPlaylist,
      createGame,
    },
  };
}

export type SeratoWorkspace = ReturnType<typeof useSeratoWorkspace>;

