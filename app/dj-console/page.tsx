"use client";

import Link from "next/link";
import Script from "next/script";
import "./dj-console.css";
// BTTB_ONE_MINUTE_BEAT_ALIGNED_START_V3
// BTTB_BINGO_PLAYED_LOCK_V1
import BingoVerificationPanel from "@/components/game/BingoVerificationPanel";
import { useCalledTrackSync } from "@/hooks/useCalledTrackSync";
// BTTB_BINGO_VERIFICATION_V1
import GameAccessPanel from "../../components/game/GameAccessPanel";
import LivePlayerRoster from "../../components/game/LivePlayerRoster";
import { useGameRoster } from "@/hooks/useGameRoster";
import { BttbStat } from "../../components/ui/bttb";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  usePlaybackEngine,
  type PlaybackTrack,
} from "../../hooks/usePlaybackEngine";

type MusicSource = "serato" | "spotify" | "apple" | "local";

type Track = {
  id: string;
  gameTrackId?: string;
  bpm?: number | null;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  audioUrl?: string | null;
  appleCatalogId?: string;
  appleLibraryId?: string;
  fileName?: string | null;
  filePath?: string | null;
};

type SeratoTrack = {
  id: string;
  artist: string;
  title: string;
  displayText: string;
  playedAtText: string | null;
};

type SeratoResponse = {
  ok: boolean;
  live: boolean;
  sourceUrl?: string;
  fetchedAt?: string;
  track: SeratoTrack | null;
  tracks: SeratoTrack[];
  message: string;
};

type GameSession = {
  version: 2;
  sessionId: string;
  source: MusicSource;
  playlistId: string;
  playlistName: string;
  clipLength: number;
  cardCount: number;
  createdAt: string;
  currentIndex: number;
  status: "ready" | "playing" | "paused" | "complete";
  tracks: Track[];
  playedTrackIds: string[];
  joinCode: string;
};

type CallerState = {
  sessionId: string;
  playlistName: string;
  currentTrack: Track | null;
  currentIndex: number;
  totalTracks: number;
  playedCount: number;
  recentTracks: Track[];
  clipLength: number;
  secondsRemaining: number;
  isPlaying: boolean;
  isRevealed?: boolean;
  status: GameSession["status"];
};

type ActivityItem = {
  id: string;
  track: Track;
  detectedAt: string;
};

type PlaybackCheckpoint = {
  version: 1;
  sessionId: string;
  source: MusicSource;
  trackId: string;
  currentIndex: number;
  secondsRemaining: number;
  playbackTime: number | null;
  wasPlaying: boolean;
  isRevealed: boolean;
  savedAt: string;
};

const GAME_SESSION_KEY = "bttb-v2-game-session";
const CALLER_STATE_KEY = "bttb-v2-caller-state";
const CHANNEL_NAME = "bttb-v2-game-sync";
const SERATO_URL_KEY = "bttb-v2-serato-live-url";
const ACTIVITY_KEY = "bttb-v2-dj-activity";
// BTTB_DJ_REFRESH_PERSISTENCE_V1
const PLAYBACK_CHECKPOINT_KEY =
  "bttb-v2-playback-checkpoint";
const GAME_SESSION_BACKUP_KEY =
  "bttb-v2-active-game-backup";
const DEFAULT_SERATO_URL =
  "https://serato.com/playlists/IAMDJMIKEDOELO/live";
const POLL_INTERVAL_MS = 4000;
const AUTO_NEXT_DELAY_MS = 2500;

// BTTB_APPLE_SMOOTH_TRANSITION_V1
const APPLE_PRIME_NEXT_SECONDS = 8;
const APPLE_FADE_FLOOR = 0.06;

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function clock() {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}


function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.max(0, cents) / 100);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ")
    .replace(
      /\b(clean|dirty|explicit|intro|outro|extended|edit|remix|version|radio|video|redrum|single|album|mix)\b/g,
      " "
    )
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createPlaybackTracks(
  session: GameSession
): PlaybackTrack[] {
  return session.tracks.map((track) => {
    const secureAudioUrl =
      session.source === "serato" ||
      session.source === "local"
        ? `/api/audio/stream?gameId=${encodeURIComponent(
            session.sessionId
          )}&trackId=${encodeURIComponent(
            track.gameTrackId ?? track.id
          )}`
        : null;

    return {
      id: track.id,
      title: track.name,
      artist: track.artist,
      bpm: track.bpm ?? null,
      album: track.album,
      artwork: track.image ?? undefined,
      audioUrl:
        secureAudioUrl ??
        track.audioUrl ??
        null,
      source: session.source,
    };
  });
}

function getRecentPlayedTracks(
  session: GameSession,
  playedTrackIds = session.playedTrackIds
): Track[] {
  const trackById = new Map(
    session.tracks.map((track) => [track.id, track])
  );

  return playedTrackIds
    .map((trackId) => trackById.get(trackId) ?? null)
    .filter((track): track is Track => track !== null)
    .reverse()
    .slice(0, 5);
}

function trackMatches(gameTrack: Track, seratoTrack: SeratoTrack) {
  const gameTitle = normalize(gameTrack.name);
  const gameArtist = normalize(gameTrack.artist);
  const seratoTitle = normalize(seratoTrack.title);
  const seratoArtist = normalize(seratoTrack.artist);
  const seratoWhole = normalize(seratoTrack.displayText);

  const titleMatches =
    gameTitle === seratoTitle ||
    gameTitle.includes(seratoTitle) ||
    seratoTitle.includes(gameTitle) ||
    seratoWhole.includes(gameTitle);

  const artistMatches =
    !gameArtist ||
    gameArtist === seratoArtist ||
    gameArtist.includes(seratoArtist) ||
    seratoArtist.includes(gameArtist) ||
    seratoWhole.includes(gameArtist);

  return titleMatches && artistMatches;
}


// BTTB_APPLE_DJ_CONSOLE_PLAYBACK_V2
function getPlayableAppleIds(
  track: Track
) {
  return Array.from(
    new Set(
      [
        track.appleCatalogId,
        track.id,
        track.appleLibraryId,
      ].filter(
        (
          value
        ): value is string =>
          typeof value === "string" &&
          value.trim().length > 0
      )
    )
  );
}


// BTTB_APPLE_SERATO_TIMING_V1
const APPLE_MUSICAL_START_SECONDS = 60;

function getAppleSeratoStyleStartSeconds(
  track: Track,
  durationSeconds: number | null,
  playtimeSeconds: number
) {
  const bpm =
    typeof track.bpm === "number" &&
    Number.isFinite(track.bpm) &&
    track.bpm >= 40 &&
    track.bpm <= 240
      ? track.bpm
      : null;

  /*
   * Match the Serato rule:
   * - target 1:00
   * - when BPM exists, move forward to the next estimated
   *   four-beat bar in common 4/4.
   *
   * Apple Music normally does not provide BPM in playlist
   * metadata, so unmatched Apple tracks start at exactly 1:00.
   */
  const secondsPerBar =
    bpm
      ? 240 / bpm
      : null;

  let startSeconds =
    secondsPerBar
      ? Math.ceil(
          APPLE_MUSICAL_START_SECONDS /
            secondsPerBar
        ) * secondsPerBar
      : APPLE_MUSICAL_START_SECONDS;

  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return Math.max(
      0,
      startSeconds
    );
  }

  const requiredTail =
    Math.max(
      playtimeSeconds,
      10
    ) + 2;

  if (
    durationSeconds <=
    APPLE_MUSICAL_START_SECONDS +
      requiredTail
  ) {
    return 0;
  }

  startSeconds =
    Math.min(
      startSeconds,
      Math.max(
        0,
        durationSeconds -
          requiredTail
      )
    );

  return Math.max(
    0,
    startSeconds
  );
}

