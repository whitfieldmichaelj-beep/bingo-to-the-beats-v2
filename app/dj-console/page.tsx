"use client";

import Link from "next/link";
import "./dj-console.css";
import GameAccessPanel from "../../components/game/GameAccessPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  usePlaybackEngine,
  type PlaybackTrack,
} from "../../hooks/usePlaybackEngine";

type MusicSource = "serato" | "spotify" | "apple";

type Track = {
  id: string;
  gameTrackId?: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  audioUrl?: string | null;
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

const GAME_SESSION_KEY = "bttb-v2-game-session";
const CALLER_STATE_KEY = "bttb-v2-caller-state";
const CHANNEL_NAME = "bttb-v2-game-sync";
const SERATO_URL_KEY = "bttb-v2-serato-live-url";
const ACTIVITY_KEY = "bttb-v2-dj-activity";
const DEFAULT_SERATO_URL =
  "https://serato.com/playlists/IAMDJMIKEDOELO/live";
const POLL_INTERVAL_MS = 4000;
const AUTO_NEXT_DELAY_MS = 2500;

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

function createPlaybackTracks(session: GameSession): PlaybackTrack[] {
  return session.tracks.map((track) => {
    const secureSeratoUrl =
      session.source === "serato"
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
      album: track.album,
      artwork: track.image ?? undefined,
      audioUrl: secureSeratoUrl ?? track.audioUrl ?? null,
      source: session.source,
    };
  });
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

  const playback = usePlaybackEngine([], session?.clipLength ?? 30);
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

  const upcomingTracks = useMemo(() => {
    if (!session) return [];
    return session.tracks.slice(
      session.currentIndex + 1,
      session.currentIndex + 6
    );
  }, [session]);

  useEffect(() => {
    const savedSession = readJson<GameSession>(GAME_SESSION_KEY);
    const savedCaller = readJson<CallerState>(CALLER_STATE_KEY);
    const savedActivity = readJson<ActivityItem[]>(ACTIVITY_KEY);
    const savedUrl =
      localStorage.getItem(SERATO_URL_KEY) ?? DEFAULT_SERATO_URL;

    if (savedSession) {
      setSession(savedSession);
      playback.loadTracks(createPlaybackTracks(savedSession));
    }
    if (savedCaller) setCallerState(savedCaller);
    if (savedActivity) setActivity(savedActivity);
    setSeratoUrl(savedUrl);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === GAME_SESSION_KEY && event.newValue) {
        const nextSession = JSON.parse(event.newValue) as GameSession;
        setSession(nextSession);
        playback.loadTracks(createPlaybackTracks(nextSession));
      }

      if (event.key === CALLER_STATE_KEY && event.newValue) {
        setCallerState(JSON.parse(event.newValue) as CallerState);
      }
    };

    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<CallerState>) => {
        setCallerState(event.data);
      };
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, [playback.loadTracks]);

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
    localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(nextSession));
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
      !autoNext ||
      playback.status !== "revealed" ||
      !session
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (playback.currentIndex >= session.tracks.length - 1) {
        gameEndedRef.current = true;
        playback.next();
        setMessage("The final song was revealed. Game complete.");
        return;
      }

      autoStartNextRef.current = true;
      playback.next();
    }, AUTO_NEXT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    autoNext,
    playback.status,
    playback.currentIndex,
    playback.next,
    playback.stop,
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
    void playback.start();
  }, [playback.status, playback.currentIndex, playback.start]);

  useEffect(() => {
    if (playback.playbackError) {
      setMessage(playback.playbackError);
    }
  }, [playback.playbackError]);

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

  async function updateStatus(status: GameSession["status"]) {
    if (!session) {
      setMessage("Create a Bingo game before using the DJ controls.");
      return;
    }

    if (status === "playing") {
      gameEndedRef.current = false;

      if (playback.status === "paused") {
        await playback.resume();
      } else {
        await playback.start();
      }
      return;
    }

    if (status === "paused") {
      playback.pause();
      return;
    }

    if (status === "complete") {
      gameEndedRef.current = true;
      playback.stop();
      const nextSession = { ...session, status: "complete" as const };
      saveSession(nextSession);
    }
  }

  function revealNow() {
    if (!session) {
      setMessage("Create a Bingo game before revealing a song.");
      return;
    }

    playback.reveal();
    setMessage("Current song revealed on the Caller Screen.");
  }

  function skipSong() {
    if (!session) {
      setMessage("Create a Bingo game before skipping songs.");
      return;
    }

    if (playback.currentIndex >= session.tracks.length - 1) {
      setMessage("There are no more songs in this game.");
      return;
    }

    const currentId = session.tracks[playback.currentIndex]?.id;
    const playedTrackIds = currentId
      ? Array.from(new Set([...session.playedTrackIds, currentId]))
      : session.playedTrackIds;

    saveSession({
      ...session,
      playedTrackIds,
    });

    autoStartNextRef.current = true;
    playback.next();

    const nextTrack = session.tracks[playback.currentIndex + 1];
    setDetectedTrack(nextTrack ?? null);

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

      <div className="dj-page">
        <section className="dj-access-strip">
          <div className="dj-access-copy">
            <span className="dj-eyebrow">Live Game Access</span>
            <h2>Players Join Here</h2>
            <p>
              Keep this code and QR visible while players are entering the game.
            </p>
          </div>

          <div className="dj-access-panel">
            <GameAccessPanel
              joinCode={session?.joinCode}
              title="Players Join"
              showOpenButton
            />
          </div>
        </section>

        <section className="dj-stat-strip">
          <article>
            <span>Game Status</span>
            <strong>{session?.status ?? "No Game"}</strong>
          </article>
          <article>
            <span>Cards Generated</span>
            <strong>{session?.cardCount ?? 0}</strong>
          </article>
          <article>
            <span>Songs Played</span>
            <strong>{session?.playedTrackIds.length ?? 0}</strong>
          </article>
          <article>
            <span>Total Songs</span>
            <strong>{session?.tracks.length ?? 0}</strong>
          </article>
          <article>
            <span>Remaining</span>
            <strong>
              {session
                ? Math.max(
                    0,
                    session.tracks.length -
                      session.currentIndex -
                      1
                  )
                : 0}
            </strong>
          </article>
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
                    setMessage("Game ended.");
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
                  <h2>Activity Feed</h2>
                </div>
              </div>

              <div className="dj-activity-list">
                {activity.length === 0 ? (
                  <p className="dj-empty">
                    Detected songs will appear here.
                  </p>
                ) : (
                  activity.map((item) => (
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
    </main>
  );
}

