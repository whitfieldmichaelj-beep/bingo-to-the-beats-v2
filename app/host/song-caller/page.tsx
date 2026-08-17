"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  type PlaybackTrack,
  usePlaybackEngine,
} from "../../../hooks/usePlaybackEngine";

const GAME_SESSION_KEY = "bttb-v2-game-session";

type WinningPattern =
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "x-pattern"
  | "blackout";

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

function loadGameSession(): GameSession | null {
  const storedValue = localStorage.getItem(GAME_SESSION_KEY);

  if (!storedValue) {
    return null;
  }

  const parsedValue = JSON.parse(storedValue) as Partial<GameSession>;

  if (
    parsedValue.version !== 2 ||
    typeof parsedValue.sessionId !== "string" ||
    !Array.isArray(parsedValue.tracks)
  ) {
    return null;
  }

  return parsedValue as GameSession;
}

function saveGameSession(session: GameSession) {
  localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(session));
}

export default function SongCallerPage() {
  const [session, setSession] =
    useState<GameSession | null>(null);

  const [isHydrated, setIsHydrated] =
    useState(false);

  useEffect(() => {
    try {
      const storedSession = loadGameSession();

      setSession(storedSession);
    } catch (error) {
      console.error(
        "Unable to load the current game session:",
        error
      );

      setSession(null);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  if (!isHydrated) {
    return (
      <main style={pageStyle}>
        <section style={emptyStateStyle}>
          <p style={eyebrowStyle}>Host Control</p>

          <h1 style={pageTitleStyle}>
            Loading Game
          </h1>

          <p style={emptyMessageStyle}>
            Preparing the current game session...
          </p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={pageStyle}>
        <section style={emptyStateStyle}>
          <p style={eyebrowStyle}>Host Control</p>

          <h1 style={pageTitleStyle}>
            No Active Game
          </h1>

          <p style={emptyMessageStyle}>
            Create or open a game before using the Song
            Caller.
          </p>
        </section>
      </main>
    );
  }

  return (
    <SongCallerWorkspace
      key={session.sessionId}
      session={session}
    />
  );
}

type SongCallerWorkspaceProps = {
  session: GameSession;
};

function SongCallerWorkspace({
  session,
}: SongCallerWorkspaceProps) {
  const restoreIndexRef = useRef<number | null>(
    Math.min(
      Math.max(session.currentIndex, 0),
      Math.max(session.tracks.length - 1, 0)
    )
  );

  const playbackTracks =
    useMemo<PlaybackTrack[]>(() => {
      return session.tracks.map((song) => ({
        id: song.id,
        title: song.name,
        artist: song.artist,
        artwork: song.image ?? undefined,
        duration: session.clipLength,
        previewUrl: null,
        source: "apple",
      }));
    }, [session.clipLength, session.tracks]);

  const playback = usePlaybackEngine(
    playbackTracks,
    session.clipLength
  );

  const {
    currentTrack,
    currentIndex,
    tracks,
    status,
    revealed,
    secondsRemaining,
    start,
    pause,
    resume,
    restart,
    stop,
    reveal,
    hide,
    next,
    previous,
    goToTrack,
  } = playback;

  useEffect(() => {
    playback.setCrossfadeSeconds(0);
  }, [
    playback.setCrossfadeSeconds,
  ]);

  useEffect(() => {
    const restoreIndex = restoreIndexRef.current;

    if (
      restoreIndex !== null &&
      restoreIndex > 0 &&
      restoreIndex < tracks.length &&
      currentIndex !== restoreIndex
    ) {
      goToTrack(restoreIndex);
    }
  }, [currentIndex, goToTrack, tracks.length]);

  useEffect(() => {
    const restoreIndex = restoreIndexRef.current;

    if (restoreIndex !== null) {
      if (currentIndex !== restoreIndex) {
        return;
      }

      restoreIndexRef.current = null;
    }

    try {
      const currentTrackId = tracks[currentIndex]?.id;
      const playedTrackIds = currentTrackId
        ? Array.from(
            new Set([
              ...session.playedTrackIds,
              currentTrackId,
            ])
          )
        : session.playedTrackIds;

      saveGameSession({
        ...session,
        currentIndex,
        status: getStoredSessionStatus(status),
        playedTrackIds,
      });
    } catch (error) {
      console.error(
        "Unable to save the current song position:",
        error
      );
    }
  }, [currentIndex, session, status, tracks]);

  const isRunning =
    status === "countdown" ||
    status === "playing";

  const isPaused = status === "paused";

  const isFirstTrack = currentIndex === 0;

  const isLastTrack =
    currentIndex >= tracks.length - 1;

  const timerMinutes = Math.floor(
    secondsRemaining / 60
  );

  const timerSeconds =
    secondsRemaining % 60;

  const formattedTime = `${String(
    timerMinutes
  ).padStart(2, "0")}:${String(
    timerSeconds
  ).padStart(2, "0")}`;

  const progress =
    tracks.length > 0
      ? ((currentIndex + 1) / tracks.length) *
        100
      : 0;

  if (!currentTrack) {
    return (
      <main style={pageStyle}>
        <section style={emptyStateStyle}>
          <p style={eyebrowStyle}>Host Control</p>

          <h1 style={pageTitleStyle}>
            No Playable Songs
          </h1>

          <p style={emptyMessageStyle}>
            This game session does not contain any
            playable songs.
          </p>

          <div style={healthGridStyle}>
            <HealthCard
              label="Total Songs"
              value={session.tracks.length}
            />

            <HealthCard
              label="Playable"
              value={session.tracks.length}
            />

            <HealthCard
              label="Skipped"
              value={0}
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>
            Host Control
          </p>

          <h1 style={pageTitleStyle}>
            Song Caller
          </h1>

          <p style={pageDescriptionStyle}>
            {session.playlistName}
          </p>
        </div>

        <div style={statusBadgeStyle}>
          <span style={statusDotStyle} />

          {getStatusLabel(status)}
        </div>
      </section>

      <section style={workspaceGridStyle}>
        <aside style={settingsPanelStyle}>
          <section>
            <p style={sectionEyebrowStyle}>
              Current Game
            </p>

            <h2 style={playlistTitleStyle}>
              {session.playlistName}
            </h2>

            <p style={playlistIdStyle}>
              Playlist ID: {session.playlistId}
            </p>
          </section>

          <div style={gameDetailsGridStyle}>
            <GameDetail
              label="Songs"
              value={session.tracks.length}
            />

            <GameDetail
              label="Cards"
              value={session.cardCount}
            />

            <GameDetail
              label="Join Code"
              value={session.joinCode}
            />

            <GameDetail
              label="Pattern"
              value={formatWinningPattern(session.winningPattern)}
            />

            <GameDetail
              label="Preview"
              value={`${session.clipLength}s`}
            />

            <GameDetail
              label="Fade"
              value="0s"
            />

            <GameDetail
              label="Transition"
              value="Manual"
            />

            <GameDetail
              label="Auto Advance"
              value="Off"
            />
          </div>

          <section style={queueHealthStyle}>
            <p style={sectionEyebrowStyle}>
              Queue Health
            </p>

            <div style={queueHealthRowsStyle}>
              <QueueHealthRow
                label="Total songs"
                value={
                  session.tracks.length
                }
              />

              <QueueHealthRow
                label="Playable songs"
                value={
                  session.tracks.length
                }
              />

              <QueueHealthRow
                label="Skipped songs"
                value={
                  0
                }
              />
            </div>
          </section>

          <section style={playlistSummaryStyle}>
            <span style={summaryLabelStyle}>
              Playlist Progress
            </span>

            <strong style={summaryValueStyle}>
              Song {currentIndex + 1} of{" "}
              {tracks.length}
            </strong>

            <div style={progressTrackStyle}>
              <div
                style={{
                  ...progressFillStyle,
                  width: `${progress}%`,
                }}
              />
            </div>
          </section>

          <div style={navigationGridStyle}>
            <button
              type="button"
              disabled={
                isFirstTrack || isRunning
              }
              onClick={previous}
              style={{
                ...navigationButtonStyle,
                opacity:
                  isFirstTrack || isRunning
                    ? 0.5
                    : 1,
                cursor:
                  isFirstTrack || isRunning
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              ⏮ Previous
            </button>

            <button
              type="button"
              disabled={
                isLastTrack || isRunning
              }
              onClick={next}
              style={{
                ...navigationButtonStyle,
                opacity:
                  isLastTrack || isRunning
                    ? 0.5
                    : 1,
                cursor:
                  isLastTrack || isRunning
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              Next ⏭
            </button>
          </div>
        </aside>

        <section style={callerPanelStyle}>
          <div style={callerTopRowStyle}>
            <p style={currentSongLabelStyle}>
              Current Song
            </p>

            <span style={sourceBadgeStyle}>
              Serato
            </span>
          </div>

          <div style={songDisplayStyle}>
            {revealed ? (
              <>
                {currentTrack.artwork ? (
                  <img
                    src={currentTrack.artwork}
                    alt=""
                    style={artworkStyle}
                  />
                ) : (
                  <div style={songIconStyle}>
                    🎵
                  </div>
                )}

                <p style={revealedLabelStyle}>
                  Song Revealed
                </p>

                <h2 style={songTitleStyle}>
                  {currentTrack.title}
                </h2>

                <p style={artistStyle}>
                  {currentTrack.artist}
                </p>
              </>
            ) : (
              <>
                <div style={songIconStyle}>
                  ❓
                </div>

                <p style={hiddenLabelStyle}>
                  Listen Carefully
                </p>

                <h2 style={hiddenTitleStyle}>
                  SONG HIDDEN
                </h2>

                <p style={hiddenDescriptionStyle}>
                  The answer will be revealed when
                  the countdown reaches zero.
                </p>
              </>
            )}
          </div>

          <div
            style={{
              ...timerStyle,
              color:
                secondsRemaining <= 5 &&
                isRunning
                  ? "#ff6b6b"
                  : "#ffffff",
            }}
          >
            {formattedTime}
          </div>

          <p style={timerCaptionStyle}>
            {getTimerCaption(
              status,
              session.clipLength
            )}
          </p>

          <div style={primaryControlsStyle}>
            {(status === "idle" ||
              status === "ready") && (
              <button
                type="button"
                onClick={() => {
                  void start();
                }}
                style={primaryButtonStyle}
              >
                ▶ Start Countdown
              </button>
            )}

            {isRunning && (
              <button
                type="button"
                onClick={pause}
                style={primaryButtonStyle}
              >
                ⏸ Pause
              </button>
            )}

            {isPaused && (
              <button
                type="button"
                onClick={() => {
                  void resume();
                }}
                style={primaryButtonStyle}
              >
                ▶ Resume
              </button>
            )}

            {!revealed && (
              <button
                type="button"
                onClick={reveal}
                style={secondaryButtonStyle}
              >
                Reveal Now
              </button>
            )}

            {revealed && (
              <button
                type="button"
                onClick={hide}
                style={secondaryButtonStyle}
              >
                Hide Answer
              </button>
            )}
          </div>

          <div style={secondaryControlsStyle}>
            <button
              type="button"
              onClick={restart}
              style={utilityButtonStyle}
            >
              ↻ Restart Timer
            </button>

            <button
              type="button"
              onClick={stop}
              style={utilityButtonStyle}
            >
              ■ Stop
            </button>

            <button
              type="button"
              disabled={isLastTrack}
              onClick={next}
              style={{
                ...utilityButtonStyle,
                opacity: isLastTrack ? 0.5 : 1,
                cursor: isLastTrack
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              Next Song ⏭
            </button>
          </div>

          {!playback.hasPlayableAudio && (
            <div style={playbackNoticeStyle}>
              <strong>
                Countdown mode
              </strong>

              <span>
                The game session is connected, but
                Serato playback URLs have not
                been resolved yet.
              </span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

type GameDetailProps = {
  label: string;
  value: string | number;
};

function GameDetail({
  label,
  value,
}: GameDetailProps) {
  return (
    <div style={gameDetailStyle}>
      <span style={gameDetailLabelStyle}>
        {label}
      </span>

      <strong style={gameDetailValueStyle}>
        {value}
      </strong>
    </div>
  );
}

type QueueHealthRowProps = {
  label: string;
  value: number;
};

function QueueHealthRow({
  label,
  value,
}: QueueHealthRowProps) {
  return (
    <div style={queueHealthRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HealthCard({
  label,
  value,
}: QueueHealthRowProps) {
  return (
    <div style={healthCardStyle}>
      <span style={gameDetailLabelStyle}>
        {label}
      </span>

      <strong style={healthCardValueStyle}>
        {value}
      </strong>
    </div>
  );
}

function getStatusLabel(
  status:
    | "idle"
    | "ready"
    | "countdown"
    | "playing"
    | "paused"
    | "revealed"
    | "finished"
) {
  switch (status) {
    case "countdown":
      return "Countdown Running";
    case "paused":
      return "Countdown Paused";
    case "revealed":
      return "Song Revealed";
    case "finished":
      return "Playlist Finished";
    case "playing":
      return "Playing";
    case "ready":
      return "Ready";
    default:
      return "Waiting to Start";
  }
}

function getTimerCaption(
  status:
    | "idle"
    | "ready"
    | "countdown"
    | "playing"
    | "paused"
    | "revealed"
    | "finished",
  clipLength: number
) {
  switch (status) {
    case "countdown":
      return "Countdown in progress";
    case "paused":
      return "Countdown paused";
    case "revealed":
      return "Answer displayed";
    case "finished":
      return "Playlist complete";
    case "playing":
      return "Song preview playing";
    default:
      return `${clipLength}-second song preview`;
  }
}

function getStoredSessionStatus(
  status:
    | "idle"
    | "ready"
    | "countdown"
    | "playing"
    | "paused"
    | "revealed"
    | "finished"
): GameSession["status"] {
  if (status === "paused") return "paused";
  if (status === "finished") return "complete";
  if (status === "countdown" || status === "playing") {
    return "playing";
  }
  return "ready";
}

function formatWinningPattern(pattern: WinningPattern) {
  switch (pattern) {
    case "any-line":
      return "Any 5 in a Row";
    case "across":
      return "Across Only";
    case "down":
      return "Down Only";
    case "diagonal":
      return "Diagonal Only";
    case "x-pattern":
      return "X Pattern";
    case "blackout":
      return "Blackout";
  }
}


const pageStyle: CSSProperties = {
  width: "min(100% - 32px, 1180px)",
  margin: "0 auto",
  padding: "40px 0 70px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "20px",
  marginBottom: "30px",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#b792ff",
  fontSize: "14px",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(32px, 6vw, 54px)",
  lineHeight: 1.05,
};

const pageDescriptionStyle: CSSProperties = {
  maxWidth: "680px",
  margin: "12px 0 0",
  color: "#aeb8cf",
  fontSize: "20px",
  fontWeight: 700,
  lineHeight: 1.5,
};

const statusBadgeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "10px 14px",
  border: "1px solid #344568",
  borderRadius: "999px",
  background: "#101a31",
  color: "#dbe4f8",
  fontSize: "13px",
  fontWeight: 800,
};

const statusDotStyle: CSSProperties = {
  width: "9px",
  height: "9px",
  borderRadius: "999px",
  background: "#8b5cf6",
  boxShadow:
    "0 0 14px rgba(139, 92, 246, 0.8)",
};

const workspaceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(280px, 0.72fr) minmax(0, 1.5fr)",
  gap: "22px",
};

const settingsPanelStyle: CSSProperties = {
  alignSelf: "start",
  padding: "24px",
  border: "1px solid #263552",
  borderRadius: "20px",
  background:
    "linear-gradient(145deg, #0a1328, #080e1e)",
};

const sectionEyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#8f9bb3",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const playlistTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#f8fafc",
  fontSize: "24px",
  lineHeight: 1.25,
};

const playlistIdStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: "11px",
  overflowWrap: "anywhere",
};

const gameDetailsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginTop: "24px",
};

const gameDetailStyle: CSSProperties = {
  padding: "13px",
  border: "1px solid #263552",
  borderRadius: "12px",
  background: "#101a31",
};

const gameDetailLabelStyle: CSSProperties = {
  display: "block",
  color: "#8f9bb3",
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const gameDetailValueStyle: CSSProperties = {
  display: "block",
  marginTop: "6px",
  color: "#f8fafc",
  fontSize: "15px",
};

const queueHealthStyle: CSSProperties = {
  marginTop: "24px",
  padding: "16px",
  border: "1px solid #263552",
  borderRadius: "14px",
  background: "#0d172c",
};

const queueHealthRowsStyle: CSSProperties = {
  display: "grid",
  gap: "9px",
  marginTop: "13px",
};

const queueHealthRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  color: "#aeb8cf",
  fontSize: "13px",
};

const playlistSummaryStyle: CSSProperties = {
  marginTop: "24px",
  padding: "17px",
  border: "1px solid #263552",
  borderRadius: "14px",
  background: "#101a31",
};

const summaryLabelStyle: CSSProperties = {
  display: "block",
  color: "#8f9bb3",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const summaryValueStyle: CSSProperties = {
  display: "block",
  marginTop: "7px",
  color: "#f8fafc",
  fontSize: "17px",
};

const progressTrackStyle: CSSProperties = {
  height: "7px",
  marginTop: "14px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "#263552",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: "999px",
  background:
    "linear-gradient(90deg, #2563eb, #9333ea)",
  transition: "width 200ms ease",
};

const navigationGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "9px",
  marginTop: "18px",
};

const navigationButtonStyle: CSSProperties = {
  padding: "12px 9px",
  border: "1px solid #435579",
  borderRadius: "11px",
  background: "#111c34",
  color: "white",
  fontSize: "13px",
  fontWeight: 800,
};

const callerPanelStyle: CSSProperties = {
  minHeight: "590px",
  padding: "30px",
  border: "1px solid #263552",
  borderRadius: "20px",
  background:
    "radial-gradient(circle at top, #19234a, #080e1e 70%)",
  textAlign: "center",
};

const callerTopRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
};

const currentSongLabelStyle: CSSProperties = {
  margin: 0,
  color: "#aeb8cf",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const sourceBadgeStyle: CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #435579",
  borderRadius: "999px",
  color: "#c4b5fd",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const songDisplayStyle: CSSProperties = {
  minHeight: "240px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px 0",
};

const artworkStyle: CSSProperties = {
  width: "92px",
  height: "92px",
  marginBottom: "16px",
  borderRadius: "18px",
  objectFit: "cover",
  boxShadow:
    "0 15px 35px rgba(0, 0, 0, 0.35)",
};

const songIconStyle: CSSProperties = {
  marginBottom: "12px",
  fontSize: "44px",
};

const revealedLabelStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#86efac",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const songTitleStyle: CSSProperties = {
  maxWidth: "680px",
  margin: 0,
  fontSize: "clamp(28px, 5vw, 44px)",
  lineHeight: 1.12,
};

const artistStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#b792ff",
  fontSize: "clamp(18px, 3vw, 24px)",
  fontWeight: 800,
};

const hiddenLabelStyle: CSSProperties = {
  margin: "0 0 9px",
  color: "#c4b5fd",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const hiddenTitleStyle: CSSProperties = {
  margin: 0,
  color: "#dbe4f8",
  fontSize: "clamp(27px, 5vw, 40px)",
  letterSpacing: "0.14em",
};

const hiddenDescriptionStyle: CSSProperties = {
  maxWidth: "480px",
  margin: "13px 0 0",
  color: "#8f9bb3",
  lineHeight: 1.6,
};

const timerStyle: CSSProperties = {
  margin: "5px 0 0",
  fontSize: "clamp(68px, 12vw, 112px)",
  fontWeight: 900,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const timerCaptionStyle: CSSProperties = {
  margin: "9px 0 25px",
  color: "#8f9bb3",
  fontSize: "13px",
  fontWeight: 700,
};

const primaryControlsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "10px",
};

const secondaryControlsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "9px",
  marginTop: "12px",
};

const primaryButtonStyle: CSSProperties = {
  padding: "15px 25px",
  border: "none",
  borderRadius: "12px",
  background:
    "linear-gradient(135deg, #8b5cf6, #6d28d9)",
  color: "white",
  fontSize: "16px",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "15px 21px",
  border: "1px solid #6547a3",
  borderRadius: "12px",
  background: "#22163d",
  color: "white",
  fontSize: "16px",
  fontWeight: 800,
  cursor: "pointer",
};

const utilityButtonStyle: CSSProperties = {
  padding: "11px 16px",
  border: "1px solid #435579",
  borderRadius: "10px",
  background: "#111c34",
  color: "#dbe4f8",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
};

const playbackNoticeStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  maxWidth: "540px",
  margin: "22px auto 0",
  padding: "13px 16px",
  border: "1px solid #7c5a24",
  borderRadius: "12px",
  background: "rgba(120, 74, 18, 0.18)",
  color: "#fcd9a2",
  fontSize: "12px",
  lineHeight: 1.5,
};

const emptyStateStyle: CSSProperties = {
  padding: "50px",
  border: "1px solid #263552",
  borderRadius: "20px",
  background: "#080e1e",
  textAlign: "center",
};

const emptyMessageStyle: CSSProperties = {
  margin: "18px 0 0",
  color: "#aeb8cf",
  fontSize: "17px",
};

const healthGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(3, minmax(0, 1fr))",
  gap: "12px",
  maxWidth: "560px",
  margin: "28px auto 0",
};

const healthCardStyle: CSSProperties = {
  padding: "16px",
  border: "1px solid #263552",
  borderRadius: "14px",
  background: "#101a31",
};

const healthCardValueStyle: CSSProperties = {
  display: "block",
  marginTop: "7px",
  color: "#f8fafc",
  fontSize: "24px",
};

