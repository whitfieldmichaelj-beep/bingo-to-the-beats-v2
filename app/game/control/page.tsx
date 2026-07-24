"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

type MusicSource = "spotify" | "apple";

type Track = {
  id: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  uri?: string;
  appleCatalogId?: string;
  appleLibraryId?: string;
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
  status: GameSession["status"];
};

const GAME_SESSION_KEY = "bttb-v2-game-session";
const CALLER_STATE_KEY = "bttb-v2-caller-state";
const CHANNEL_NAME = "bttb-v2-game-sync";

function readSession(): GameSession | null {
  try {
    const saved = localStorage.getItem(GAME_SESSION_KEY);
    return saved ? (JSON.parse(saved) as GameSession) : null;
  } catch {
    return null;
  }
}

function getPlayableAppleId(track: Track) {
  return (
    track.appleCatalogId ||
    track.id ||
    track.appleLibraryId ||
    ""
  );
}

export default function GameControlPage() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [appleScriptReady, setAppleScriptReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [message, setMessage] = useState("Loading game session...");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicRef = useRef<MusicKitInstance | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const advancingRef = useRef(false);

  const currentTrack =
    session?.tracks[session.currentIndex] ?? null;

  const upcomingTracks = useMemo(() => {
    if (!session) {
      return [];
    }

    return session.tracks.slice(session.currentIndex + 1);
  }, [session]);

  function saveSession(nextSession: GameSession) {
    sessionRef.current = nextSession;
    setSession(nextSession);
    localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(nextSession));
  }

  function broadcastState(
    nextSession = sessionRef.current,
    nextPlaying = isPlaying,
    nextSeconds = secondsRemaining
  ) {
    if (!nextSession) {
      return;
    }

    const state: CallerState = {
      sessionId: nextSession.sessionId,
      playlistName: nextSession.playlistName,
      currentTrack:
        nextSession.tracks[nextSession.currentIndex] ?? null,
      currentIndex: nextSession.currentIndex,
      totalTracks: nextSession.tracks.length,
      playedCount: nextSession.playedTrackIds.length,
      clipLength: nextSession.clipLength,
      secondsRemaining: nextSeconds,
      isPlaying: nextPlaying,
      status: nextSession.status,
    };

    localStorage.setItem(CALLER_STATE_KEY, JSON.stringify(state));

    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(state);
      channel.close();
    } catch {
      // localStorage remains the fallback.
    }
  }

  useEffect(() => {
    const savedSession = readSession();

    if (!savedSession || savedSession.tracks.length === 0) {
      setMessage(
        "No game session was found. Choose a playlist and create the game again."
      );
      return;
    }

    sessionRef.current = savedSession;
    setSession(savedSession);
    setSecondsRemaining(savedSession.clipLength);
    setMessage(
      `${savedSession.tracks.length} randomized songs are ready.`
    );
  }, []);

  useEffect(() => {
    if (session) {
      broadcastState(session, isPlaying, secondsRemaining);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isPlaying, secondsRemaining]);

  useEffect(() => {
    if (!appleScriptReady || session?.source !== "apple") {
      return;
    }

    let cancelled = false;

    async function initializeAppleMusic() {
      try {
        setMessage("Preparing Apple Music playback...");

        if (!window.MusicKit) {
          throw new Error("Apple Music did not load correctly.");
        }

        const tokenResponse = await fetch("/api/apple-music/token", {
          cache: "no-store",
        });

        const tokenData = (await tokenResponse.json()) as {
          developerToken?: string;
          error?: string;
        };

        if (!tokenResponse.ok || !tokenData.developerToken) {
          throw new Error(
            tokenData.error || "Unable to prepare Apple Music."
          );
        }

        await window.MusicKit.configure({
          developerToken: tokenData.developerToken,
          app: {
            name: "Bingo to the Beats",
            build: "2.0.0",
          },
        });

        const music = window.MusicKit.getInstance();

        if (!music) {
          throw new Error(
            "Apple Music initialized without returning a player instance."
          );
        }

        musicRef.current = music;

        if (!cancelled) {
          setAppleReady(true);
          setMessage(
            music.isAuthorized || music.musicUserToken
              ? "Apple Music is ready. Press Start Game."
              : "Press Start Game to connect Apple Music."
          );
        }
      } catch (error) {
        if (!cancelled) {
          setAppleReady(false);
          setMessage(
            error instanceof Error
              ? error.message
              : "Apple Music could not be initialized."
          );
        }
      }
    }

    void initializeAppleMusic();

    return () => {
      cancelled = true;
    };
  }, [appleScriptReady, session?.source]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      void pauseMusic();
    };
  }, []);

  async function getAuthorizedMusic() {
    const music =
      musicRef.current ??
      (window.MusicKit ? window.MusicKit.getInstance() : null);

    if (!music) {
      throw new Error(
        "Apple Music is still loading. Wait a moment and try again."
      );
    }

    musicRef.current = music;

    if (!music.isAuthorized && !music.musicUserToken) {
      setMessage("Complete Apple Music authorization...");
      const token = await music.authorize();

      if (!token) {
        throw new Error("Apple Music authorization was not completed.");
      }
    }

    return music;
  }

  async function queueEntirePlaylist(
    music: MusicKitInstance,
    activeSession: GameSession
  ) {
    if (typeof music.setQueue !== "function") {
      throw new Error(
        "This MusicKit runtime does not support queue playback."
      );
    }

    const songIds = activeSession.tracks
      .map(getPlayableAppleId)
      .filter(Boolean);

    if (songIds.length === 0) {
      throw new Error(
        "No playable Apple Music song IDs were found in this game."
      );
    }

    await music.setQueue({
      songs: songIds,
      startPosition: activeSession.currentIndex,
    });
  }

  async function playMusic() {
    const music = musicRef.current;

    if (!music || typeof music.play !== "function") {
      throw new Error(
        "This MusicKit runtime does not expose a play method."
      );
    }

    await music.play();
  }

  async function pauseMusic() {
    const music = musicRef.current;

    if (music && typeof music.pause === "function") {
      await music.pause();
    }
  }

  async function stopMusic() {
    const music = musicRef.current;

    if (!music) {
      return;
    }

    if (typeof music.stop === "function") {
      await music.stop();
      return;
    }

    if (typeof music.pause === "function") {
      await music.pause();
    }
  }

  function markTrackPlayed(activeSession: GameSession) {
    const track = activeSession.tracks[activeSession.currentIndex];

    if (!track || activeSession.playedTrackIds.includes(track.id)) {
      return activeSession;
    }

    return {
      ...activeSession,
      playedTrackIds: [...activeSession.playedTrackIds, track.id],
    };
  }

  function startClipTimer(activeSession: GameSession) {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    let remaining = activeSession.clipLength;
    setSecondsRemaining(remaining);

    timerRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsRemaining(Math.max(0, remaining));

      if (remaining <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        void advanceAutomatically();
      }
    }, 1000);
  }

  async function startContinuousGame() {
    const activeSession = sessionRef.current;

    if (!activeSession || activeSession.source !== "apple") {
      return;
    }

    try {
      setMessage("Loading the complete randomized Apple Music queue...");

      const music = await getAuthorizedMusic();
      await queueEntirePlaylist(music, activeSession);
      await playMusic();

      const nextSession: GameSession = {
        ...activeSession,
        status: "playing",
      };

      saveSession(nextSession);
      setIsPlaying(true);
      startClipTimer(nextSession);
      setMessage(
        `Game started. Songs will continue automatically until Bingo is called.`
      );
    } catch (error) {
      setIsPlaying(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "The Apple Music queue could not be started."
      );
    }
  }

  async function resumePlayback() {
    const activeSession = sessionRef.current;

    if (!activeSession) {
      return;
    }

    try {
      await playMusic();

      const nextSession: GameSession = {
        ...activeSession,
        status: "playing",
      };

      saveSession(nextSession);
      setIsPlaying(true);
      startClipTimer(nextSession);
      setMessage("Playback resumed.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Playback could not be resumed."
      );
    }
  }

  async function pausePlayback() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    await pauseMusic();
    setIsPlaying(false);

    const activeSession = sessionRef.current;

    if (activeSession) {
      saveSession({
        ...activeSession,
        status: "paused",
      });
    }

    setMessage("Playback paused.");
  }

  async function advanceAutomatically() {
    if (advancingRef.current) {
      return;
    }

    advancingRef.current = true;

    try {
      await goToNextTrack(true);
    } finally {
      advancingRef.current = false;
    }
  }

  async function goToNextTrack(autoAdvance = false) {
    const activeSession = sessionRef.current;
    const music = musicRef.current;

    if (!activeSession || !music) {
      return;
    }

    const updated = markTrackPlayed(activeSession);
    const nextIndex = updated.currentIndex + 1;

    if (nextIndex >= updated.tracks.length) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      await stopMusic();

      const completed: GameSession = {
        ...updated,
        status: "complete",
      };

      saveSession(completed);
      setIsPlaying(false);
      setSecondsRemaining(0);
      setMessage("The complete randomized playlist has finished.");
      return;
    }

    if (typeof music.skipToNextItem === "function") {
      await music.skipToNextItem();
    } else {
      await queueEntirePlaylist(music, {
        ...updated,
        currentIndex: nextIndex,
      });
      await playMusic();
    }

    const nextSession: GameSession = {
      ...updated,
      currentIndex: nextIndex,
      status: "playing",
    };

    saveSession(nextSession);
    setIsPlaying(true);
    startClipTimer(nextSession);
    setMessage(
      autoAdvance
        ? `Now playing automatically: ${nextSession.tracks[nextIndex].name}`
        : `Now playing: ${nextSession.tracks[nextIndex].name}`
    );
  }

  async function goToPreviousTrack() {
    const activeSession = sessionRef.current;
    const music = musicRef.current;

    if (
      !activeSession ||
      !music ||
      activeSession.currentIndex === 0
    ) {
      return;
    }

    const previousIndex = activeSession.currentIndex - 1;

    if (typeof music.skipToPreviousItem === "function") {
      await music.skipToPreviousItem();
    } else {
      await queueEntirePlaylist(music, {
        ...activeSession,
        currentIndex: previousIndex,
      });
      await playMusic();
    }

    const nextSession: GameSession = {
      ...activeSession,
      currentIndex: previousIndex,
      status: "playing",
    };

    saveSession(nextSession);
    setIsPlaying(true);
    startClipTimer(nextSession);
    setMessage(
      `Now playing: ${nextSession.tracks[previousIndex].name}`
    );
  }

  async function jumpToTrack(index: number) {
    const activeSession = sessionRef.current;
    const music = musicRef.current;

    if (!activeSession || !music) {
      return;
    }

    await queueEntirePlaylist(music, {
      ...activeSession,
      currentIndex: index,
    });
    await playMusic();

    const nextSession: GameSession = {
      ...activeSession,
      currentIndex: index,
      status: "playing",
    };

    saveSession(nextSession);
    setIsPlaying(true);
    startClipTimer(nextSession);
    setMessage(`Now playing: ${nextSession.tracks[index].name}`);
  }

  async function stopForBingo() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    await pauseMusic();
    setIsPlaying(false);

    const activeSession = sessionRef.current;

    if (activeSession) {
      saveSession({
        ...activeSession,
        status: "paused",
      });
    }

    setMessage(
      "Bingo called. Music is paused while the card is verified."
    );
  }

  function openCallerScreen() {
    const callerWindow = window.open(
      "/game/caller",
      "bttb-caller",
      "popup=yes,width=1200,height=800"
    );

    broadcastState();

    if (!callerWindow) {
      setMessage(
        "The caller window was blocked. Allow pop-ups for this site and try again."
      );
    }
  }

  async function startGameAndOpenCaller() {
    openCallerScreen();
    await startContinuousGame();
  }

  if (!session || !currentTrack) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#030712",
          color: "white",
        }}
      >
        <section style={{ maxWidth: "620px", textAlign: "center" }}>
          <h1>Game Session Not Ready</h1>
          <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
            {message}
          </p>
          <Link href="/music/apple" style={{ color: "#c4b5fd" }}>
            Return to Apple Music
          </Link>
        </section>
      </main>
    );
  }

  return (
    <>
      {session.source === "apple" && (
        <Script
          src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"
          strategy="afterInteractive"
          onReady={() => setAppleScriptReady(true)}
          onLoad={() => setAppleScriptReady(true)}
          onError={() => {
            setAppleReady(false);
            setMessage(
              "The Apple Music player library could not load."
            );
          }}
        />
      )}

      <main
        style={{
          minHeight: "100vh",
          padding: "42px 24px 90px",
          background:
            "radial-gradient(circle at top left, #312e81 0%, #111827 42%, #030712 100%)",
          color: "white",
        }}
      >
        <section style={{ width: "min(100%, 1180px)", margin: "0 auto" }}>
          <Link
            href="/dashboard"
            style={{
              color: "#c4b5fd",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            ← Back to Dashboard
          </Link>

          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "end",
              flexWrap: "wrap",
              gap: "24px",
              marginTop: "30px",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  color: "#c4b5fd",
                  fontWeight: 900,
                  textTransform: "uppercase",
                }}
              >
                Version 2 Host Control · Apple Music
              </p>

              <h1
                style={{
                  margin: "10px 0 0",
                  fontSize: "clamp(38px, 6vw, 62px)",
                  lineHeight: 1,
                }}
              >
                {session.playlistName}
              </h1>

              <p style={{ color: "#cbd5e1" }}>
                {session.tracks.length} songs · Continuous automatic play ·{" "}
                {session.clipLength}-second clips
              </p>
            </div>

            <button
              type="button"
              onClick={startGameAndOpenCaller}
              disabled={!appleReady}
              style={{
                padding: "16px 25px",
                border: 0,
                borderRadius: "999px",
                background: "#a3e635",
                color: "#172554",
                fontWeight: 900,
                cursor: appleReady ? "pointer" : "not-allowed",
                opacity: appleReady ? 1 : 0.5,
              }}
            >
              {appleReady
                ? "Start Game + Continuous Play"
                : "Preparing Apple Music..."}
            </button>
          </header>

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "16px",
              marginTop: "32px",
            }}
          >
            {[
              {
                label: "Track",
                value: `${session.currentIndex + 1} / ${
                  session.tracks.length
                }`,
              },
              {
                label: "Played",
                value: String(session.playedTrackIds.length),
              },
              {
                label: "Cards",
                value: String(session.cardCount),
              },
              {
                label: "Clip Remaining",
                value: `${secondsRemaining}s`,
              },
            ].map((item) => (
              <article
                key={item.label}
                style={{
                  padding: "20px",
                  borderRadius: "18px",
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid #334155",
                }}
              >
                <p style={{ margin: 0, color: "#94a3b8" }}>
                  {item.label}
                </p>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "28px",
                    fontWeight: 900,
                  }}
                >
                  {item.value}
                </p>
              </article>
            ))}
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "24px",
              marginTop: "28px",
            }}
          >
            <article
              style={{
                padding: "32px",
                borderRadius: "24px",
                background:
                  "linear-gradient(145deg, rgba(88,28,135,.72), rgba(15,23,42,.96))",
                border: "1px solid #a78bfa",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#c4b5fd",
                  fontWeight: 900,
                  textTransform: "uppercase",
                }}
              >
                Current Apple Music Song
              </p>

              {currentTrack.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentTrack.image}
                  alt=""
                  style={{
                    width: "190px",
                    height: "190px",
                    marginTop: "24px",
                    borderRadius: "20px",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "190px",
                    height: "190px",
                    display: "grid",
                    placeItems: "center",
                    marginTop: "24px",
                    borderRadius: "20px",
                    background: "rgba(167,139,250,.18)",
                    fontSize: "70px",
                  }}
                >
                  ♫
                </div>
              )}

              <h2 style={{ margin: "24px 0 0", fontSize: "36px" }}>
                {currentTrack.name}
              </h2>

              <p
                style={{
                  margin: "8px 0 0",
                  color: "#cbd5e1",
                  fontSize: "20px",
                }}
              >
                {currentTrack.artist}
              </p>

              <p style={{ marginTop: "8px", color: "#94a3b8" }}>
                {currentTrack.album}
              </p>

              <div
                style={{
                  height: "12px",
                  marginTop: "24px",
                  overflow: "hidden",
                  borderRadius: "999px",
                  background: "#334155",
                }}
              >
                <div
                  style={{
                    width: `${
                      (secondsRemaining / session.clipLength) * 100
                    }%`,
                    height: "100%",
                    background: "#a3e635",
                    transition: "width 1s linear",
                  }}
                />
              </div>

              <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
                {message}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "12px",
                  marginTop: "24px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    void goToPreviousTrack();
                  }}
                  disabled={session.currentIndex === 0}
                  style={secondaryButtonStyle}
                >
                  Previous
                </button>

                <button
                  type="button"
                  onClick={
                    isPlaying
                      ? () => {
                          void pausePlayback();
                        }
                      : session.status === "paused"
                        ? () => {
                            void resumePlayback();
                          }
                        : () => {
                            void startContinuousGame();
                          }
                  }
                  disabled={!appleReady}
                  style={{
                    ...primaryButtonStyle,
                    opacity: appleReady ? 1 : 0.5,
                  }}
                >
                  {isPlaying ? "Pause Audio" : "Play Audio"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void goToNextTrack(false);
                  }}
                  style={secondaryButtonStyle}
                >
                  Next
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  void stopForBingo();
                }}
                style={{
                  width: "100%",
                  marginTop: "16px",
                  padding: "16px 20px",
                  border: 0,
                  borderRadius: "999px",
                  background: "#ef4444",
                  color: "white",
                  fontSize: "17px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                BINGO — Pause Music
              </button>
            </article>

            <article
              style={{
                padding: "30px",
                borderRadius: "24px",
                background: "rgba(15, 23, 42, 0.94)",
                border: "1px solid #334155",
              }}
            >
              <h2 style={{ margin: 0 }}>Apple Music Queue</h2>
              <p style={{ color: "#94a3b8" }}>
                Songs advance automatically until Bingo is called.
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  marginTop: "20px",
                  maxHeight: "650px",
                  overflowY: "auto",
                }}
              >
                {upcomingTracks.map((track, offset) => {
                  const realIndex = session.currentIndex + offset + 1;

                  return (
                    <button
                      key={`${track.id}-${realIndex}`}
                      type="button"
                      onClick={() => {
                        void jumpToTrack(realIndex);
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "34px 1fr",
                        gap: "12px",
                        padding: "14px",
                        borderRadius: "14px",
                        border: "1px solid #334155",
                        background: "rgba(2,6,23,.45)",
                        color: "white",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <strong style={{ color: "#a78bfa" }}>
                        {realIndex + 1}
                      </strong>

                      <span>
                        <strong style={{ display: "block" }}>
                          {track.name}
                        </strong>

                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "13px",
                          }}
                        >
                          {track.artist}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "18px",
              marginTop: "28px",
            }}
          >
            <Link href="/game/cards" style={actionStyle}>
              Generate Bingo Cards
            </Link>

            <button
              type="button"
              onClick={openCallerScreen}
              style={{ ...actionStyle, cursor: "pointer" }}
            >
              Open Caller Screen
            </button>

            <Link href="/join" style={actionStyle}>
              Open Player View
            </Link>

            <Link href="/dashboard" style={actionStyle}>
              End Game
            </Link>
          </section>
        </section>
      </main>
    </>
  );
}

const primaryButtonStyle = {
  padding: "14px 18px",
  border: 0,
  borderRadius: "999px",
  background: "#a3e635",
  color: "#172554",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "14px 18px",
  borderRadius: "999px",
  border: "1px solid #64748b",
  background: "transparent",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const actionStyle = {
  padding: "20px",
  borderRadius: "18px",
  background: "rgba(15, 23, 42, 0.92)",
  border: "1px solid #334155",
  color: "white",
  textAlign: "center" as const,
  textDecoration: "none",
  fontWeight: 900,
};