// BTTB_APPLE_COUNTDOWN_AUTO_NEXT_V1
type AppleMusicKitV3Playback = {
  nowPlayingItem?: {
    playbackDuration?: number;
    attributes?: {
      durationInMillis?: number;
    };
  };
  currentPlaybackDuration?: number;
  currentPlaybackTime?: number;
  isPlaying?: boolean;
  volume?: number;
  seekToTime?: (
    seconds: number
  ) =>
    | Promise<void>
    | void;
};

function getAppleMusicKitV3Playback(
  music: MusicKitInstance
) {
  return music as unknown as
    AppleMusicKitV3Playback;
}

function setAppleMusicVolume(
  music: MusicKitInstance,
  volume: number
) {
  const instance =
    getAppleMusicKitV3Playback(
      music
    );

  try {
    Reflect.set(
      instance,
      "volume",
      Math.max(
        0,
        Math.min(
          1,
          volume
        )
      )
    );
  } catch {
    // Volume control must never prevent game timing.
  }
}

async function waitForAppleDurationSeconds(
  music: MusicKitInstance
) {
  const instance =
    getAppleMusicKitV3Playback(
      music
    );

  const startedAt =
    Date.now();

  while (
    Date.now() - startedAt <
    2500
  ) {
    const directDuration =
      instance.currentPlaybackDuration;

    if (
      typeof directDuration ===
        "number" &&
      Number.isFinite(
        directDuration
      ) &&
      directDuration > 0
    ) {
      return directDuration;
    }

    const item =
      instance.nowPlayingItem;

    const playbackDuration =
      item?.playbackDuration;

    if (
      typeof playbackDuration ===
        "number" &&
      Number.isFinite(
        playbackDuration
      ) &&
      playbackDuration > 0
    ) {
      return playbackDuration;
    }

    const durationInMillis =
      item?.attributes
        ?.durationInMillis;

    if (
      typeof durationInMillis ===
        "number" &&
      Number.isFinite(
        durationInMillis
      ) &&
      durationInMillis > 0
    ) {
      return (
        durationInMillis /
        1000
      );
    }

    await new Promise<void>(
      (resolve) => {
        window.setTimeout(
          resolve,
          100
        );
      }
    );
  }

  return null;
}

// BTTB_APPLE_MUSICKIT_SEEK_V1
function readApplePlaybackTime(
  music: MusicKitInstance
) {
  const instance =
    getAppleMusicKitV3Playback(
      music
    );

  const currentPlaybackTime =
    instance.currentPlaybackTime;

  if (
    typeof currentPlaybackTime ===
      "number" &&
    Number.isFinite(
      currentPlaybackTime
    ) &&
    currentPlaybackTime >= 0
  ) {
    return currentPlaybackTime;
  }

  return null;
}

async function waitForApplePlaybackReady(
  music: MusicKitInstance
) {
  const instance =
    getAppleMusicKitV3Playback(
      music
    );

  const startedAt =
    Date.now();

  while (
    Date.now() - startedAt <
    4000
  ) {
    if (
      instance.nowPlayingItem ||
      instance.isPlaying
    ) {
      return;
    }

    await new Promise<void>(
      (resolve) => {
        window.setTimeout(
          resolve,
          100
        );
      }
    );
  }

  /*
   * Do not throw here. MusicKit can already be audibly playing
   * before metadata settles. Game timing must still start.
   */
}

async function seekApplePlayer(
  music: MusicKitInstance,
  seconds: number
) {
  const safeSeconds =
    Math.max(
      0,
      Number.isFinite(
        seconds
      )
        ? seconds
        : 0
    );

  const instance =
    getAppleMusicKitV3Playback(
      music
    );

  if (
    typeof instance.seekToTime !==
      "function"
  ) {
    console.warn(
      "MusicKit v3 seekToTime() is unavailable; continuing without a seek."
    );
    return;
  }

  let lastError:
    unknown = null;

  for (
    let attempt = 0;
    attempt < 2;
    attempt += 1
  ) {
    try {
      await instance.seekToTime(
        safeSeconds
      );

      await new Promise<void>(
        (resolve) => {
          window.setTimeout(
            resolve,
            180
          );
        }
      );

      const actual =
        readApplePlaybackTime(
          music
        );

      if (
        actual === null ||
        Math.abs(
          actual -
            safeSeconds
        ) <= 5
      ) {
        return;
      }
    } catch (error) {
      lastError =
        error;
    }

    await new Promise<void>(
      (resolve) => {
        window.setTimeout(
          resolve,
          120
        );
      }
    );
  }

  console.warn(
    "Apple Music seek did not settle; continuing playback so the game timer can run.",
    lastError
  );
}

export default function DjConsolePage() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [callerState, setCallerState] = useState<CallerState | null>(null);
  const [seratoUrl, setSeratoUrl] = useState(DEFAULT_SERATO_URL);
  const [isConnected, setIsConnected] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [autoReveal, setAutoReveal] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("Not connected");
  const [message, setMessage] = useState(
    "Press Connect Serato, then start Live Playlist in Serato DJ Pro."
  );
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [detectedTrack, setDetectedTrack] = useState<Track | null>(null);
  const appleMusicRef =
    useRef<MusicKitInstance | null>(
      null
    );
  // BTTB_APPLE_DUPLICATE_PLAY_V1
  const appleTransportQueueRef =
    useRef<Promise<void>>(
      Promise.resolve()
    );
  const restoredApplePlaybackTimeRef =
    useRef<number | null>(
      null
    );
  const appleNeedsRequeueRef =
    useRef(false);

    const applePrimedNextIndexRef =
    useRef<number | null>(null);
  const appleFadeFrameRef =
    useRef<number | null>(null);
  const appleFadeGenerationRef =
    useRef(0);
  const appleFadeTrackIdRef =
    useRef<string | null>(null);
