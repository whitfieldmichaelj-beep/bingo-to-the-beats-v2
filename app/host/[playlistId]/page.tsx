"use client";

import Link from "next/link";
import Script from "next/script";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useState } from "react";

type MusicSource = "spotify" | "apple";

type SessionMusicSource =
  | MusicSource
  | "serato";

type DisplayTrack = {
  id: string;
  gameTrackId?: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  uri?: string;
};

type GameDetails = {
  gameName?: string;
  venue?: string;
  venueName?: string;
  hostName?: string;
  eventDate?: string;
  eventTime?: string;
  primaryColor?: string;
  winningPattern?: string;
};

type GameSession = {
  version: 2;
  sessionId: string;
  joinCode: string;
  source: SessionMusicSource;
  playlistId: string;
  playlistName: string;
  clipLength: number;
  cardCount: number;
  createdAt: string;
  currentIndex: number;
  status:
    | "ready"
    | "playing"
    | "paused"
    | "complete";
  tracks: DisplayTrack[];
  playedTrackIds: string[];

  gameName?: string;
  venueName?: string;
  hostName?: string;
  eventDate?: string;
  eventTime?: string;
  primaryColor?: string;
  winningPattern?: string;
};

type CallerState = {
  sessionId: string;
  playlistName: string;
  currentTrack: DisplayTrack | null;
  currentIndex: number;
  totalTracks: number;
  playedCount: number;
  clipLength: number;
  secondsRemaining: number;
  isPlaying: boolean;
  isRevealed: boolean;
  status: GameSession["status"];
};

type SpotifyImage = {
  url?: string;
};

type SpotifyArtist = {
  name?: string;
};

type SpotifyTrack = {
  id?: string;
  uri?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: {
    name?: string;
    images?: SpotifyImage[];
  };
};

type SpotifyPlaylistItem = {
  track?: SpotifyTrack | null;
  item?: SpotifyTrack | null;
};

type SpotifyTracksResponse = {
  items?: SpotifyPlaylistItem[];
  error?: string;
};

type AppleArtwork = {
  url?: string;
};

type AppleTrackAttributes = {
  name?: string;
  artistName?: string;
  albumName?: string;
  artwork?: AppleArtwork;
  playParams?: {
    id?: string;
  };
};

type AppleTrack = {
  id?: string;
  type?: string;
  attributes?: AppleTrackAttributes;
};

type AppleApiBody = {
  data?: AppleTrack[];
  errors?: Array<{
    title?: string;
    detail?: string;
    status?: string;
    code?: string;
  }>;
  next?: string;
};

type MusicKitApiResponse = {
  data?: AppleApiBody | AppleTrack[];
  errors?: AppleApiBody["errors"];
};

const GAME_SESSION_KEY =
  "bttb-v2-game-session";

const CALLER_STATE_KEY =
  "bttb-v2-caller-state";

const ACTIVITY_KEY =
  "bttb-v2-dj-activity";

const CHANNEL_NAME =
  "bttb-v2-game-sync";

function formatAppleArtworkUrl(
  artwork?: AppleArtwork,
  width = 300,
  height = 300
): string | null {
  if (!artwork?.url) {
    return null;
  }

  return artwork.url
    .replace("{w}", String(width))
    .replace("{h}", String(height));
}

function extractAppleTracks(
  response: MusicKitApiResponse
): AppleTrack[] {
  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (
    response.data &&
    !Array.isArray(response.data) &&
    Array.isArray(response.data.data)
  ) {
    return response.data.data;
  }

  return [];
}

function extractAppleErrors(
  response: MusicKitApiResponse
): NonNullable<AppleApiBody["errors"]> {
  if (Array.isArray(response.errors)) {
    return response.errors;
  }

  if (
    response.data &&
    !Array.isArray(response.data) &&
    Array.isArray(response.data.errors)
  ) {
    return response.data.errors;
  }

  return [];
}

function readSessionStorageJson<T>(
  key: string
): T | null {
  try {
    const value =
      sessionStorage.getItem(key);

    return value
      ? (JSON.parse(value) as T)
      : null;
  } catch {
    return null;
  }
}



