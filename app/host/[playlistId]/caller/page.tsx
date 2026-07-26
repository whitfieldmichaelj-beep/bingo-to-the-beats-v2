"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useParams,
  useSearchParams,
} from "next/navigation";

type SpotifyTrack = {
  id: string;
  name: string;
  uri?: string;
  preview_url?: string | null;
  duration_ms?: number;
  artists?: Array<{
    name: string;
  }>;
  album?: {
    name?: string;
    images?: Array<{
      url: string;
    }>;
  };
};

type PlaylistItem = {
  track?: SpotifyTrack | null;
};

type PlaylistResponse = {
  items?: PlaylistItem[];
  error?: string;
};

function shuffleTracks(tracks: SpotifyTrack[]) {
  const shuffled = [...tracks];

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = Math.floor(
      Math.random() * (index + 1)
    );

    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export default function CallerPage() {
  const params = useParams<{ playlistId: string }>();
  const searchParams = useSearchParams();
  const mainRef = useRef<HTMLElement | null>(null);

  const playlistName =
    searchParams.get("name") || "Selected Playlist";

  const clipLengthValue = Number(
    searchParams.get("clipLength") || "20"
  );

  const clipLength =
    Number.isFinite(clipLengthValue) &&
    clipLengthValue > 0
      ? clipLengthValue
      : 20;

  const cardCount =
    searchParams.get("cardCount") || "100";

  const trackCountFromQuery =
    searchParams.get("trackCount") || "0";

  const [tracks, setTracks] = useState<
    SpotifyTrack[]
  >([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [
    secondsRemaining,
    setSecondsRemaining,
  ] = useState(clipLength);

  const [isRunning, setIsRunning] =
    useState(false);

  const [isRevealed, setIsRevealed] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const [error, setError] = useState("");

  const currentTrack =
    tracks[currentIndex] ?? null;

  const playedTracks = useMemo(
    () => tracks.slice(0, currentIndex),
    [tracks, currentIndex]
  );

  const remainingTracks = Math.max(
    tracks.length - currentIndex - 1,
    0
  );

  const timerProgress =
    clipLength > 0
      ? secondsRemaining / clipLength
      : 0;

  const playlistProgress =
    tracks.length > 0
      ? ((currentIndex + 1) / tracks.length) *
        100
      : 0;

  const circleRadius = 72;
  const circleCircumference =
    2 * Math.PI * circleRadius;

  const timerDashOffset =
    circleCircumference *
    (1 - timerProgress);

  const artistNames =
    currentTrack?.artists
      ?.map((artist) => artist.name)
      .join(", ") || "Unknown artist";

  const albumArtwork =
    currentTrack?.album?.images?.[0]?.url;

  const loadTracks = useCallback(
    async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/spotify/playlists/${encodeURIComponent(
            params.playlistId
          )}/tracks`,
          {
            cache: "no-store",
          }
        );

        const data =
          (await response.json()) as PlaylistResponse;

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to load playlist songs."
          );
        }

        const validTracks = (
          data.items ?? []
        )
          .map((item) => item.track)
          .filter(
            (
              track
            ): track is SpotifyTrack =>
              Boolean(
                track?.id && track?.name
              )
          );

        if (validTracks.length === 0) {
          throw new Error(
            "This playlist does not contain any playable songs."
          );
        }

        setTracks(
          shuffleTracks(validTracks)
        );

        setCurrentIndex(0);
        setSecondsRemaining(clipLength);
        setIsRunning(false);
        setIsRevealed(false);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load playlist songs."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [clipLength, params.playlistId]
  );

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    if (!isRunning || !currentTrack) {
      return;
    }

    if (secondsRemaining <= 0) {
      setIsRunning(false);
      setIsRevealed(true);
      return;
    }

    const timer = window.setTimeout(
      () => {
        setSecondsRemaining(
          (current) =>
            Math.max(current - 1, 0)
        );
      },
      1000
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    currentTrack,
    isRunning,
    secondsRemaining,
  ]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(
        Boolean(document.fullscreenElement)
      );
    }

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  function startOrPause() {
    if (!currentTrack) {
      return;
    }

    if (secondsRemaining <= 0) {
      setSecondsRemaining(clipLength);
      setIsRevealed(false);
      setIsRunning(true);
      return;
    }

    setIsRunning(
      (current) => !current
    );
  }

  function restartTrack() {
    if (!currentTrack) {
      return;
    }

    setSecondsRemaining(clipLength);
    setIsRevealed(false);
    setIsRunning(false);
  }

  function nextTrack() {
    if (
      currentIndex >=
      tracks.length - 1
    ) {
      setIsRunning(false);
      setIsRevealed(true);
      return;
    }

    setCurrentIndex(
      (current) => current + 1
    );

    setSecondsRemaining(clipLength);
    setIsRunning(false);
    setIsRevealed(false);
  }

  function previousTrack() {
    if (currentIndex <= 0) {
      return;
    }

    setCurrentIndex(
      (current) => current - 1
    );

    setSecondsRemaining(clipLength);
    setIsRunning(false);
    setIsRevealed(false);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await mainRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (fullscreenError) {
      console.error(
        "Fullscreen error:",
        fullscreenError
      );
    }
  }

  useEffect(() => {
    function handleKeyboard(
      event: KeyboardEvent
    ) {
      const target =
        event.target as HTMLElement | null;

      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTyping) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        startOrPause();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextTrack();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previousTrack();
        return;
      }

      if (
        event.key.toLowerCase() === "r"
      ) {
        setIsRevealed(true);
        setIsRunning(false);
        return;
      }

      if (
        event.key.toLowerCase() === "h"
      ) {
        setIsRevealed(false);
        return;
      }

      if (
        event.key.toLowerCase() === "f"
      ) {
        void toggleFullscreen();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyboard
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboard
      );
    };
  });

  const backQuery =
    new URLSearchParams({
      name: playlistName,
      clipLength: String(clipLength),
      cardCount,
      trackCount: String(
        tracks.length ||
          trackCountFromQuery
      ),
    });

  return (
    <main
      ref={mainRef}
      style={{
        minHeight: "100vh",
        padding: isFullscreen
          ? "20px"
          : "32px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #0f172a 45%, #020617 100%)",
        color: "white",
        fontFamily:
          "Arial, Helvetica, sans-serif",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isFullscreen
            ? "1600px"
            : "1240px",
          margin: "0 auto",
        }}
      >
        {!isFullscreen && (
          <Link
            href={`/host/${params.playlistId}/game?${backQuery.toString()}`}
            style={{
              color: "#93c5fd",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            ← Back to Game Setup
          </Link>
        )}

        <header
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "flex-end",
            gap: "24px",
            marginTop: isFullscreen
              ? "0"
              : "26px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                color: "#1ed760",
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Bingo to the Beats
            </p>

            <h1
              style={{
                margin: "8px 0 0",
                fontSize:
                  "clamp(30px, 5vw, 58px)",
                lineHeight: 1,
              }}
            >
              {playlistName}
            </h1>
          </div>

          <button
            type="button"
            onClick={() =>
              void toggleFullscreen()
            }
            style={{
              padding: "12px 18px",
              border:
                "1px solid #475569",
              borderRadius: "12px",
              background: "#1e293b",
              color: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {isFullscreen
              ? "Exit Fullscreen"
              : "Fullscreen"}
          </button>
        </header>

        {isLoading ? (
          <section
            style={{
              marginTop: "36px",
              padding: "32px",
              background: "#111827",
              border:
                "1px solid #334155",
              borderRadius: "20px",
            }}
          >
            Loading playlist songs…
          </section>
        ) : error ? (
          <section
            style={{
              marginTop: "36px",
              padding: "32px",
              background: "#111827",
              border:
                "1px solid #7f1d1d",
              borderRadius: "20px",
            }}
          >
            <h2>
              Unable to load the caller
            </h2>

            <p
              style={{
                marginTop: "12px",
                color: "#fecaca",
              }}
            >
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadTracks()
              }
              style={{
                marginTop: "20px",
                padding: "12px 18px",
                border: 0,
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Try Again
            </button>
          </section>
        ) : (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  isFullscreen
                    ? "minmax(0, 1fr) 260px"
                    : "minmax(0, 1fr) 310px",
                gap: "22px",
                marginTop: "28px",
              }}
            >
              <div
                style={{
                  padding: isFullscreen
                    ? "24px"
                    : "30px",
                  background:
                    "rgba(15, 23, 42, 0.96)",
                  border:
                    "1px solid #334155",
                  borderRadius: "24px",
                  boxShadow:
                    "0 30px 80px rgba(0, 0, 0, 0.35)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                    gap: "20px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        color: "#94a3b8",
                        fontSize: "15px",
                        fontWeight: 800,
                        letterSpacing:
                          "0.08em",
                        textTransform:
                          "uppercase",
                      }}
                    >
                      Now Calling
                    </p>

                    <h2
                      style={{
                        margin:
                          "8px 0 0",
                        fontSize:
                          "clamp(28px, 4vw, 48px)",
                      }}
                    >
                      Song{" "}
                      {currentIndex + 1}{" "}
                      of {tracks.length}
                    </h2>
                  </div>

                  <div
                    style={{
                      padding:
                        "12px 16px",
                      background:
                        isRunning
                          ? "#14532d"
                          : isRevealed
                            ? "#4c1d95"
                            : "#1e293b",
                      borderRadius:
                        "999px",
                      fontWeight: 900,
                    }}
                  >
                    {isRunning
                      ? "TIMER RUNNING"
                      : isRevealed
                        ? "SONG REVEALED"
                        : "READY"}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      isFullscreen
                        ? "minmax(260px, 390px) minmax(0, 1fr)"
                        : "minmax(220px, 340px) minmax(0, 1fr)",
                    alignItems: "center",
                    gap: isFullscreen
                      ? "42px"
                      : "32px",
                    marginTop: "28px",
                  }}
                >
                  <div
                    style={{
                      position:
                        "relative",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "1",
                        overflow: "hidden",
                        background:
                          "#1e293b",
                        borderRadius:
                          "24px",
                        boxShadow:
                          "0 24px 60px rgba(0, 0, 0, 0.45)",
                        filter:
                          isRevealed
                            ? "none"
                            : "blur(14px) brightness(0.45)",
                        transform:
                          isRevealed
                            ? "scale(1)"
                            : "scale(0.97)",
                        transition:
                          "filter 250ms ease, transform 250ms ease",
                      }}
                    >
                      {albumArtwork ? (
                        <img
                          src={
                            albumArtwork
                          }
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit:
                              "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            display:
                              "grid",
                            width: "100%",
                            height:
                              "100%",
                            placeItems:
                              "center",
                            fontSize:
                              "84px",
                          }}
                        >
                          ♪
                        </div>
                      )}
                    </div>

                    {!isRevealed && (
                      <div
                        style={{
                          position:
                            "absolute",
                          inset: 0,
                          display:
                            "grid",
                          placeItems:
                            "center",
                          fontSize:
                            "72px",
                        }}
                      >
                        ?
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      textAlign:
                        "center",
                    }}
                  >
                    <div
                      style={{
                        position:
                          "relative",
                        width: "180px",
                        height:
                          "180px",
                        margin:
                          "0 auto 24px",
                      }}
                    >
                      <svg
                        width="180"
                        height="180"
                        viewBox="0 0 180 180"
                        style={{
                          transform:
                            "rotate(-90deg)",
                        }}
                      >
                        <circle
                          cx="90"
                          cy="90"
                          r={
                            circleRadius
                          }
                          fill="transparent"
                          stroke="#1e293b"
                          strokeWidth="14"
                        />

                        <circle
                          cx="90"
                          cy="90"
                          r={
                            circleRadius
                          }
                          fill="transparent"
                          stroke={
                            secondsRemaining <=
                            5
                              ? "#ef4444"
                              : "#1ed760"
                          }
                          strokeWidth="14"
                          strokeLinecap="round"
                          strokeDasharray={
                            circleCircumference
                          }
                          strokeDashoffset={
                            timerDashOffset
                          }
                          style={{
                            transition:
                              "stroke-dashoffset 1s linear, stroke 200ms ease",
                          }}
                        />
                      </svg>

                      <div
                        style={{
                          position:
                            "absolute",
                          inset: 0,
                          display:
                            "grid",
                          placeItems:
                            "center",
                        }}
                      >
                        <strong
                          style={{
                            fontSize:
                              "58px",
                            lineHeight: 1,
                          }}
                        >
                          {
                            secondsRemaining
                          }
                        </strong>
                      </div>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        color: "#1ed760",
                        fontWeight: 900,
                        letterSpacing:
                          "0.12em",
                        textTransform:
                          "uppercase",
                      }}
                    >
                      {isRevealed
                        ? "Song Revealed"
                        : "Guess This Song"}
                    </p>

                    <h2
                      style={{
                        margin:
                          "14px 0 0",
                        fontSize:
                          "clamp(34px, 5vw, 70px)",
                        lineHeight: 1.02,
                        wordBreak:
                          "break-word",
                      }}
                    >
                      {isRevealed
                        ? currentTrack?.name
                        : "Song Title Hidden"}
                    </h2>

                    <p
                      style={{
                        margin:
                          "16px 0 0",
                        color: "#cbd5e1",
                        fontSize:
                          "clamp(22px, 3vw, 34px)",
                        fontWeight: 700,
                      }}
                    >
                      {isRevealed
                        ? artistNames
                        : "Artist Hidden"}
                    </p>

                    {isRevealed &&
                      currentTrack?.album
                        ?.name && (
                        <p
                          style={{
                            margin:
                              "12px 0 0",
                            color:
                              "#94a3b8",
                            fontSize:
                              "18px",
                          }}
                        >
                          {
                            currentTrack
                              .album
                              .name
                          }
                        </p>
                      )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(5, minmax(0, 1fr))",
                    gap: "12px",
                    marginTop: "30px",
                  }}
                >
                  <button
                    type="button"
                    onClick={
                      previousTrack
                    }
                    disabled={
                      currentIndex === 0
                    }
                    style={{
                      padding: "15px",
                      border: 0,
                      borderRadius:
                        "12px",
                      cursor:
                        currentIndex ===
                        0
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: 800,
                      opacity:
                        currentIndex ===
                        0
                          ? 0.45
                          : 1,
                    }}
                  >
                    ← Previous
                  </button>

                  <button
                    type="button"
                    onClick={
                      startOrPause
                    }
                    style={{
                      padding: "15px",
                      border: 0,
                      borderRadius:
                        "12px",
                      background:
                        "#1ed760",
                      color: "#052e16",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {isRunning
                      ? "Pause"
                      : "Start"}
                  </button>

                  <button
                    type="button"
                    onClick={
                      restartTrack
                    }
                    style={{
                      padding: "15px",
                      border: 0,
                      borderRadius:
                        "12px",
                      background:
                        "#334155",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    Restart
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsRevealed(
                        (current) =>
                          !current
                      );

                      setIsRunning(
                        false
                      );
                    }}
                    style={{
                      padding: "15px",
                      border: 0,
                      borderRadius:
                        "12px",
                      background:
                        "#7c3aed",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    {isRevealed
                      ? "Hide"
                      : "Reveal"}
                  </button>

                  <button
                    type="button"
                    onClick={nextTrack}
                    disabled={
                      currentIndex >=
                      tracks.length - 1
                    }
                    style={{
                      padding: "15px",
                      border: 0,
                      borderRadius:
                        "12px",
                      cursor:
                        currentIndex >=
                        tracks.length - 1
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: 800,
                      opacity:
                        currentIndex >=
                        tracks.length - 1
                          ? 0.45
                          : 1,
                    }}
                  >
                    Next →
                  </button>
                </div>

                <div
                  style={{
                    marginTop: "24px",
                  }}
                >
                  <div
                    style={{
                      height: "12px",
                      overflow: "hidden",
                      background:
                        "#1e293b",
                      borderRadius:
                        "999px",
                    }}
                  >
                    <div
                      style={{
                        width: `${playlistProgress}%`,
                        height: "100%",
                        background:
                          "linear-gradient(90deg, #1ed760, #38bdf8)",
                        borderRadius:
                          "999px",
                        transition:
                          "width 300ms ease",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      marginTop: "9px",
                      color: "#94a3b8",
                      fontSize: "14px",
                    }}
                  >
                    <span>
                      Song{" "}
                      {currentIndex + 1}
                    </span>

                    <span>
                      {tracks.length} total
                    </span>
                  </div>
                </div>

                {!isFullscreen && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "center",
                      gap: "16px",
                      marginTop: "22px",
                      color: "#94a3b8",
                      fontSize: "13px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      Space: Start/Pause
                    </span>

                    <span>
                      ← Previous
                    </span>

                    <span>
                      → Next
                    </span>

                    <span>
                      R: Reveal
                    </span>

                    <span>
                      H: Hide
                    </span>

                    <span>
                      F: Fullscreen
                    </span>
                  </div>
                )}
              </div>

              <aside
                style={{
                  display: "grid",
                  alignContent:
                    "start",
                  gap: "18px",
                }}
              >
                <section
                  style={{
                    padding: "20px",
                    background:
                      "rgba(15, 23, 42, 0.96)",
                    border:
                      "1px solid #334155",
                    borderRadius:
                      "20px",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize:
                        "22px",
                    }}
                  >
                    Game Statistics
                  </h2>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: "10px",
                      marginTop: "16px",
                    }}
                  >
                    {[
                      {
                        label:
                          "Playlist",
                        value:
                          tracks.length,
                      },
                      {
                        label:
                          "Played",
                        value:
                          playedTracks.length,
                      },
                      {
                        label:
                          "Remaining",
                        value:
                          remainingTracks,
                      },
                      {
                        label:
                          "Cards",
                        value:
                          cardCount,
                      },
                    ].map((item) => (
                      <div
                        key={
                          item.label
                        }
                        style={{
                          padding:
                            "14px",
                          background:
                            "#1e293b",
                          borderRadius:
                            "12px",
                          textAlign:
                            "center",
                        }}
                      >
                        <strong
                          style={{
                            display:
                              "block",
                            fontSize:
                              "26px",
                          }}
                        >
                          {item.value}
                        </strong>

                        <span
                          style={{
                            display:
                              "block",
                            marginTop:
                              "5px",
                            color:
                              "#94a3b8",
                            fontSize:
                              "12px",
                            textTransform:
                              "uppercase",
                          }}
                        >
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section
                  style={{
                    padding: "20px",
                    background:
                      "rgba(15, 23, 42, 0.96)",
                    border:
                      "1px solid #334155",
                    borderRadius:
                      "20px",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize:
                        "22px",
                    }}
                  >
                    Called Songs
                  </h2>

                  <p
                    style={{
                      margin:
                        "7px 0 0",
                      color: "#94a3b8",
                    }}
                  >
                    {
                      playedTracks.length
                    }{" "}
                    songs completed
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      maxHeight:
                        isFullscreen
                          ? "520px"
                          : "490px",
                      marginTop: "16px",
                      overflowY: "auto",
                    }}
                  >
                    {playedTracks.length ===
                    0 ? (
                      <p
                        style={{
                          color:
                            "#64748b",
                        }}
                      >
                        No songs have been
                        called yet.
                      </p>
                    ) : (
                      playedTracks
                        .slice()
                        .reverse()
                        .map(
                          (
                            track,
                            reverseIndex
                          ) => {
                            const originalIndex =
                              playedTracks.length -
                              reverseIndex;

                            const artwork =
                              track
                                .album
                                ?.images?.[0]
                                ?.url;

                            return (
                              <article
                                key={`${track.id}-${originalIndex}`}
                                style={{
                                  display:
                                    "grid",
                                  gridTemplateColumns:
                                    "44px 1fr",
                                  gap: "11px",
                                  alignItems:
                                    "center",
                                  padding:
                                    "10px",
                                  background:
                                    "#1e293b",
                                  borderRadius:
                                    "12px",
                                }}
                              >
                                <div
                                  style={{
                                    position:
                                      "relative",
                                    width:
                                      "44px",
                                    height:
                                      "44px",
                                    overflow:
                                      "hidden",
                                    background:
                                      "#334155",
                                    borderRadius:
                                      "8px",
                                  }}
                                >
                                  {artwork ? (
                                    <img
                                      src={
                                        artwork
                                      }
                                      alt=""
                                      style={{
                                        width:
                                          "100%",
                                        height:
                                          "100%",
                                        objectFit:
                                          "cover",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        display:
                                          "grid",
                                        width:
                                          "100%",
                                        height:
                                          "100%",
                                        placeItems:
                                          "center",
                                      }}
                                    >
                                      ♪
                                    </div>
                                  )}

                                  <span
                                    style={{
                                      position:
                                        "absolute",
                                      right: 2,
                                      bottom: 2,
                                      padding:
                                        "2px 4px",
                                      background:
                                        "rgba(2, 6, 23, 0.85)",
                                      borderRadius:
                                        "4px",
                                      fontSize:
                                        "10px",
                                      fontWeight:
                                        900,
                                    }}
                                  >
                                    #
                                    {
                                      originalIndex
                                    }
                                  </span>
                                </div>

                                <div
                                  style={{
                                    minWidth:
                                      0,
                                  }}
                                >
                                  <strong
                                    style={{
                                      display:
                                        "block",
                                      overflow:
                                        "hidden",
                                      textOverflow:
                                        "ellipsis",
                                      whiteSpace:
                                        "nowrap",
                                    }}
                                  >
                                    {
                                      track.name
                                    }
                                  </strong>

                                  <p
                                    style={{
                                      margin:
                                        "4px 0 0",
                                      overflow:
                                        "hidden",
                                      color:
                                        "#94a3b8",
                                      fontSize:
                                        "13px",
                                      textOverflow:
                                        "ellipsis",
                                      whiteSpace:
                                        "nowrap",
                                    }}
                                  >
                                    {track.artists
                                      ?.map(
                                        (
                                          artist
                                        ) =>
                                          artist.name
                                      )
                                      .join(
                                        ", "
                                      ) ||
                                      "Unknown artist"}
                                  </p>
                                </div>
                              </article>
                            );
                          }
                        )
                    )}
                  </div>
                </section>
              </aside>
            </section>

            <style jsx>{`
              @media (max-width: 900px) {
                section {
                  grid-template-columns: 1fr !important;
                }

                aside {
                  grid-template-columns: 1fr !important;
                }
              }

              @media (max-width: 700px) {
                main {
                  padding: 18px !important;
                }

                section > div {
                  grid-template-columns: 1fr !important;
                }

                button {
                  min-height: 48px;
                }
              }
            `}</style>
          </>
        )}
      </div>
    </main>
  );
}