const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedBaseSecondsRef = useRef(0);
  const elapsedStartedAtRef = useRef<number | null>(null);
  const elapsedSessionIdRef = useRef<string | null>(null);

  const { roster } = useGameRoster(
    session?.status === "complete"
      ? null
      : session?.sessionId,
    70,
    10000
  );
  const playback = usePlaybackEngine(
    [],
    session?.clipLength ?? 30,
    {
      continuous:
        autoNext &&
        session?.source !== "apple",
    }
  );
  const autoStartNextRef = useRef(false);
  const gameEndedRef = useRef(false);

  const previousTrackId = useRef<string | null>(null);
  const pollInProgress = useRef(false);

  const gameTrack =
    session?.tracks[playback.currentIndex] ??
    callerState?.currentTrack ??
    null;

  const currentTrack = detectedTrack ?? gameTrack;

  const secondsRemaining = playback.secondsRemaining;

  const isPlaying =
    playback.status === "playing" ||
    playback.status === "countdown";

  const isRevealed =
    playback.revealed ||
    playback.status === "revealed";

  useEffect(() => {
    const nextSessionId = session?.sessionId ?? null;

    if (elapsedSessionIdRef.current !== nextSessionId) {
      elapsedSessionIdRef.current = nextSessionId;
      elapsedBaseSecondsRef.current = 0;
      elapsedStartedAtRef.current = null;
      setElapsedSeconds(0);
    }
  }, [session?.sessionId]);

  useEffect(() => {
    if (!session) {
      elapsedBaseSecondsRef.current = 0;
      elapsedStartedAtRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    const commitElapsedSegment = () => {
      const startedAt = elapsedStartedAtRef.current;

      if (startedAt === null) {
        setElapsedSeconds(elapsedBaseSecondsRef.current);
        return;
      }

      const segmentSeconds = Math.max(
        0,
        Math.floor((Date.now() - startedAt) / 1000)
      );

      elapsedBaseSecondsRef.current += segmentSeconds;
      elapsedStartedAtRef.current = null;
      setElapsedSeconds(elapsedBaseSecondsRef.current);
    };

    if (!isPlaying) {
      commitElapsedSegment();
      return;
    }

    if (elapsedStartedAtRef.current === null) {
      elapsedStartedAtRef.current = Date.now();
    }

    const updateElapsed = () => {
      const startedAt = elapsedStartedAtRef.current;
      const activeSegmentSeconds =
        startedAt === null
          ? 0
          : Math.max(
              0,
              Math.floor((Date.now() - startedAt) / 1000)
            );

      setElapsedSeconds(
        elapsedBaseSecondsRef.current + activeSegmentSeconds
      );
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(timer);
      commitElapsedSegment();
    };
  }, [isPlaying, session?.sessionId]);

  useEffect(() => {
    return () => {
      const music =
        appleMusicRef.current;

      if (music) {
        void music.stop();
      }
    };
  }, []);

  const liveStatus = session?.status === "playing";
  const statusLabel = !session
    ? "NO GAME"
    : liveStatus
      ? "LIVE"
      : session.status.toUpperCase();

  useCalledTrackSync(
    session?.sessionId,
    session?.tracks ?? [],
    playback.currentIndex,
    isPlaying || isRevealed
  );

  const upcomingTracks = useMemo(() => {
    if (!session) return [];
    return session.tracks.slice(
      session.currentIndex + 1,
      session.currentIndex + 6
    );
  }, [session]);

  useEffect(() => {
    const savedSession =
      readJson<GameSession>(
        GAME_SESSION_KEY
      ) ??
      readJson<GameSession>(
        GAME_SESSION_BACKUP_KEY
      );

    const savedCaller =
      readJson<CallerState>(
        CALLER_STATE_KEY
      );

    const savedCheckpoint =
      readJson<PlaybackCheckpoint>(
        PLAYBACK_CHECKPOINT_KEY
      );

    const savedActivity =
      readJson<ActivityItem[]>(
        ACTIVITY_KEY
      );

    const savedUrl =
      localStorage.getItem(
        SERATO_URL_KEY
      ) ??
      DEFAULT_SERATO_URL;

    if (savedSession) {
      const checkpointMatches =
        savedCheckpoint?.sessionId ===
          savedSession.sessionId &&
        savedCheckpoint.currentIndex >=
          0 &&
        savedCheckpoint.currentIndex <
          savedSession.tracks.length &&
        savedSession.tracks[
          savedCheckpoint.currentIndex
        ]?.id ===
          savedCheckpoint.trackId;

      const callerMatches =
        savedCaller?.sessionId ===
        savedSession.sessionId;

      const resumeIndex =
        checkpointMatches
          ? savedCheckpoint.currentIndex
          : callerMatches
            ? Math.max(
                savedSession.currentIndex,
                savedCaller.currentIndex
              )
            : savedSession.currentIndex;

      const restoredSeconds =
        checkpointMatches
          ? savedCheckpoint.secondsRemaining
          : callerMatches
            ? savedCaller.secondsRemaining
            : savedSession.clipLength;

      const restoredRevealed =
        checkpointMatches
          ? savedCheckpoint.isRevealed
          : callerMatches
            ? Boolean(
                savedCaller.isRevealed
              )
            : false;

      const restoredSession = {
        ...savedSession,
        currentIndex:
          resumeIndex,
        status:
          savedSession.status ===
            "complete"
            ? "complete" as const
            : "paused" as const,
      };

      gameEndedRef.current =
        restoredSession.status === "complete";

      setSession(
        restoredSession
      );

      const serializedSession =
        JSON.stringify(
          restoredSession
        );

      localStorage.setItem(
        GAME_SESSION_KEY,
        serializedSession
      );

      localStorage.setItem(
        GAME_SESSION_BACKUP_KEY,
        serializedSession
      );

      playback.loadTracks(
        createPlaybackTracks(
          restoredSession
        ),
        restoredSession.currentIndex
      );

      void playback.restoreCheckpoint({
        secondsRemaining:
          restoredSeconds,
        playbackTime:
          checkpointMatches &&
          savedSession.source !==
            "apple"
            ? savedCheckpoint.playbackTime
            : null,
        revealed:
          restoredRevealed,
      });

      if (
        savedSession.source ===
        "apple"
      ) {
        appleNeedsRequeueRef.current =
          true;

        restoredApplePlaybackTimeRef.current =
          checkpointMatches
            ? savedCheckpoint.playbackTime
            : null;
      }

      if (
        callerMatches
      ) {
        const restoredCaller: CallerState = {
          ...savedCaller,
          currentTrack:
            restoredSession.tracks[
              resumeIndex
            ] ??
            savedCaller.currentTrack,
          currentIndex:
            resumeIndex,
          secondsRemaining:
            restoredSeconds,
          isPlaying: false,
          isRevealed:
            restoredRevealed,
          status:
            restoredSession.status,
        };

        setCallerState(
          restoredCaller
        );

        localStorage.setItem(
          CALLER_STATE_KEY,
          JSON.stringify(
            restoredCaller
          )
        );
      } else if (savedCaller) {
        setCallerState(
          savedCaller
        );
      }
    } else if (savedCaller) {
      setCallerState(
        savedCaller
      );
    }

    if (savedActivity) {
      setActivity(
        savedActivity
      );
    }

    setSeratoUrl(
      savedUrl
    );

    const handleStorage = (
      event: StorageEvent
    ) => {
      if (
        event.key ===
          GAME_SESSION_KEY &&
        event.newValue
      ) {
        const nextSession =
          JSON.parse(
            event.newValue
          ) as GameSession;

        setSession(
          nextSession
        );

        localStorage.setItem(
          GAME_SESSION_BACKUP_KEY,
          event.newValue
        );

        playback.loadTracks(
          createPlaybackTracks(
            nextSession
          ),
          nextSession.currentIndex
        );
      }

      if (
        event.key ===
          CALLER_STATE_KEY &&
        event.newValue
      ) {
        setCallerState(
          JSON.parse(
            event.newValue
          ) as CallerState
        );
      }
    };

    window.addEventListener(
      "storage",
      handleStorage
    );

    let channel:
      BroadcastChannel | null =
      null;

    try {
      channel =
        new BroadcastChannel(
          CHANNEL_NAME
        );

      channel.onmessage = (
        event:
          MessageEvent<CallerState>
      ) => {
        setCallerState(
          event.data
        );
      };
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );

      channel?.close();
    };
  }, [
    playback.loadTracks,
    playback.restoreCheckpoint,
  ]);

  useEffect(() => {
    if (
      !session ||
      playback.tracks.length === 0 ||
      session.currentIndex ===
        playback.currentIndex
    ) {
      return;
    }

    const nextSession = {
      ...session,
      currentIndex:
        playback.currentIndex,
    };

    setSession(nextSession);

    localStorage.setItem(
      GAME_SESSION_KEY,
      JSON.stringify(nextSession)
    );

    localStorage.setItem(
      GAME_SESSION_BACKUP_KEY,
      JSON.stringify(nextSession)
    );
  }, [
    session,
    playback.currentIndex,
    playback.tracks.length,
  ]);

  useEffect(() => {
    if (
      !session ||
      playback.tracks.length ===
        0
    ) {
      return;
    }

    const persistCheckpoint =
      () => {
        const track =
          session.tracks[
            playback.currentIndex
          ];

        if (!track) {
          return;
        }

        let providerPlaybackTime:
          number | null = null;

        if (
          session.source ===
          "apple"
        ) {
          const value =
            appleMusicRef.current
              ?.player
              ?.currentPlaybackTime;

          if (
            typeof value ===
              "number" &&
            Number.isFinite(value) &&
            value >= 0
          ) {
            providerPlaybackTime =
              value;
          }
        } else {
          const value =
            playback.audioRef.current
              ?.currentTime;

          if (
            typeof value ===
              "number" &&
            Number.isFinite(value) &&
            value >= 0
          ) {
            providerPlaybackTime =
              value;
          }
        }

        const checkpoint:
          PlaybackCheckpoint = {
            version: 1,
            sessionId:
              session.sessionId,
            source:
              session.source,
            trackId:
              track.id,
            currentIndex:
              playback.currentIndex,
            secondsRemaining:
              playback.secondsRemaining,
            playbackTime:
              providerPlaybackTime,
            wasPlaying:
              isPlaying,
            isRevealed:
              isRevealed,
            savedAt:
              new Date()
                .toISOString(),
          };

        try {
          localStorage.setItem(
            PLAYBACK_CHECKPOINT_KEY,
            JSON.stringify(
              checkpoint
            )
          );

          localStorage.setItem(
            GAME_SESSION_BACKUP_KEY,
            JSON.stringify({
              ...session,
              currentIndex:
                playback.currentIndex,
            })
          );
        } catch {
          // Playback continues even if browser storage is unavailable.
        }
      };

    persistCheckpoint();

    const interval =
      window.setInterval(
        persistCheckpoint,
        500
      );

    const handlePageHide =
      () => {
        persistCheckpoint();
      };

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "hidden"
        ) {
          persistCheckpoint();
        }
      };

    window.addEventListener(
      "pagehide",
      handlePageHide
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      window.clearInterval(
        interval
      );

      persistCheckpoint();

      window.removeEventListener(
        "pagehide",
        handlePageHide
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [
    session,
    playback.audioRef,
    playback.currentIndex,
    playback.secondsRemaining,
    playback.tracks.length,
    isPlaying,
    isRevealed,
  ]);

  function broadcast(nextState: CallerState) {
    setCallerState(nextState);
    localStorage.setItem(CALLER_STATE_KEY, JSON.stringify(nextState));

    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(nextState);
      channel.close();
    } catch {
      // localStorage remains the fallback.
    }
  }

  function saveSession(nextSession: GameSession) {
    setSession(nextSession);

    const serialized =
      JSON.stringify(
        nextSession
      );

    localStorage.setItem(
      GAME_SESSION_KEY,
      serialized
    );

    localStorage.setItem(
      GAME_SESSION_BACKUP_KEY,
      serialized
    );
  }

  function addActivity(track: Track) {
    setActivity((items) => {
      if (items[0]?.track.id === track.id) {
        return items;
      }

      const next = [
        {
          id: `${track.id}-${Date.now()}`,
          track,
          detectedAt: new Date().toISOString(),
        },
        ...items,
      ].slice(0, 20);

      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function applySeratoTrack(seratoTrack: SeratoTrack) {
    const liveTrack: Track = {
      id: `serato-${seratoTrack.id}`,
      name: seratoTrack.title,
      artist: seratoTrack.artist,
      album: seratoTrack.playedAtText
        ? `Detected ${seratoTrack.playedAtText}`
        : "Detected from Serato Live Playlist",
      image: null,
    };

    setDetectedTrack(liveTrack);
    addActivity(liveTrack);

    if (!autoDetect) {
      setMessage(
        `${seratoTrack.displayText} detected. Auto Detect is turned off.`
      );
      return;
    }

    if (!session) {
      setMessage(
        `${seratoTrack.displayText} detected. Create a game to start its countdown.`
      );
      return;
    }

    if (
      gameEndedRef.current ||
      session.status === "complete"
    ) {
      setMessage(
        `${seratoTrack.displayText} detected. Game is complete, so the Bingo session was not changed.`
      );
      return;
    }

    const matchedIndex = session.tracks.findIndex((track) =>
      trackMatches(track, seratoTrack)
    );

    if (matchedIndex === -1) {
      setMessage(
        `${seratoTrack.displayText} detected, but it is not in the current Bingo playlist.`
      );
      return;
    }

    const matchedTrack = session.tracks[matchedIndex];

    if (
      previousTrackId.current === seratoTrack.id &&
      session.currentIndex === matchedIndex
    ) {
      return;
    }

    previousTrackId.current = seratoTrack.id;

    const previousGameTrack = session.tracks[session.currentIndex];
    const playedTrackIds =
      previousGameTrack && previousGameTrack.id !== matchedTrack.id
        ? Array.from(
            new Set([...session.playedTrackIds, previousGameTrack.id])
          )
        : session.playedTrackIds;

    const nextSession: GameSession = {
      ...session,
      source: "serato",
      currentIndex: matchedIndex,
      status: "playing",
      playedTrackIds,
    };

    saveSession(nextSession);
    setDetectedTrack(matchedTrack);
    addActivity(matchedTrack);

    broadcast({
      sessionId: nextSession.sessionId,
      playlistName: nextSession.playlistName,
      currentTrack: matchedTrack,
      currentIndex: matchedIndex,
      totalTracks: nextSession.tracks.length,
      playedCount: playedTrackIds.length,
      recentTracks: getRecentPlayedTracks(
        nextSession,
        playedTrackIds
      ),
      clipLength: nextSession.clipLength,
      secondsRemaining: nextSession.clipLength,
      isPlaying: true,
      isRevealed: false,
      status: "playing",
    });

    setMessage(
      `${matchedTrack.artist} — ${matchedTrack.name} matched. Countdown started automatically.`
    );
  }

  async function checkSerato() {
    if (pollInProgress.current) {
      return;
    }

    pollInProgress.current = true;
    setIsPolling(true);

    try {
      const response = await fetch(
        `/api/serato/live?url=${encodeURIComponent(seratoUrl.trim())}`,
        { cache: "no-store" }
      );

      const data = (await response.json()) as SeratoResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Serato connection failed.");
      }

      setLastUpdate(clock());

      if (!data.live || !data.track) {
        setMessage(data.message);
        return;
      }

      applySeratoTrack(data.track);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Serato connection error: ${error.message}`
          : "Serato connection error."
      );
    } finally {
      pollInProgress.current = false;
      setIsPolling(false);
    }
  }

  async function connectSerato() {
    const url = seratoUrl.trim();

    if (!url || !url.includes("serato.com/playlists/")) {
      setMessage("Enter a valid Serato Live Playlist URL.");
      return;
    }

    localStorage.setItem(SERATO_URL_KEY, url);
    setIsConnected(true);
    setMessage("Connecting to Serato Live Playlist...");
    await checkSerato();
  }

  function disconnectSerato() {
    setIsConnected(false);
    setIsPolling(false);
    setLastUpdate("Disconnected");
    setMessage("Serato Live Sync disconnected.");
  }

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const interval = window.setInterval(() => {
      void checkSerato();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
    // checkSerato intentionally uses the latest session and automation settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, seratoUrl, session, autoDetect]);

  useEffect(() => {
    if (!session || !playback.currentTrack) {
      return;
    }

    const nextStatus: GameSession["status"] =
      gameEndedRef.current || playback.status === "finished"
        ? "complete"
        : playback.status === "playing" ||
            playback.status === "countdown"
          ? "playing"
          : playback.status === "paused"
            ? "paused"
            : "ready";

    if (
      session.currentIndex !== playback.currentIndex ||
      session.status !== nextStatus
    ) {
      const nextSession = {
        ...session,
        currentIndex: playback.currentIndex,
        status: nextStatus,
      };

      setSession(nextSession);
      localStorage.setItem(
        GAME_SESSION_KEY,
        JSON.stringify(nextSession)
      );
    }

    broadcast({
      sessionId: session.sessionId,
      playlistName: session.playlistName,
      currentTrack:
        session.tracks[playback.currentIndex] ?? null,
      currentIndex: playback.currentIndex,
      totalTracks: session.tracks.length,
      playedCount: session.playedTrackIds.length,
      recentTracks: getRecentPlayedTracks(session),
      clipLength: session.clipLength,
      secondsRemaining: playback.secondsRemaining,
      isPlaying,
      isRevealed,
      status: nextStatus,
    });
    // broadcast intentionally writes the latest playback state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session?.sessionId,
    session?.playlistName,
    session?.tracks,
    session?.playedTrackIds.length,
    playback.currentTrack,
    playback.currentIndex,
    playback.status,
    playback.secondsRemaining,
    isPlaying,
    isRevealed,
  ]);

  useEffect(() => {
    if (
      !session ||
      session.source !== "apple" ||
      !autoNext ||
      (
        playback.status !==
          "playing" &&
        playback.status !==
          "countdown"
      )
    ) {
      return;
    }

    const nextIndex =
      playback.currentIndex + 1;

    if (
      nextIndex >=
      session.tracks.length
    ) {
      return;
    }

    const fadeSeconds =
      Math.max(
        1,
        playback.crossfadeSeconds
      );

    const primeAtSeconds =
      Math.max(
        APPLE_PRIME_NEXT_SECONDS,
        fadeSeconds + 2
      );

    if (
      playback.secondsRemaining <=
        primeAtSeconds &&
      applePrimedNextIndexRef.current !==
        nextIndex
    ) {
      void primeAppleNextTrack(
        nextIndex
      ).catch(
        (error) => {
          console.warn(
            "Apple Music next-track pre-queue failed; fallback will be used.",
            error
          );
        }
      );
    }

    /*
     * BTTB_APPLE_PLAYTIME_PLUS_FADE_V1B
     *
     * Pre-queue only while play time is running.
     * Do not reduce the outgoing song volume before the
     * play-time countdown reaches zero.
     */
  }, [
    autoNext,
    playback.crossfadeSeconds,
    playback.currentIndex,
    playback.secondsRemaining,
    playback.status,
    session,
  ]);

  useEffect(() => {
    if (
      !autoNext ||
      playback.status !== "revealed" ||
      !session
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const currentTrackId =
        session.tracks[playback.currentIndex]?.id;

      const playedTrackIds = currentTrackId
        ? Array.from(
            new Set([
              ...session.playedTrackIds,
              currentTrackId,
            ])
          )
        : session.playedTrackIds;

      const nextSession: GameSession = {
        ...session,
        playedTrackIds,
      };

      saveSession(nextSession);

      if (
        playback.currentIndex >=
        session.tracks.length - 1
      ) {
        gameEndedRef.current = true;
        playback.next();
        setMessage(
          "The final song was revealed. Game complete."
        );
        return;
      }

      autoStartNextRef.current = true;
      playback.next();
    }, session.source === "apple"
      ? Math.max(
          1,
          playback.crossfadeSeconds
        ) *
          1000
      : AUTO_NEXT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    autoNext,
    playback.status,
    playback.currentIndex,
    playback.crossfadeSeconds,
    playback.next,
    session,
  ]);

  useEffect(() => {
    if (
      !autoStartNextRef.current ||
      playback.status !== "ready"
    ) {
      return;
    }

    autoStartNextRef.current = false;

    void (async () => {
      if (
        session?.source === "apple"
      ) {
        try {
          await startAppleTrack(
            playback.currentIndex
          );
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Apple Music could not start the next song."
          );
          return;
        }
      }

      await playback.start();
    })();
  }, [
    playback.status,
    playback.currentIndex,
    playback.start,
    session?.source,
  ]);

  useEffect(() => {
    if (playback.playbackError) {
      setMessage(playback.playbackError);
    }
  }, [playback.playbackError]);

  useEffect(() => {
    if (
      session?.source !== "apple" ||
      playback.status !== "revealed"
    ) {
      return;
    }

    const hasNextTrack =
      playback.currentIndex <
      session.tracks.length - 1;

    if (
      autoNext &&
      hasNextTrack
    ) {
      const music =
        appleMusicRef.current;

      const currentTrack =
        session.tracks[
          playback.currentIndex
        ];

      if (
        !music ||
        !currentTrack
      ) {
        return;
      }

      /*
       * PLAY TIME IS COMPLETE.
       *
       * The fade starts only after the normal clip timer
       * has reached zero.
       *
       * Example:
       *   30 sec play + 5 sec fade = 35 sec total.
       */
      appleFadeTrackIdRef.current =
        currentTrack.id;

      void fadeAppleTransitionVolume(
        music,
        1,
        APPLE_FADE_FLOOR,
        Math.max(
          1,
          playback.crossfadeSeconds
        ) *
          1000
      );

      return;
    }

    void pauseAppleMusic().catch(
      (error) => {
        console.error(
          "Apple Music clip-end pause failed:",
          error
        );
      }
    );
  }, [
    autoNext,
    playback.crossfadeSeconds,
    playback.currentIndex,
    playback.status,
    session,
  ]);

function runAppleTransportAction(
    action: () => Promise<void>
  ) {
    const next =
      appleTransportQueueRef.current
        .catch(() => {
          // A previous Apple action must never block the next one.
        })
        .then(action);

    appleTransportQueueRef.current =
      next;

    return next;
  }

  // BTTB_APPLE_SAFE_PLAY_RECURSION_FIX_V1
  type AppleTransitionRuntime = {
    volume?: number;
    playNext?: (
      options: {
        songs?: string[];
        librarySongs?: string[];
      },
      clear?: boolean
    ) => Promise<unknown>;
    skipToNextItem?: () => Promise<void>;
  };

  function getAppleTransitionRuntime(
    music: MusicKitInstance
  ) {
    return music as unknown as AppleTransitionRuntime;
  }

  function cancelAppleVolumeFade() {
    appleFadeGenerationRef.current += 1;

    if (appleFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(
        appleFadeFrameRef.current
      );
      appleFadeFrameRef.current = null;
    }
  }

  function setAppleTransitionVolume(
    music: MusicKitInstance,
    value: number
  ) {
    const runtime =
      getAppleTransitionRuntime(
        music
      );

    const safeValue =
      Math.max(
        0,
        Math.min(
          1,
          value
        )
      );

    try {
      Reflect.set(
        runtime,
        "volume",
        safeValue
      );
    } catch {
      // A volume fade must never stop the transport.
    }
  }

  function fadeAppleTransitionVolume(
    music: MusicKitInstance,
    from: number,
    to: number,
    durationMs: number
  ) {
    cancelAppleVolumeFade();

    const generation =
      appleFadeGenerationRef.current;

    const safeDuration =
      Math.max(
        1,
        durationMs
      );

    const startedAt =
      performance.now();

    setAppleTransitionVolume(
      music,
      from
    );

    return new Promise<void>(
      (resolve) => {
        const step = (
          now: number
        ) => {
          if (
            appleFadeGenerationRef.current !==
            generation
          ) {
            resolve();
            return;
          }

          const progress =
            Math.max(
              0,
              Math.min(
                1,
                (
                  now -
                  startedAt
                ) /
                  safeDuration
              )
            );

          setAppleTransitionVolume(
            music,
            from +
              (
                to -
                from
              ) *
                progress
          );

          if (
            progress >= 1
          ) {
            appleFadeFrameRef.current =
              null;
            resolve();
            return;
          }

          appleFadeFrameRef.current =
            window.requestAnimationFrame(
              step
            );
        };

        appleFadeFrameRef.current =
          window.requestAnimationFrame(
            step
          );
      }
    );
  }

  async function safeApplePlay(
    music: MusicKitInstance
  ) {
    /*
     * MusicKit v3 can reject play() when its internal player is
     * already considered playing. Normalize transport first,
     * then call the real MusicKit play() exactly once.
     *
     * pause() preserves the current playhead, unlike stop().
     */
    try {
      await music.pause();
    } catch {
      // Already paused/stopped is an acceptable starting state.
    }

    await new Promise<void>(
      (resolve) => {
        window.setTimeout(
          resolve,
          40
        );
      }
    );

    await music.play();
  }

  async function getAuthorizedAppleMusic() {
    if (
      !session ||
      session.source !== "apple"
    ) {
      throw new Error(
        "The active game is not an Apple Music game."
      );
    }

    const musicKit =
      window.MusicKit;

    if (!musicKit) {
      throw new Error(
        "Apple Music is still loading. Wait a moment and press Play again."
      );
    }

    let music =
      appleMusicRef.current;

    if (!music) {
      const tokenResponse =
        await fetch(
          "/api/apple-music/token",
          {
            cache: "no-store",
          }
        );

      const tokenData =
        (await tokenResponse.json()) as {
          developerToken?: string;
          error?: string;
        };

      if (
        !tokenResponse.ok ||
        !tokenData.developerToken
      ) {
        throw new Error(
          tokenData.error ||
            "Apple Music could not prepare playback."
        );
      }

      await musicKit.configure({
        developerToken:
          tokenData.developerToken,
        app: {
          name:
            "Bingo to the Beats",
          build: "2.0.0",
        },
      });

      music =
        musicKit.getInstance();

      if (!music) {
        throw new Error(
          "Apple Music did not create a playback player."
        );
      }

      appleMusicRef.current =
        music;
    }

    if (
      !music.isAuthorized &&
      !music.musicUserToken
    ) {
      setMessage(
        "Complete Apple Music authorization..."
      );

      const userToken =
        await music.authorize();

      if (!userToken) {
        throw new Error(
          "Apple Music authorization was not completed."
        );
      }
    }

    return music;
  }

  async function queueAppleTrack(
    music: MusicKitInstance,
    track: Track
  ) {
    const candidates =
      getPlayableAppleIds(track);

    if (
      candidates.length === 0
    ) {
      throw new Error(
        `No playable Apple Music ID was saved for "${track.name}".`
      );
    }

    let lastError:
      | unknown
      | null = null;

    for (
      const songId of candidates
    ) {
      /*
       * The current host page can save either a catalog song ID
       * or a library song ID into Track.id. Try both MusicKit
       * queue shapes before treating the track as unplayable.
       */
      try {
        await music.setQueue({
          songs: [songId],
          startPosition: 0,
        });

        return;
      } catch (error) {
        lastError = error;
      }

      try {
        await music.setQueue({
          librarySongs: [songId],
          startPosition: 0,
        });

        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(
          `Apple Music could not queue "${track.name}".`
        );
  }

  async function primeAppleNextTrack(
    index: number
  ) {
    if (
      !session ||
      session.source !== "apple" ||
      index < 0 ||
      index >= session.tracks.length
    ) {
      return false;
    }

    if (
      applePrimedNextIndexRef.current ===
      index
    ) {
      return true;
    }

    const track =
      session.tracks[index];

    if (!track) {
      return false;
    }

    const music =
      await getAuthorizedAppleMusic();

    const runtime =
      getAppleTransitionRuntime(
        music
      );

    if (
      typeof runtime.playNext !==
      "function"
    ) {
      return false;
    }

    const candidates =
      getPlayableAppleIds(
        track
      );

    let lastError:
      unknown = null;

    for (
      const songId of candidates
    ) {
      try {
        await runtime.playNext(
          {
            songs: [songId],
          },
          true
        );

        applePrimedNextIndexRef.current =
          index;

        return true;
      } catch (error) {
        lastError =
          error;
      }

      try {
        await runtime.playNext(
          {
            librarySongs: [songId],
          },
          true
        );

        applePrimedNextIndexRef.current =
          index;

        return true;
      } catch (error) {
        lastError =
          error;
      }
    }

    console.warn(
      `Apple Music could not pre-queue "${track.name}". The normal queue fallback will be used.`,
      lastError
    );

    return false;
  }


  async function startAppleTrackUnlocked(
    index: number,
    resumeAtSeconds:
      number | null = null
  ) {
    if (
      !session ||
      session.source !== "apple"
    ) {
      return;
    }

    const track =
      session.tracks[index];

    if (!track) {
      throw new Error(
        "The selected Apple Music song is unavailable."
      );
    }

    const music =
      await getAuthorizedAppleMusic();

    const runtime =
      getAppleTransitionRuntime(
        music
      );

    const usePrimedNext =
      applePrimedNextIndexRef.current ===
        index &&
      typeof runtime.skipToNextItem ===
        "function";

    cancelAppleVolumeFade();

    setAppleTransitionVolume(
      music,
      0
    );

    if (usePrimedNext) {
      try {
        await runtime.skipToNextItem!();
        applePrimedNextIndexRef.current =
          null;
      } catch (error) {
        console.warn(
          "Apple Music primed transition failed; using the normal queue fallback.",
          error
        );

        applePrimedNextIndexRef.current =
          null;

        await queueAppleTrack(
          music,
          track
        );
      }
    } else {
      applePrimedNextIndexRef.current =
        null;

      await queueAppleTrack(
        music,
        track
      );
    }

    const durationSeconds =
      await waitForAppleDurationSeconds(
        music
      );

    const calculatedStartSeconds =
      getAppleSeratoStyleStartSeconds(
        track,
        durationSeconds,
        session.clipLength
      );

    const restoredStartSeconds =
      typeof resumeAtSeconds ===
        "number" &&
      Number.isFinite(
        resumeAtSeconds
      ) &&
      resumeAtSeconds >= 0
        ? resumeAtSeconds
        : null;

    const startSeconds =
      restoredStartSeconds ===
        null
        ? calculatedStartSeconds
        : typeof durationSeconds ===
              "number" &&
            Number.isFinite(
              durationSeconds
            ) &&
            durationSeconds > 0
          ? Math.min(
              restoredStartSeconds,
              Math.max(
                0,
                durationSeconds -
                  0.25
              )
            )
          : restoredStartSeconds;

    if (!usePrimedNext) {
      await safeApplePlay(
        music
      );
    }

    await waitForApplePlaybackReady(
      music
    );

    await seekApplePlayer(
      music,
      startSeconds
    );

    /*
     * BTTB_APPLE_FADE_OUT_ONLY_V2
     *
     * Apple transitions are fade-OUT only.
     * The outgoing song fades down before the transition.
     * Once the incoming song is queued, started, and seeked,
     * it begins immediately at full volume.
     */
    cancelAppleVolumeFade();

    setAppleTransitionVolume(
      music,
      1
    );

    appleFadeTrackIdRef.current =
      null;

    const startLabel =
      startSeconds >= 60
        ? `${Math.floor(
            startSeconds / 60
          )}:${String(
            Math.floor(
              startSeconds % 60
            )
          ).padStart(
            2,
            "0"
          )}`
        : `${Math.round(
            startSeconds
          )}s`;

    setMessage(
      `Playing Apple Music from ${startLabel}: ${track.artist} - ${track.name}`
    );
  }

  async function startAppleTrack(
    index: number,
    resumeAtSeconds:
      number | null = null
  ) {
    await runAppleTransportAction(
      async () => {
        await startAppleTrackUnlocked(
          index,
          resumeAtSeconds
        );
      }
    );
  }


  async function pauseAppleMusic() {
    cancelAppleVolumeFade();
    appleFadeTrackIdRef.current = null;
    await runAppleTransportAction(
      async () => {
        const music =
          appleMusicRef.current;

        if (!music) {
          return;
        }

        try {
          await music.pause();
        } catch {
          // Already paused/stopped is an acceptable final state.
        }
      }
    );
  }

  async function stopAppleMusic() {
    await runAppleTransportAction(
      async () => {
        const music =
          appleMusicRef.current;

        if (!music) {
          return;
        }

        try {
          await music.stop();
        } catch {
          // Already stopped is an acceptable final state.
        }
      }
    );
  }

  function openCallerScreen() {
    const popup = window.open(
      "/game/caller",
      "bttb-caller",
      "popup=yes,width=1200,height=800"
    );

    setMessage(
      popup
        ? "Caller Screen opened."
        : "Allow pop-ups for this site and try again."
    );
  }

  async function updateStatus(
    status:
      GameSession["status"]
  ) {
    if (!session) {
      setMessage(
        "Create a Bingo game before using the DJ controls."
      );
      return;
    }

    if (
      status === "playing"
    ) {
      gameEndedRef.current =
        false;

      if (
        session.source ===
        "apple"
      ) {
        try {
          if (
            playback.status ===
            "paused"
          ) {
            if (
              appleNeedsRequeueRef.current
            ) {
              await startAppleTrack(
                playback.currentIndex,
                restoredApplePlaybackTimeRef.current
              );

              appleNeedsRequeueRef.current =
                false;

              restoredApplePlaybackTimeRef.current =
                null;
            } else {
              const music =
                await getAuthorizedAppleMusic();

              try {
                setAppleMusicVolume(
                  music,
                  1
                );
              } catch {
                // Keep playback functional.
              }

              await safeApplePlay(music);
            }

            await playback.resume();
          } else {
            await startAppleTrack(
              playback.currentIndex
            );

            await playback.start();
          }
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Apple Music could not start playback."
          );
        }

        return;
      }

      if (
        playback.status ===
        "paused"
      ) {
        await playback.resume();
      } else {
        await playback.start();
      }

      return;
    }

    if (
      status === "paused"
    ) {
      if (
        session.source ===
        "apple"
      ) {
        try {
          await pauseAppleMusic();
        } catch (error) {
          console.error(
            "Apple Music pause failed:",
            error
          );
        }
      }

      playback.pause();
      return;
    }

    if (
      status === "complete"
    ) {
      if (
        session.source ===
        "apple"
      ) {
        try {
          await stopAppleMusic();
        } catch (error) {
          console.error(
            "Apple Music stop failed:",
            error
          );
        }
      }

      const wasComplete =
        session.status ===
        "complete";

      gameEndedRef.current =
        true;

      playback.stop();

      try {
        const response =
          await fetch(
            `/api/game/${encodeURIComponent(
              session.sessionId
            )}/status`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                status:
                  "completed",
              }),
            }
          );

        const data =
          (await response.json()) as {
            ok?: boolean;
            message?: string;
          };

        if (
          !response.ok ||
          !data.ok
        ) {
          throw new Error(
            data.message ||
              "Unable to complete the game."
          );
        }

        const nextSession = {
          ...session,
          status:
            "complete" as const,
        };

        saveSession(
          nextSession
        );

        setMessage(
          "Game ended."
        );
      } catch (error) {
        gameEndedRef.current =
          wasComplete;

        setMessage(
          error instanceof Error
            ? `Unable to end game: ${error.message}`
            : "Unable to end game."
        );
      }
    }
  }

  async function revealNow() {
    if (!session) {
      setMessage(
        "Create a Bingo game before revealing a song."
      );
      return;
    }

    if (
      session.source === "apple"
    ) {
      try {
        await pauseAppleMusic();
      } catch (error) {
        console.error(
          "Apple Music reveal pause failed:",
          error
        );
      }
    }

    playback.reveal();

    setMessage(
      "Current song revealed on the Caller Screen."
    );
  }

  async function skipSong() {
    if (!session) {
      setMessage(
        "Create a Bingo game before skipping songs."
      );
      return;
    }

    if (
      playback.currentIndex >=
      session.tracks.length - 1
    ) {
      setMessage(
        "There are no more songs in this game."
      );
      return;
    }

    const currentId =
      session.tracks[
        playback.currentIndex
      ]?.id;

    const playedTrackIds =
      currentId
        ? Array.from(
            new Set([
              ...session.playedTrackIds,
              currentId,
            ])
          )
        : session.playedTrackIds;

    saveSession({
      ...session,
      playedTrackIds,
    });

    if (
      session.source === "apple"
    ) {
      try {
        await pauseAppleMusic();
      } catch (error) {
        console.error(
          "Apple Music skip pause failed:",
          error
        );
      }
    }

    autoStartNextRef.current =
      true;

    playback.next();

    const nextTrack =
      session.tracks[
        playback.currentIndex + 1
      ];

    setDetectedTrack(
      nextTrack ?? null
    );

    if (nextTrack) {
      setMessage(
        `Advanced to ${nextTrack.artist} — ${nextTrack.name}.`
      );
    }
  }

  const progress = session?.clipLength
    ? Math.max(
        0,
        Math.min(
          100,
          ((session.clipLength - secondsRemaining) /
            session.clipLength) *
            100
        )
      )
    : 0;

  return (
    <main className="dj-shell">
      {session?.source === "apple" && (
        <Script
          id="apple-musickit-v3-dj-console"
          src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"
          strategy="afterInteractive"
          onError={() => {
            setMessage(
              "The Apple Music playback library could not load."
            );
          }}
        />
      )}
      <BingoVerificationPanel
        gameId={
          session?.status === "complete"
            ? null
            : session?.sessionId
        }
        onNewClaim={(claim) => {
          if (isPlaying) {
            playback.pause();
          }

          if (session?.status !== "paused") {
            updateStatus("paused");
          }

          setMessage(
            `BINGO CLAIM: ${claim.playerName} — Card #${claim.cardNumber}. Playback paused for verification.`
          );
        }}
      />

      <header className="dj-topbar">
        <div className="dj-brand">
          <div className="dj-logo">♫</div>
          <div>
            <p>Bingo to the Beats</p>
            <h1>DJ Console</h1>
          </div>
        </div>

        <nav className="dj-nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/game/control">Game Control</Link>
          <button type="button" onClick={openCallerScreen}>
            Open Caller Screen
          </button>
        </nav>
      </header>


      <section
        className="dj-game-status-bar"
        aria-label="Live game status"
      >
        <div className="dj-game-status-item">
          <span className="dj-game-status-icon" aria-hidden="true">♫</span>
          <strong>{session?.playlistName ?? "No Game Loaded"}</strong>
        </div>

        <div className="dj-game-status-item">
          <span className="dj-game-status-icon" aria-hidden="true">▦</span>
          <span>Pattern: <strong>Any Line</strong></span>
        </div>

        <div className="dj-game-status-item">
          <span className="dj-game-status-icon" aria-hidden="true">♙</span>
          <span>Paid Players: <strong>{roster.totals.totalPlayers}</strong></span>
        </div>

        <div className="dj-game-status-item">
          <span className="dj-game-status-icon" aria-hidden="true">▣</span>
          <span>
            Cards Sold:{" "}
            <strong>
              {roster.totals.totalCards}
            </strong>
          </span>
        </div>

        <div className="dj-game-status-item">
          <span className="dj-game-status-icon" aria-hidden="true">♫</span>
          <span>
            Song:{" "}
            <strong>
              {session
                ? Math.min(playback.currentIndex + 1, session.tracks.length)
                : 0}
              {" / "}
              {session?.tracks.length ?? 0}
            </strong>
          </span>
        </div>

        <div className="dj-game-status-item">
          <span className="dj-game-status-icon" aria-hidden="true">🏆</span>
          <span>
            Prize:{" "}
            <strong>{formatMoney(roster.payout.winnerPayoutCents)}</strong>
          </span>
        </div>

        <div className="dj-game-status-item">
          <span className="dj-game-status-icon" aria-hidden="true">◷</span>
          <span>
            Elapsed: <strong>{formatElapsed(elapsedSeconds)}</strong>
          </span>
        </div>

        <div className="dj-game-status-item dj-game-status-live">
          <span
            className={`dj-live-dot ${liveStatus ? "is-live" : ""}`}
            aria-hidden="true"
          />
          <span>Status: <strong>{statusLabel}</strong></span>
        </div>
      </section>

      <div className="dj-page">
        <section className="dj-access-strip">
          <div className="dj-access-panel">
            <GameAccessPanel
              joinCode={session?.joinCode}
              title="Players Join"
              compact
              showOpenButton
            />

            <LivePlayerRoster
              gameId={session?.sessionId}
            />
          </div>
        </section>

        <section className="dj-main-grid">
          <aside className="dj-left-stack">
            <section className="dj-panel dj-serato-panel">
              <div className="dj-panel-heading">
                <div>
                  <span className="dj-eyebrow">Music Source</span>
                  <h2>Serato Live Sync</h2>
                </div>

                <span
                  className={`dj-status-pill ${
                    isConnected ? "online" : "offline"
                  }`}
                >
                  ●{" "}
                  {isConnected
                    ? isPolling
                      ? "Checking"
                      : "Connected"
                    : "Not Connected"}
                </span>
              </div>

              <label htmlFor="serato-url">Live Playlist URL</label>
              <input
                id="serato-url"
                type="url"
                value={seratoUrl}
                onChange={(event) => setSeratoUrl(event.target.value)}
                placeholder="https://serato.com/playlists/your-name/live"
              />

              <div className="dj-button-row">
                <button
                  className="dj-primary-button"
                  type="button"
                  onClick={() => void connectSerato()}
                >
                  Connect Serato
                </button>

                <button
                  className="dj-secondary-button"
                  type="button"
                  onClick={disconnectSerato}
                >
                  Disconnect
                </button>
              </div>

              <div className="dj-meta">
                <span>
                  DJ <strong>IAMDJMIKEDOELO</strong>
                </span>
                <span>
                  Last Update <strong>{lastUpdate}</strong>
                </span>
              </div>
            </section>

            <section className="dj-panel dj-automation-panel">
              <span className="dj-eyebrow">Automation</span>

              <label className="dj-toggle">
                <span>
                  <strong>Auto Detect</strong>
                  <small>Detect new Serato songs</small>
                </span>
                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={(event) =>
                    setAutoDetect(event.target.checked)
                  }
                />
              </label>

              <label className="dj-toggle">
                <span>
                  <strong>Auto Reveal</strong>
                  <small>Reveal at zero</small>
                </span>
                <input
                  type="checkbox"
                  checked={autoReveal}
                  onChange={(event) =>
                    setAutoReveal(event.target.checked)
                  }
                />
              </label>

              <label className="dj-toggle">
                <span>
                  <strong>Auto Next</strong>
                  <small>Advance after reveal</small>
                </span>
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(event) =>
                    setAutoNext(event.target.checked)
                  }
                />
              </label>
            </section>
          </aside>

          <section className="dj-center-stack">
            <section className="dj-panel dj-now-playing">
              <div className="dj-panel-heading">
                <div>
                  <span className="dj-eyebrow">Now Playing</span>
                  <h2>Current Track</h2>
                </div>

                <span
                  className={`dj-status-pill ${
                    isPlaying ? "online" : ""
                  }`}
                >
                  {session?.status ?? "No Game"}
                </span>
              </div>

              <div className="dj-track-display">
                <div className="dj-art">
                  {currentTrack?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentTrack.image} alt="" />
                  ) : (
                    <span>♫</span>
                  )}
                </div>

                <div className="dj-track-copy">
                  <p>
                    {currentTrack?.artist ?? "Waiting for Serato"}
                  </p>
                  <h3>
                    {currentTrack?.name ?? "No song detected"}
                  </h3>
                  <span>
                    {currentTrack?.album ??
                      "Start Live Playlist in Serato DJ Pro."}
                  </span>
                </div>
              </div>

              <div className="dj-timer-row">
                <strong>{secondsRemaining}</strong>
                <div>
                  <h3>
                    {isRevealed
                      ? "Song Revealed"
                      : isPlaying
                        ? "Countdown Running"
                        : "Countdown Ready"}
                  </h3>
                  <p>
                    {session?.clipLength ?? 30}-second game timer
                  </p>
                </div>
              </div>

              <div className="dj-progress">
                <span style={{ width: `${progress}%` }} />
              </div>

              <div className="dj-waveform">
                {Array.from({ length: 46 }, (_, index) => (
                  <i
                    key={index}
                    style={{
                      height: `${15 + ((index * 13) % 38)}px`,
                      opacity:
                        index / 46 <= progress / 100 ? 1 : 0.23,
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="dj-panel dj-controls-panel">
              <span className="dj-eyebrow">Game Controls</span>

              <div className="dj-control-grid">
                <button
                  className="purple"
                  type="button"
                  onClick={() => {
                    void updateStatus(
                      isPlaying ? "paused" : "playing"
                    );
                    setMessage(
                      isPlaying
                        ? "Game paused."
                        : playback.status === "ready"
                          ? "Game started."
                          : "Game resumed."
                    );
                  }}
                >
                  <b>{isPlaying ? "Ⅱ" : "▶"}</b>
                  {isPlaying ? "Pause Game" : "Resume Game"}
                </button>

                <button
                  className="blue"
                  type="button"
                  onClick={revealNow}
                >
                  <b>◉</b>
                  Reveal Now
                </button>

                <button
                  className="orange"
                  type="button"
                  onClick={skipSong}
                >
                  <b>»</b>
                  Skip Song
                </button>

                <button
                  className="green"
                  type="button"
                  onClick={() => {
                    void updateStatus("paused");
                    setMessage(
                      "BINGO called. Game paused for verification."
                    );
                  }}
                >
                  <b>★</b>
                  BINGO
                </button>

                <button
                  className="cyan"
                  type="button"
                  onClick={openCallerScreen}
                >
                  <b>▣</b>
                  Caller Screen
                </button>

                <button
                  className="red"
                  type="button"
                  onClick={() => {
                    void updateStatus("complete");
                  }}
                >
                  <b>■</b>
                  End Game
                </button>
              </div>
            </section>

            <p className="dj-message">{message}</p>
          </section>

          <aside className="dj-right-stack">
            <section className="dj-panel dj-list-panel">
              <div className="dj-panel-heading">
                <div>
                  <span className="dj-eyebrow">Game Playlist</span>
                  <h2>Upcoming Songs</h2>
                </div>
                <small>{upcomingTracks.length} shown</small>
              </div>

              <div className="dj-track-list">
                {upcomingTracks.length === 0 ? (
                  <p className="dj-empty">
                    No upcoming songs are available.
                  </p>
                ) : (
                  upcomingTracks.map((track, index) => (
                    <div className="dj-mini-track" key={track.id}>
                      <b>{session!.currentIndex + index + 2}</b>
                      <span>
                        <strong>{track.name}</strong>
                        <small>{track.artist}</small>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="dj-panel dj-list-panel">
              <div className="dj-panel-heading">
                <div>
                  <span className="dj-eyebrow">Live History</span>
                  <h2>Recently Played</h2>
                </div>
              </div>

              <div className="dj-activity-list">
                {activity.length === 0 ? (
                  <p className="dj-empty">
                    Played songs will appear here.
                  </p>
                ) : (
                  activity.slice(0, 8).map((item) => (
                    <div
                      className="dj-activity-item"
                      key={item.id}
                    >
                      <time>
                        {new Date(
                          item.detectedAt
                        ).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                      <span>
                        <strong>{item.track.name}</strong>
                        <small>{item.track.artist}</small>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>

      <footer className="dj-footer">
        <div className="dj-footer-track">
          <span className="dj-footer-icon">
            {isPlaying ? "▶" : "Ⅱ"}
          </span>
          <div>
            <small>Current Track</small>
            <strong>
              {currentTrack
                ? `${currentTrack.artist} — ${currentTrack.name}`
                : "No track loaded"}
            </strong>
          </div>
        </div>

        <div className="dj-footer-progress">
          <div>
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>
            {Math.max(
              0,
              (session?.clipLength ?? 30) -
                secondsRemaining
            )}
            s / {session?.clipLength ?? 30}s
          </small>
        </div>

        <div className="dj-footer-status">
          <span className={isConnected ? "online" : ""}>
            ● {isConnected ? "Serato Connected" : "Serato Offline"}
          </span>
          <span>Version 2</span>
        </div>
      </footer>
    </main>
  );
}
