"use client";

import QRCode from "react-qr-code";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useGameRoster,
} from "@/hooks/useGameRoster";

type Track = {
  id: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
};

type CallerState = {
  sessionId: string;
  playlistName: string;
  currentTrack: Track | null;
  currentIndex: number;
  totalTracks: number;
  playedCount: number;
  recentTracks?: Track[];
  clipLength: number;
  secondsRemaining: number;
  isPlaying: boolean;
  isRevealed: boolean;
  status: "ready" | "playing" | "paused" | "complete";
};

/*
 * BTTB_CALLER_FIXED_THREE_COLUMN_V1
 *
 * Fixed display layout:
 * LEFT   = game code + QR
 * CENTER = current song
 * RIGHT  = last 5 played songs
 *
 * The center column is physically centered because the left and
 * right side columns use the same width.
 */
type GameSessionSnapshot = {
  sessionId: string;
  currentIndex: number;
  tracks: Track[];
  joinCode?: string;
};

const CALLER_STATE_KEY =
  "bttb-v2-caller-state";

const GAME_SESSION_KEY =
  "bttb-v2-game-session";

const CHANNEL_NAME =
  "bttb-v2-game-sync";

function readCallerState():
  CallerState | null {
  try {
    const saved =
      localStorage.getItem(
        CALLER_STATE_KEY
      );

    return saved
      ? (JSON.parse(saved) as CallerState)
      : null;
  } catch {
    return null;
  }
}