function shuffleTracks(
  tracks: DisplayTrack[]
): DisplayTrack[] {
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


// BTTB_APPLE_HOST_LOADING_HANG_FIX_V1
async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string
): Promise<T> {
  let timeoutId:
    | ReturnType<typeof setTimeout>
    | undefined;

  const timeoutPromise =
    new Promise<never>(
      (_resolve, reject) => {
        timeoutId = setTimeout(
          () => {
            reject(
              new Error(message)
            );
          },
          milliseconds
        );
      }
    );

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export default function HostPlaylistPage() {
  const params =
    useParams<{ playlistId: string }>();

  const router = useRouter();
  const searchParams = useSearchParams();

  const playlistId = params.playlistId;

  const playlistName =
    searchParams.get("name") ||
    "Selected Playlist";

  const source: MusicSource =
    searchParams.get("source") === "apple"
      ? "apple"
      : "spotify";

  const [appleScriptReady, setAppleScriptReady] =
    useState(source !== "apple");


  useEffect(() => {
    if (
      source === "apple" &&
      typeof window !== "undefined" &&
      window.MusicKit
    ) {
      setAppleScriptReady(true);
    }
  }, [source]);

const [tracks, setTracks] = useState<
    DisplayTrack[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [creatingGame, setCreatingGame] =
    useState(false);

  const [message, setMessage] = useState(
    "Loading playlist songs..."
  );

  const [clipLength, setClipLength] =
    useState(() => {
      const requested =
        Number(
          searchParams.get(
            "clipLength"
          )
        );

      return String(
        [15, 20, 30, 45, 60]
          .includes(requested)
          ? requested
          : 30
      );
    });

  const [cardCount, setCardCount] =
    useState(() => {
      const requested =
        Number(
          searchParams.get(
            "cardCount"
          )
        );

      return String(
        Number.isFinite(
          requested
        ) &&
        requested > 0
          ? Math.min(
              500,
              Math.max(
                1,
                Math.floor(
                  requested
                )
              )
            )
          : 25
      );
    });

  useEffect(() => {
    if (
      source === "apple" &&
      !appleScriptReady
    ) {
      return;
    }

    let cancelled = false;

    async function loadSpotifyTracks(): Promise<
      DisplayTrack[]
    > {
      const response = await fetch(
        `/api/spotify/playlists/${encodeURIComponent(
          playlistId
        )}/tracks`,
        {
          cache: "no-store",
        }
      );

      const data =
        (await response.json()) as SpotifyTracksResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to load Spotify songs."
        );
      }

      const items = Array.isArray(data.items)
        ? data.items
        : [];

      const result: DisplayTrack[] = [];

      for (const entry of items) {
        const track =
          entry.item ??
          entry.track ??
          null;

        if (
          !track?.name ||
          (!track.id && !track.uri)
        ) {
          continue;
        }

        result.push({
          id:
            track.id ??
            track.uri ??
            crypto.randomUUID(),
          uri: track.uri,
          name: track.name,
          artist: (track.artists ?? [])
            .map((artist) => artist.name)
            .filter(
              (name): name is string =>
                Boolean(name)
            )
            .join(", "),
          album: track.album?.name ?? "",
          image:
            track.album?.images?.[0]?.url ??
            null,
        });
      }

      return result;
    }

    async function loadAppleTracks(): Promise<
      DisplayTrack[]
    > {
      const tokenResponse = await fetch(
        "/api/apple-music/token",
        {
          method: "GET",
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
            "Unable to prepare Apple Music."
        );
      }

      const musicKit = window.MusicKit;

      if (!musicKit) {
        throw new Error(
          "The Apple Music library did not load correctly."
        );
      }

      await musicKit.configure({
        developerToken:
          tokenData.developerToken,
        app: {
          name: "Bingo to the Beats",
          build: "2.0.0",
        },
      });

      const music =
        musicKit.getInstance();

      if (!music.isAuthorized) {
        throw new Error(
          "Apple Music is not connected. Return to Apple Music and connect your account again."
        );
      }

      const response =
        (await music.api.music(
          `/v1/me/library/playlists/${encodeURIComponent(
            playlistId
          )}/tracks`,
          {
            limit: 100,
          }
        )) as MusicKitApiResponse;

      const errors =
        extractAppleErrors(response);

      if (errors.length > 0) {
        const firstError = errors[0];

        throw new Error(
          firstError.detail ||
            firstError.title ||
            "Unable to load Apple Music songs."
        );
      }

      const appleTracks =
        extractAppleTracks(response);

      const result: DisplayTrack[] = [];

      for (const track of appleTracks) {
        const attributes =
          track.attributes;

        const name =
          attributes?.name?.trim();

        if (!name) {
          continue;
        }

        result.push({
          id:
            track.id ??
            attributes?.playParams?.id ??
            crypto.randomUUID(),
          name,
          artist:
            attributes?.artistName ?? "",
          album:
            attributes?.albumName ?? "",
          image: formatAppleArtworkUrl(
            attributes?.artwork
          ),
        });
      }

      return result;
    }

    async function loadTracks() {
      try {
        setLoading(true);

        setMessage(
          source === "apple"
            ? "Loading Apple Music songs..."
            : "Loading Spotify songs..."
        );

        const loadedTracks =
          source === "apple"
            ? await withTimeout(
                loadAppleTracks(),
                25_000,
                "Apple Music took too long to load this playlist. Return to Apple Music, reconnect, and try again."
              )
            : await loadSpotifyTracks();

        if (cancelled) {
          return;
        }

        setTracks(loadedTracks);

        setMessage(
          loadedTracks.length > 0
            ? `${loadedTracks.length} song${
                loadedTracks.length === 1
                  ? ""
                  : "s"
              } loaded from ${
                source === "apple"
                  ? "Apple Music"
                  : "Spotify"
              }.`
            : `No songs were found in this ${
                source === "apple"
                  ? "Apple Music"
                  : "Spotify"
              } playlist.`
        );
      } catch (error) {
        console.error(
          `${source} playlist tracks error:`,
          error
        );

        if (!cancelled) {
          setTracks([]);

          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load songs."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTracks();

    return () => {
      cancelled = true;
    };
  }, [
    appleScriptReady,
    playlistId,
    source,
  ]);

    // BTTB_STREAMING_GAME_PERSISTENCE_V1
  async function createGameSession() {
    if (tracks.length === 0) {
      setMessage(
        "The playlist must contain songs before a game can be created."
      );
      return;
    }

    try {
      setCreatingGame(true);

      const safeClipLength =
        Math.min(
          300,
          Math.max(
            5,
            Number(clipLength) ||
              20
          )
        );

      const safeCardCount =
        Math.min(
          500,
          Math.max(
            1,
            Number(cardCount) ||
              25
          )
        );

      const savedDetails =
        readSessionStorageJson<GameDetails>(
          "bttb-game-details"
        ) ?? {};

      const savedWinningPattern =
        searchParams.get(
          "winningPattern"
        ) ??
        sessionStorage.getItem(
          "bttbWinningPattern"
        ) ??
        savedDetails.winningPattern ??
        "any-line";

      const providerName =
        source === "apple"
          ? "Apple Music"
          : "Spotify";

      setMessage(
        `Creating ${providerName} game and generating ${safeCardCount} bingo card${
          safeCardCount === 1
            ? ""
            : "s"
        }...`
      );

      const response =
        await fetch(
          "/api/game/create-streaming",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                source,
                playlistId,
                playlistName,
                cardCount:
                  safeCardCount,
                bingoPattern:
                  savedWinningPattern,
                tracks,
              }),
          }
        );

      const data =
        (await response.json()) as {
          ok?: boolean;
          message?: string;
          error?: string;
          game?: {
            id: string;
            joinCode: string;
            playlistId: string;
            playlistName: string;
            cards?: unknown[];
            tracks: Array<{
              id: string;
              gameTrackId?: string;
              title?: string;
              artist?: string;
              album?: string;
            }>;
          };
        };

      if (
        !response.ok ||
        !data.ok ||
        !data.game
      ) {
        throw new Error(
          data.error ||
            data.message ||
            "Unable to create the game."
        );
      }

      const createdGame =
        data.game;

      const originalTrackById =
        new Map(
          tracks.map(
            (track) => [
              track.id,
              track,
            ]
          )
        );

      const persistedTracks =
        createdGame.tracks.map(
          (track) => {
            const original =
              originalTrackById.get(
                track.id
              );

            return {
              ...(original ?? {
                id: track.id,
                name:
                  track.title ||
                  "Unknown Song",
                artist:
                  track.artist ||
                  "Unknown Artist",
                album:
                  track.album ||
                  "",
                image: null,
              }),
              id: track.id,
              gameTrackId:
                track.gameTrackId,
              name:
                track.title ||
                original?.name ||
                "Unknown Song",
              artist:
                track.artist ||
                original?.artist ||
                "Unknown Artist",
              album:
                track.album ||
                original?.album ||
                "",
              image:
                original?.image ??
                null,
            } satisfies DisplayTrack;
          }
        );

      const shouldShuffle =
        searchParams.get(
          "shuffle"
        ) !== "0";

      const gameTracks =
        shouldShuffle
          ? shuffleTracks(
              persistedTracks
            )
          : persistedTracks;

      const session: GameSession = {
        version: 2,
        sessionId:
          createdGame.id,
        joinCode:
          createdGame.joinCode,
        source,
        playlistId,
        playlistName,
        clipLength:
          safeClipLength,
        cardCount:
          safeCardCount,
        createdAt:
          new Date().toISOString(),
        currentIndex: 0,
        status: "ready",
        tracks:
          gameTracks,
        playedTrackIds: [],

        gameName:
          savedDetails.gameName ||
          playlistName,

        venueName:
          savedDetails.venueName ||
          savedDetails.venue ||
          "",

        hostName:
          savedDetails.hostName ||
          "",

        eventDate:
          savedDetails.eventDate ||
          "",

        eventTime:
          savedDetails.eventTime ||
          "",

        primaryColor:
          savedDetails.primaryColor ||
          "#00519a",

        winningPattern:
          savedWinningPattern,
      };

      const callerState:
        CallerState = {
          sessionId:
            createdGame.id,
          playlistName,
          currentTrack:
            gameTracks[0] ??
            null,
          currentIndex: 0,
          totalTracks:
            gameTracks.length,
          playedCount: 0,
          clipLength:
            safeClipLength,
          secondsRemaining:
            safeClipLength,
          isPlaying: false,
          isRevealed: false,
          status: "ready",
        };

      localStorage.setItem(
        GAME_SESSION_KEY,
        JSON.stringify(
          session
        )
      );

      localStorage.setItem(
        CALLER_STATE_KEY,
        JSON.stringify(
          callerState
        )
      );

      localStorage.removeItem(
        ACTIVITY_KEY
      );

      setMessage(
        `Game created. Join code: ${createdGame.joinCode}`
      );

      router.push(
        "/dj-console"
      );
    } catch (error) {
      console.error(
        "Streaming game creation error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create the game."
      );
    } finally {
      setCreatingGame(false);
    }
  }

  const providerName =
    source === "apple"
      ? "Apple Music"
      : "Spotify";

  const providerAccent =
    source === "apple"
      ? "#fa2d48"
      : "#1ed760";

  const backHref =
    source === "apple"
      ? "/music/apple"
      : "/spotify";

  const buttonDisabled =
    loading ||
    creatingGame ||
    tracks.length === 0;

  return (
    <>
      {source === "apple" && (
        <Script
          src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"
          onReady={() => {
            setAppleScriptReady(true);
          }}
          strategy="afterInteractive"
          onLoad={() => {
            setAppleScriptReady(true);
          }}
          onError={() => {
            setLoading(false);

            setMessage(
              "The Apple Music connection library could not be loaded."
            );
          }}
        />
      )}

      <main
        style={{
          minHeight: "100vh",
          padding: "40px",
          background: "#0f172a",
          color: "white",
          fontFamily:
            "Arial, sans-serif",
        }}
      >
        <Link
          href={backHref}
          style={{
            color: "#93c5fd",
            textDecoration: "none",
          }}
        >
          ← Choose Another {providerName}{" "}
          Playlist
        </Link>

        <p
          style={{
            marginTop: "28px",
            color: providerAccent,
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          {providerName} Host Setup
        </p>

        <h1
          style={{
            marginTop: "8px",
            fontSize: "42px",
          }}
        >
          {playlistName}
        </h1>

        <p
          style={{
            marginTop: "12px",
            color: "#cbd5e1",
          }}
        >
          {loading
            ? `Loading ${providerName}...`
            : message}
        </p>

        <section
          style={{
            marginTop: "32px",
            padding: "24px",
            background: "#1e293b",
            borderRadius: "16px",
            maxWidth: "700px",
          }}
        >
          <h2 style={{ fontSize: "24px" }}>
            Game Settings
          </h2>

          <label
            htmlFor="clipLength"
            style={{
              display: "block",
              marginTop: "24px",
              fontWeight: 700,
            }}
          >
            Clip length
          </label>

          <select
            id="clipLength"
            value={clipLength}
            disabled={creatingGame}
            onChange={(event) =>
              setClipLength(
                event.target.value
              )
            }
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "12px",
              borderRadius: "8px",
              color: "#111827",
            }}
          >
            <option value="15">
              15 seconds
            </option>

            <option value="20">
              20 seconds
            </option>

            <option value="30">
              30 seconds
            </option>

            <option value="45">
              45 seconds
            </option>

            <option value="60">
              60 seconds
            </option>
          </select>

          <label
            htmlFor="cardCount"
            style={{
              display: "block",
              marginTop: "20px",
              fontWeight: 700,
            }}
          >
            Number of bingo cards
          </label>

          <input
            id="cardCount"
            type="number"
            min="1"
            max="500"
            value={cardCount}
            disabled={creatingGame}
            onChange={(event) =>
              setCardCount(
                event.target.value
              )
            }
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "12px",
              borderRadius: "8px",
              color: "#111827",
            }}
          />

          <button
            type="button"
            disabled={buttonDisabled}
            onClick={createGameSession}
            style={{
              width: "100%",
              marginTop: "24px",
              padding: "15px",
              border: 0,
              borderRadius: "10px",
              background:
                !buttonDisabled
                  ? providerAccent
                  : "#64748b",
              color:
                source === "apple"
                  ? "white"
                  : "#052e16",
              fontSize: "17px",
              fontWeight: 800,
              cursor:
                !buttonDisabled
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            {creatingGame
              ? "Creating Game..."
              : "Create Game and Open DJ Console"}
          </button>

          <p
            style={{
              marginTop: "14px",
              color: "#94a3b8",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            This creates a new game
            session, shuffles the playlist,
            initializes the caller, and
            opens the DJ Console.
          </p>
        </section>

        <section
          style={{
            marginTop: "40px",
            maxWidth: "900px",
          }}
        >
          <h2 style={{ fontSize: "26px" }}>
            Playlist Songs
          </h2>

          {!loading &&
            tracks.length === 0 && (
              <p
                style={{
                  marginTop: "18px",
                  color: "#fda4af",
                }}
              >
                {message}
              </p>
            )}

          <div style={{ marginTop: "18px" }}>
            {tracks
              .slice(0, 100)
              .map((track, index) => (
                <div
                  key={`${track.id}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "12px 0",
                    borderBottom:
                      "1px solid #334155",
                  }}
                >
                  <span
                    style={{
                      width: "28px",
                      flexShrink: 0,
                      color: "#94a3b8",
                    }}
                  >
                    {index + 1}
                  </span>

                  {track.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={track.image}
                      alt=""
                      style={{
                        width: "50px",
                        height: "50px",
                        flexShrink: 0,
                        objectFit: "cover",
                        borderRadius: "6px",
                      }}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: "50px",
                        height: "50px",
                        flexShrink: 0,
                        display: "grid",
                        placeItems:
                          "center",
                        borderRadius: "6px",
                        background: "#334155",
                        color:
                          providerAccent,
                        fontSize: "22px",
                      }}
                    >
                      ♪
                    </div>
                  )}

                  <div>
                    <strong>
                      {track.name}
                    </strong>

                    <p
                      style={{
                        marginTop: "4px",
                        color: "#94a3b8",
                      }}
                    >
                      {[
                        track.artist,
                        track.album,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </main>
    </>
  );
}