function readGameSession():
  GameSessionSnapshot | null {
  try {
    const saved =
      localStorage.getItem(
        GAME_SESSION_KEY
      );

    return saved
      ? (JSON.parse(
          saved
        ) as GameSessionSnapshot)
      : null;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(
  value: string
) {
  return value.replace(/\/+$/, "");
}

export default function CallerPage() {
  const [state, setState] =
    useState<CallerState | null>(
      null
    );

  const [
    gameSession,
    setGameSession,
  ] =
    useState<GameSessionSnapshot | null>(
      null
    );

  const [
    browserOrigin,
    setBrowserOrigin,
  ] = useState("");

  const [
    headerHeight,
    setHeaderHeight,
  ] = useState(0);

  /*
   * BTTB_CALLER_PLAYER_ROSTER_V1
   * Reuse the same live player roster source as the DJ Console.
   */
  const {
    roster,
    loading: rosterLoading,
    error: rosterError,
  } = useGameRoster(
    state?.sessionId,
    70,
    5000
  );

  useEffect(() => {
    setState(
      readCallerState()
    );

    setGameSession(
      readGameSession()
    );

    setBrowserOrigin(
      window.location.origin
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
        setState(
          event.data
        );

        setGameSession(
          readGameSession()
        );
      };
    } catch {
      channel = null;
    }

    function handleStorage(
      event: StorageEvent
    ) {
      if (
        event.key ===
          CALLER_STATE_KEY &&
        event.newValue
      ) {
        try {
          setState(
            JSON.parse(
              event.newValue
            ) as CallerState
          );
        } catch {
          // Ignore malformed state.
        }
      }

      if (
        event.key ===
          GAME_SESSION_KEY &&
        event.newValue
      ) {
        try {
          setGameSession(
            JSON.parse(
              event.newValue
            ) as GameSessionSnapshot
          );
        } catch {
          // Ignore malformed state.
        }
      }
    }

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      channel?.close();

      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, []);

  /*
   * Measure the shared site header and lock the Caller to exactly
   * the remaining viewport height. Also disable document scrolling
   * while this display page is mounted.
   */
  useEffect(() => {
    const previousHtmlOverflow =
      document.documentElement
        .style.overflow;

    const previousBodyOverflow =
      document.body.style.overflow;

    document.documentElement
      .style.overflow = "hidden";

    document.body.style.overflow =
      "hidden";

    const updateHeaderHeight =
      () => {
        const header =
          document.querySelector(
            "header"
          );

        if (!header) {
          setHeaderHeight(0);
          return;
        }

        const rect =
          header.getBoundingClientRect();

        setHeaderHeight(
          Math.max(
            0,
            Math.ceil(rect.bottom)
          )
        );
      };

    updateHeaderHeight();

    window.addEventListener(
      "resize",
      updateHeaderHeight
    );

    const header =
      document.querySelector(
        "header"
      );

    const observer =
      header &&
      typeof ResizeObserver !==
        "undefined"
        ? new ResizeObserver(
            updateHeaderHeight
          )
        : null;

    if (
      header &&
      observer
    ) {
      observer.observe(
        header
      );
    }

    return () => {
      window.removeEventListener(
        "resize",
        updateHeaderHeight
      );

      observer?.disconnect();

      document.documentElement
        .style.overflow =
          previousHtmlOverflow;

      document.body.style.overflow =
        previousBodyOverflow;
    };
  }, []);

  const joinCode =
    (
      gameSession?.joinCode ??
      ""
    )
      .trim()
      .toUpperCase();

  const joinUrl =
    useMemo(() => {
      if (
        !joinCode ||
        !browserOrigin
      ) {
        return "";
      }

      const configuredUrl =
        process.env
          .NEXT_PUBLIC_APP_URL
          ?.trim();

      const origin =
        configuredUrl
          ? normalizeBaseUrl(
              configuredUrl
            )
          : normalizeBaseUrl(
              browserOrigin
            );

      return (
        `${origin}/join?code=` +
        encodeURIComponent(
          joinCode
        )
      );
    }, [
      browserOrigin,
      joinCode,
    ]);

  const callerHeight =
    headerHeight > 0
      ? `calc(100dvh - ${headerHeight}px)`
      : "100dvh";

  if (
    !state ||
    !state.currentTrack
  ) {
    return (
      <main
        style={{
          height:
            callerHeight,
          maxHeight:
            callerHeight,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          boxSizing:
            "border-box",
          padding:
            "clamp(16px, 3vh, 36px)",
          background:
            "radial-gradient(circle at top, #312e81, #020617 65%)",
          color: "white",
          textAlign:
            "center",
        }}
      >
        <section>
          <p
            style={{
              margin: 0,
              color:
                "#c4b5fd",
              fontWeight: 900,
              letterSpacing:
                "0.16em",
              textTransform:
                "uppercase",
            }}
          >
            Bingo to the Beats
          </p>

          <h1
            style={{
              margin:
                "14px 0 0",
              fontSize:
                "clamp(38px, 7vh, 72px)",
            }}
          >
            Waiting for the Host
          </h1>

          <p
            style={{
              margin:
                "12px 0 0",
              color:
                "#cbd5e1",
              fontSize:
                "clamp(16px, 2.4vh, 22px)",
            }}
          >
            The current song will
            appear here when the
            game begins.
          </p>
        </section>
      </main>
    );
  }

  const track =
    state.currentTrack;

  /*
   * History comes from the real shuffled queue.
   * Hidden current song: show tracks before it.
   * Revealed current song: include it immediately.
   */
  const historyEndIndex =
    state.isRevealed
      ? state.currentIndex + 1
      : state.currentIndex;

  const recentTracks =
    gameSession &&
    gameSession.sessionId ===
      state.sessionId
      ? gameSession.tracks
          .slice(
            0,
            Math.min(
              historyEndIndex,
              gameSession
                .tracks.length
            )
          )
          .reverse()
          .slice(0, 5)
      : state.recentTracks ??
        [];

  const visiblePlayers =
    roster.players.slice(0, 10);

  const hiddenPlayerCount =
    Math.max(
      0,
      roster.players.length -
        visiblePlayers.length
    );

  const progress =
    state.clipLength > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (
              state
                .secondsRemaining /
              state.clipLength
            ) * 100
          )
        )
      : 0;

  return (
    <main
      style={{
        height:
          callerHeight,
        maxHeight:
          callerHeight,
        minHeight: 0,
        overflow: "hidden",
        boxSizing:
          "border-box",
        padding:
          "clamp(10px, 1.6vh, 18px)",
        background:
          "radial-gradient(circle at top, #4c1d95 0%, #111827 46%, #020617 100%)",
        color: "white",
        textAlign:
          "center",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <section
        style={{
          width:
            "min(100%, 1500px)",
          height: "100%",
          minHeight: 0,
          margin:
            "0 auto",
          display: "grid",
          /* BTTB_CALLER_EQUAL_SIDE_WIDTHS_V1 */
          gridTemplateColumns:
            "clamp(220px, 18vw, 290px) minmax(0, 1fr) clamp(220px, 18vw, 290px)",
          gridTemplateRows:
            "minmax(0, 1fr)",
          gap:
            "clamp(12px, 1.6vw, 24px)",
          alignItems:
            "stretch",
          overflow: "hidden",
        }}
      >
        {/* LEFT — JOIN THIS GAME */}
        <aside
          style={{
            width: "100%",
            minWidth: 0,
            minHeight: 0,
            boxSizing: "border-box",
            display: "flex",
            flexDirection:
              "column",
            alignItems:
              "stretch",
            justifyContent:
              "flex-start",
            gap:
              "clamp(8px, 1.2vh, 12px)",
            overflow: "hidden",
          }}
        >
          <section
            style={{
              width: "100%",
              boxSizing:
                "border-box",
              padding:
                "clamp(12px, 1.7vh, 18px)",
              border:
                "1px solid rgba(148, 163, 184, 0.28)",
              borderRadius:
                "20px",
              background:
                "rgba(15, 23, 42, 0.82)",
            }}
          >
            <p
              style={{
                margin: 0,
                color:
                  "#c4b5fd",
                fontSize:
                  "clamp(10px, 1.35vh, 13px)",
                fontWeight: 900,
                letterSpacing:
                  "0.14em",
                textTransform:
                  "uppercase",
              }}
            >
              Join This Game
            </p>

            {joinCode ? (
              <>
                <div
                  style={{
                    marginTop:
                      "clamp(8px, 1.2vh, 12px)",
                    padding:
                      "clamp(8px, 1.2vh, 12px)",
                    border:
                      "1px solid rgba(167, 139, 250, 0.38)",
                    borderRadius:
                      "14px",
                    background:
                      "rgba(124, 58, 237, 0.15)",
                  }}
                >
                  <span
                    style={{
                      display:
                        "block",
                      color:
                        "#cbd5e1",
                      fontSize:
                        "10px",
                      fontWeight:
                        900,
                      letterSpacing:
                        "0.12em",
                      textTransform:
                        "uppercase",
                    }}
                  >
                    Game Code
                  </span>

                  <strong
                    style={{
                      display:
                        "block",
                      marginTop:
                        "5px",
                      fontSize:
                        "clamp(24px, 3.4vh, 36px)",
                      letterSpacing:
                        "0.14em",
                    }}
                  >
                    {joinCode}
                  </strong>
                </div>

                {joinUrl && (
                  <div
                    style={{
                      width:
                        "fit-content",
                      margin:
                        "clamp(8px, 1.3vh, 14px) auto 0",
                      padding:
                        "7px",
                      borderRadius:
                        "12px",
                      background:
                        "#ffffff",
                    }}
                  >
                    <QRCode
                      value={
                        joinUrl
                      }
                      size={116}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#020617"
                      style={{
                        display:
                          "block",
                        width:
                          "min(13vh, 116px)",
                        height:
                          "min(13vh, 116px)",
                      }}
                    />
                  </div>
                )}

                <p
                  style={{
                    margin:
                      "8px 0 0",
                    color:
                      "#cbd5e1",
                    fontSize:
                      "clamp(10px, 1.35vh, 13px)",
                    lineHeight: 1.35,
                  }}
                >
                  Scan to join
                  or enter the
                  game code.
                </p>
              </>
            ) : (
              <p
                style={{
                  margin:
                    "12px 0 0",
                  color:
                    "#94a3b8",
                  fontSize:
                    "13px",
                }}
              >
                Waiting for
                game code.
              </p>
            )}
          </section>

          {/* BTTB_CALLER_PLAYER_ROSTER_V1 */}
          <section
            style={{
              width: "100%",
              minHeight: 0,
              flex: "1 1 auto",
              boxSizing:
                "border-box",
              padding:
                "clamp(10px, 1.35vh, 14px)",
              border:
                "1px solid rgba(148, 163, 184, 0.28)",
              borderRadius:
                "20px",
              background:
                "rgba(15, 23, 42, 0.82)",
              textAlign:
                "left",
              overflow:
                "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap: "8px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color:
                    "#c4b5fd",
                  fontSize:
                    "clamp(10px, 1.3vh, 12px)",
                  fontWeight:
                    900,
                  letterSpacing:
                    "0.12em",
                  textTransform:
                    "uppercase",
                }}
              >
                Players in Game
              </p>

              <strong
                style={{
                  flex:
                    "0 0 auto",
                  color:
                    "#ffffff",
                  fontSize:
                    "clamp(12px, 1.7vh, 16px)",
                }}
              >
                {
                  roster.totals
                    .totalPlayers
                }
              </strong>
            </div>

            <p
              style={{
                margin:
                  "4px 0 0",
                color:
                  "#94a3b8",
                fontSize:
                  "clamp(9px, 1.15vh, 11px)",
              }}
            >
              {
                roster.totals
                  .connectedPlayers
              }{" "}
              currently connected
            </p>

            {rosterLoading &&
            roster.players.length ===
              0 ? (
              <p
                style={{
                  margin:
                    "10px 0 0",
                  color:
                    "#94a3b8",
                  fontSize:
                    "11px",
                  textAlign:
                    "center",
                }}
              >
                Loading players...
              </p>
            ) : rosterError &&
              roster.players.length ===
                0 ? (
              <p
                style={{
                  margin:
                    "10px 0 0",
                  color:
                    "#fca5a5",
                  fontSize:
                    "10px",
                  lineHeight:
                    1.35,
                  textAlign:
                    "center",
                }}
              >
                Player list is
                temporarily unavailable.
              </p>
            ) : visiblePlayers.length ===
              0 ? (
              <p
                style={{
                  margin:
                    "10px 0 0",
                  color:
                    "#94a3b8",
                  fontSize:
                    "11px",
                  textAlign:
                    "center",
                }}
              >
                Waiting for players
                to join.
              </p>
            ) : (
              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "1fr",
                  gap:
                    "clamp(3px, .55vh, 5px)",
                  marginTop:
                    "clamp(6px, .8vh, 9px)",
                }}
              >
                {visiblePlayers.map(
                  (player) => (
                    <div
                      key={
                        player.playerId
                      }
                      style={{
                        minWidth:
                          0,
                        display:
                          "grid",
                        gridTemplateColumns:
                          "10px minmax(0, 1fr) auto",
                        alignItems:
                          "center",
                        gap:
                          "6px",
                        padding:
                          "clamp(4px, .55vh, 6px) 6px",
                        border:
                          "1px solid rgba(51, 65, 85, .78)",
                        borderRadius:
                          "9px",
                        background:
                          "rgba(2, 6, 23, .58)",
                      }}
                    >
                      <span
                        aria-label={
                          player.connected
                            ? "Connected"
                            : "Not connected"
                        }
                        title={
                          player.connected
                            ? "Connected"
                            : "Not connected"
                        }
                        style={{
                          width:
                            "7px",
                          height:
                            "7px",
                          borderRadius:
                            "999px",
                          background:
                            player.connected
                              ? "#a3e635"
                              : "#64748b",
                          boxShadow:
                            player.connected
                              ? "0 0 8px rgba(163, 230, 53, .65)"
                              : "none",
                        }}
                      />

                      <strong
                        title={
                          player.playerName
                        }
                        style={{
                          minWidth:
                            0,
                          overflow:
                            "hidden",
                          textOverflow:
                            "ellipsis",
                          whiteSpace:
                            "nowrap",
                          fontSize:
                            "clamp(10px, 1.35vh, 13px)",
                        }}
                      >
                        {
                          player.playerName
                        }
                      </strong>

                      <span
                        style={{
                          color:
                            "#94a3b8",
                          fontSize:
                            "clamp(9px, 1.1vh, 10px)",
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {
                          player.cardQuantity
                        }{" "}
                        {
                          player.cardQuantity ===
                          1
                            ? "card"
                            : "cards"
                        }
                      </span>
                    </div>
                  )
                )}

                {hiddenPlayerCount >
                  0 && (
                  <p
                    style={{
                      margin:
                        "2px 0 0",
                      color:
                        "#c4b5fd",
                      fontSize:
                        "10px",
                      fontWeight:
                        800,
                      textAlign:
                        "center",
                    }}
                  >
                    +{" "}
                    {
                      hiddenPlayerCount
                    }{" "}
                    more players
                  </p>
                )}
              </div>
            )}
          </section>
        </aside>

        {/* CENTER — CURRENT SONG */}
        <section
          style={{
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection:
              "column",
            alignItems:
              "center",
            justifyContent:
              "center",
            overflow: "hidden",
            padding:
              "0 clamp(4px, 1vw, 14px)",
          }}
        >
          <p
            style={{
              margin: 0,
              color:
                "#c4b5fd",
              fontSize:
                "clamp(11px, 1.6vh, 15px)",
              fontWeight: 900,
              letterSpacing:
                "0.15em",
              textTransform:
                "uppercase",
            }}
          >
            {state.isRevealed
              ? "Song Revealed"
              : state.isPlaying
                ? "Listen and Mark Your Card"
                : "Current Song"}
          </p>

          <p
            style={{
              margin:
                "clamp(5px, .8vh, 9px) 0 0",
              color:
                "#94a3b8",
              fontSize:
                "clamp(12px, 1.7vh, 16px)",
            }}
          >
            {state.playlistName}
            {" · Song "}
            {state.currentIndex +
              1}
            {" of "}
            {state.totalTracks}
          </p>

          {state.isRevealed ? (
            track.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.image}
                alt=""
                style={{
                  width:
                    "min(29vh, 300px)",
                  height:
                    "min(29vh, 300px)",
                  marginTop:
                    "clamp(7px, 1vh, 12px)",
                  borderRadius:
                    "22px",
                  objectFit:
                    "cover",
                  boxShadow:
                    "0 22px 60px rgba(0,0,0,.42)",
                }}
              />
            ) : (
              <div
                style={{
                  width:
                    "min(29vh, 300px)",
                  height:
                    "min(29vh, 300px)",
                  display:
                    "grid",
                  placeItems:
                    "center",
                  marginTop:
                    "clamp(7px, 1vh, 12px)",
                  borderRadius:
                    "22px",
                  background:
                    "rgba(167,139,250,.18)",
                  fontSize:
                    "clamp(64px, 12vh, 120px)",
                }}
              >
                ♫
              </div>
            )
          ) : (
            <div
              style={{
                width:
                  "min(29vh, 300px)",
                height:
                  "min(29vh, 300px)",
                display: "grid",
                placeItems:
                  "center",
                marginTop:
                  "clamp(7px, 1vh, 12px)",
                borderRadius:
                  "22px",
                background:
                  "linear-gradient(145deg, rgba(167,139,250,.24), rgba(15,23,42,.92))",
                border:
                  "1px solid rgba(196,181,253,.4)",
                fontSize:
                  "clamp(64px, 12vh, 120px)",
                boxShadow:
                  "0 22px 60px rgba(0,0,0,.35)",
              }}
            >
              ?
            </div>
          )}

          <h1
            style={{
              maxWidth:
                "100%",
              margin:
                "clamp(7px, 1.1vh, 12px) 0 0",
              overflow:
                "hidden",
              textOverflow:
                "ellipsis",
              whiteSpace:
                "nowrap",
              fontSize:
                "clamp(30px, 5vh, 58px)",
              lineHeight: 1,
            }}
          >
            {state.isRevealed
              ? track.name
              : "SONG HIDDEN"}
          </h1>

          <p
            style={{
              maxWidth:
                "100%",
              margin:
                "clamp(5px, .8vh, 9px) 0 0",
              overflow:
                "hidden",
              color:
                "#e2e8f0",
              textOverflow:
                "ellipsis",
              whiteSpace:
                "nowrap",
              fontSize:
                "clamp(16px, 2.4vh, 27px)",
            }}
          >
            {state.isRevealed
              ? track.artist
              : "Listen carefully and mark your bingo card"}
          </p>

          {state.isRevealed &&
            track.album && (
              <p
                style={{
                  maxWidth:
                    "100%",
                  margin:
                    "4px 0 0",
                  overflow:
                    "hidden",
                  color:
                    "#94a3b8",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                  fontSize:
                    "clamp(11px, 1.5vh, 15px)",
                }}
              >
                {track.album}
              </p>
            )}

          <div
            style={{
              width: "100%",
              height: "8px",
              marginTop:
                "clamp(7px, 1vh, 12px)",
              overflow:
                "hidden",
              borderRadius:
                "999px",
              background:
                "#334155",
            }}
          >
            <div
              style={{
                width:
                  `${progress}%`,
                height: "100%",
                background:
                  state.isRevealed
                    ? "#c4b5fd"
                    : "#a3e635",
                transition:
                  "width 1s linear",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent:
                "center",
              alignItems:
                "baseline",
              gap: "7px",
              marginTop:
                "clamp(5px, .8vh, 9px)",
            }}
          >
            <strong
              style={{
                fontSize:
                  "clamp(28px, 4.5vh, 48px)",
              }}
            >
              {
                state.secondsRemaining
              }
            </strong>

            <span
              style={{
                color:
                  "#94a3b8",
                fontSize:
                  "clamp(12px, 1.6vh, 16px)",
              }}
            >
              seconds
            </span>
          </div>

          <p
            style={{
              margin:
                "3px 0 0",
              color:
                "#94a3b8",
              fontSize:
                "clamp(11px, 1.45vh, 14px)",
            }}
          >
            {state.status ===
            "complete"
              ? "Game playlist complete"
              : state.isRevealed
                ? "Check your card — the next song is coming"
                : state.isPlaying
                  ? "Listen and mark your bingo card"
                  : "Paused by host"}
          </p>
        </section>

        {/* RIGHT — LAST 5 PLAYED */}
        <aside
          style={{
            width: "100%",
            minWidth: 0,
            minHeight: 0,
            boxSizing: "border-box",
            display: "flex",
            alignItems:
              "flex-start",
            overflow: "hidden",
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "100%",
              boxSizing:
                "border-box",
              padding:
                "clamp(11px, 1.5vh, 16px)",
              border:
                "1px solid rgba(148, 163, 184, 0.28)",
              borderRadius:
                "20px",
              background:
                "rgba(15, 23, 42, 0.82)",
              textAlign:
                "left",
              overflow:
                "hidden",
            }}
          >
            <p
              style={{
                margin: 0,
                color:
                  "#c4b5fd",
                fontSize:
                  "clamp(10px, 1.35vh, 13px)",
                fontWeight: 900,
                letterSpacing:
                  "0.14em",
                textTransform:
                  "uppercase",
              }}
            >
              Last 5 Played Songs
            </p>

            {recentTracks.length ===
            0 ? (
              <p
                style={{
                  margin:
                    "12px 0 0",
                  color:
                    "#94a3b8",
                  fontSize:
                    "13px",
                  textAlign:
                    "center",
                }}
              >
                Played songs
                will appear
                here.
              </p>
            ) : (
              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "1fr",
                  gap:
                    "clamp(5px, .8vh, 8px)",
                  marginTop:
                    "clamp(7px, 1vh, 10px)",
                }}
              >
                {recentTracks.map(
                  (
                    playedTrack,
                    index
                  ) => (
                    <article
                      key={`${playedTrack.id}-${index}`}
                      style={{
                        minWidth:
                          0,
                        padding:
                          "clamp(7px, .9vh, 10px)",
                        border:
                          "1px solid #334155",
                        borderRadius:
                          "12px",
                        background:
                          "rgba(2, 6, 23, 0.72)",
                      }}
                    >
                      <span
                        style={{
                          color:
                            "#a78bfa",
                          fontSize:
                            "10px",
                          fontWeight:
                            900,
                        }}
                      >
                        #
                        {Math.max(
                          1,
                          historyEndIndex -
                            index
                        )}
                      </span>

                      <strong
                        style={{
                          display:
                            "block",
                          marginTop:
                            "3px",
                          overflow:
                            "hidden",
                          textOverflow:
                            "ellipsis",
                          whiteSpace:
                            "nowrap",
                          fontSize:
                            "clamp(12px, 1.55vh, 15px)",
                        }}
                      >
                        {
                          playedTrack.name
                        }
                      </strong>

                      <span
                        style={{
                          display:
                            "block",
                          marginTop:
                            "2px",
                          overflow:
                            "hidden",
                          color:
                            "#94a3b8",
                          textOverflow:
                            "ellipsis",
                          whiteSpace:
                            "nowrap",
                          fontSize:
                            "clamp(10px, 1.3vh, 12px)",
                        }}
                      >
                        {
                          playedTrack.artist
                        }
                      </span>
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}
