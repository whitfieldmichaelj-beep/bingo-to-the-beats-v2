"use client";

// BTTB_APPLE_DIRECT_CREATE_NO_HOST_PAGE_V2


// BTTB_APPLE_MATCH_SERATO_LIST_V1

// BTTB_APPLE_PLAYLIST_FULL_HEIGHT_V1

import Link from "next/link";
import Script from "next/script";
import AppleDirectCreateButton from "@/components/apple/AppleDirectCreateButton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AppleArtwork = { url?: string };
type ApplePlaylist = {
  id: string;
  attributes?: {
    name?: string;
    description?: { standard?: string; short?: string };
    artwork?: AppleArtwork;
  };
};
// BTTB_APPLE_GAME_ADVISOR_V1
type AppleAdvisorTrack = {
  id?: string;
  attributes?: {
    name?: string;
    artistName?: string;
  };
};

type AppleAdvisorBody = {
  data?: AppleAdvisorTrack[];
  next?: string;
  errors?: Array<{
    title?: string;
    detail?: string;
  }>;
};

type AppleApiBody = {
  data?: ApplePlaylist[];
  errors?: Array<{ title?: string; detail?: string }>;
};
type MusicKitApiResponse = {
  data?: AppleApiBody | ApplePlaylist[];
  errors?: AppleApiBody["errors"];
};
/*
 * BTTB_MUSICKIT_EXISTING_TYPES_V2
 *
 * The project already declares window.MusicKit in types/musickit.d.ts.
 * Reuse that declaration instead of redeclaring Window.MusicKit here.
 */
type MusicKitInstance = ReturnType<
  NonNullable<Window["MusicKit"]>["getInstance"]
>;

// BTTB_APPLE_SERATO_GAME_SETTINGS_V5
type WinningPattern =
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "x-pattern"
  | "blackout";

type StoredGameDetails = {
  players?: number;
  billing?: string;
  winningPattern?: WinningPattern;
  gameName?: string;
  venueName?: string;
  venue?: string;
  eventDate?: string;
  eventTime?: string;
  hostName?: string;
  primaryColor?: string;
};

type AppleGameSettings = {
  cardCount: number;
  clipLength: number;
  shuffle: boolean;
  winningPattern: WinningPattern;
};

const APPLE_GAME_SETTINGS_KEY =
  "bttb-apple-game-settings";

const APPLE_GAME_DETAILS_KEY =
  "bttb-game-details";

const WINNING_PATTERNS: Array<{
  value: WinningPattern;
  label: string;
}> = [
  {
    value: "any-line",
    label: "Any 5 in a Row",
  },
  {
    value: "across",
    label: "Across Only",
  },
  {
    value: "down",
    label: "Down Only",
  },
  {
    value: "diagonal",
    label: "Diagonal Only",
  },
  {
    value: "x-pattern",
    label: "X Pattern",
  },
  {
    value: "blackout",
    label: "Blackout",
  },
];

function isWinningPattern(
  value: unknown
): value is WinningPattern {
  return WINNING_PATTERNS.some(
    (pattern) =>
      pattern.value === value
  );
}

type Status =
  | "loading"
  | "ready"
  | "connecting"
  | "loading-playlists"
  | "connected"
  | "error";

export default function AppleMusicPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Preparing Apple Music...");
  const [playlists, setPlaylists] = useState<ApplePlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [search, setSearch] = useState("");
  const [advisorTrackCount, setAdvisorTrackCount] =
    useState<number | null>(null);
  const [advisorLoading, setAdvisorLoading] =
    useState(false);
  const [advisorError, setAdvisorError] =
    useState("");
  const [cardCount, setCardCount] =
    useState(25);
  const [clipLength, setClipLength] =
    useState(30);
  const [shuffle, setShuffle] =
    useState(true);
  const [winningPattern, setWinningPattern] =
    useState<WinningPattern>(
      "any-line"
    );
  const [gameDetails, setGameDetails] =
    useState<StoredGameDetails | null>(
      null
    );
  const [scriptReady, setScriptReady] = useState(false);
  const configuredRef = useRef(false);

  const extractPlaylists = useCallback((response: MusicKitApiResponse) => {
    if (Array.isArray(response.data)) return response.data;
    if (
      response.data &&
      !Array.isArray(response.data) &&
      Array.isArray(response.data.data)
    ) {
      return response.data.data;
    }
    return [];
  }, []);

  const extractError = useCallback((response: MusicKitApiResponse) => {
    const errors = Array.isArray(response.errors)
      ? response.errors
      : response.data && !Array.isArray(response.data)
        ? response.data.errors
        : undefined;
    return errors?.[0]?.detail || errors?.[0]?.title || "";
  }, []);

  const loadPlaylists = useCallback(
    async (music: MusicKitInstance) => {
      setStatus("loading-playlists");
      setMessage("Loading your Apple Music playlists...");

      const response =
        (await music.api.music(
          "/v1/me/library/playlists",
          { limit: 100 }
        )) as unknown as MusicKitApiResponse;

      const apiError = extractError(response);
      if (apiError) throw new Error(apiError);

      const items = extractPlaylists(response);
      setPlaylists(items);
      setStatus("connected");
      setMessage(
        items.length
          ? `${items.length} Apple Music playlist${items.length === 1 ? "" : "s"} loaded.`
          : "Apple Music is connected, but no library playlists were returned."
      );
    },
    [extractError, extractPlaylists]
  );

  const configure = useCallback(async () => {
    if (!window.MusicKit || configuredRef.current) return;

    try {
      setStatus("loading");
      setMessage("Preparing Apple Music...");

      const response = await fetch("/api/apple-music/token", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        developerToken?: string;
        error?: string;
      };

      if (!response.ok || !data.developerToken) {
        throw new Error(data.error || "Apple Music setup is incomplete.");
      }

      await window.MusicKit.configure({
        developerToken: data.developerToken,
        app: { name: "Bingo to the Beats", build: "2.0.0" },
      });

      const music = window.MusicKit.getInstance();
      configuredRef.current = true;

      if (music.isAuthorized || music.musicUserToken) {
        await loadPlaylists(music);
      } else {
        setStatus("ready");
        setMessage("Apple Music is ready. Connect your account to view your playlists.");
      }
    } catch (error) {
      console.error("Apple Music setup error:", error);
      configuredRef.current = false;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to prepare Apple Music.");
    }
  }, [loadPlaylists]);

  useEffect(() => {
    if (scriptReady) void configure();
  }, [configure, scriptReady]);

  async function connect() {
    const musicKit = window.MusicKit;
    if (!musicKit || !configuredRef.current) {
      setStatus("error");
      setMessage("Apple Music is not ready. Retry the connection.");
      return;
    }

    try {
      setStatus("connecting");
      setMessage("Waiting for Apple Music authorization...");
      const music = musicKit.getInstance();
      const token = music.musicUserToken || (await music.authorize());
      if (!token) throw new Error("Apple Music authorization was not completed.");
      await loadPlaylists(music);
    } catch (error) {
      console.error("Apple Music authorization error:", error);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to authorize Apple Music.");
    }
  }

  async function disconnect() {
    try {
      await window.MusicKit?.getInstance().unauthorize();
      setPlaylists([]);
      setStatus("ready");
      setMessage("Apple Music is ready. Connect your account to view your playlists.");
    } catch {
      setStatus("error");
      setMessage("Unable to disconnect Apple Music.");
    }
  }

  function retry() {
    configuredRef.current = false;
    setStatus("loading");
    setMessage("Retrying Apple Music...");
    void configure();
  }

  // BTTB_APPLE_SERATO_WORKSPACE_UI_V2
  const selectedPlaylist = useMemo(
    () =>
      playlists.find(
        (playlist) =>
          playlist.id === selectedPlaylistId
      ) ?? null,
    [
      playlists,
      selectedPlaylistId,
    ]
  );

  const gameAdvisor = useMemo(() => {
    const minimumTrackCount = 25;
    const idealTrackCount = 75;
    const requestedTrackCount = 80;

    const availableTrackCount =
      advisorTrackCount ?? 0;

    const selectedTrackCount =
      Math.min(
        requestedTrackCount,
        availableTrackCount
      );

    let readiness:
      | "ready"
      | "warning"
      | "blocked" =
      "ready";

    const issues: string[] = [];
    const recommendations:
      string[] = [];

    if (
      advisorTrackCount !== null &&
      availableTrackCount <
        minimumTrackCount
    ) {
      readiness = "blocked";

      issues.push(
        `${availableTrackCount} playable songs are available. At least ${minimumTrackCount} are required.`
      );

      recommendations.push(
        `Add ${
          minimumTrackCount -
          availableTrackCount
        } more song${
          minimumTrackCount -
            availableTrackCount ===
          1
            ? ""
            : "s"
        } before creating the game.`
      );
    } else if (
      advisorTrackCount !== null &&
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
        } more song${
          idealTrackCount -
            availableTrackCount ===
          1
            ? ""
            : "s"
        } for better card variety.`
      );
    } else if (
      advisorTrackCount !== null
    ) {
      recommendations.push(
        "This Apple Music playlist is ready to create a game."
      );
    }

    return {
      readiness,
      availableTrackCount,
      selectedTrackCount,
      minimumTrackCount,
      idealTrackCount,
      issues,
      recommendations,
    };
  }, [
    advisorTrackCount,
  ]);

  const filteredPlaylists = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    if (!normalizedSearch) {
      return playlists;
    }

    return playlists.filter(
      (playlist) =>
        (
          playlist.attributes?.name ||
          "Untitled Playlist"
        )
          .toLowerCase()
          .includes(
            normalizedSearch
          )
    );
  }, [
    playlists,
    search,
  ]);

  useEffect(() => {
    if (
      playlists.length === 0
    ) {
      setSelectedPlaylistId("");
      return;
    }

    setSelectedPlaylistId(
      (current) =>
        current &&
        playlists.some(
          (playlist) =>
            playlist.id === current
        )
          ? current
          : playlists[0].id
    );
  }, [playlists]);

  useEffect(() => {
    try {
      const rawDetails =
        sessionStorage.getItem(
          APPLE_GAME_DETAILS_KEY
        );

      if (rawDetails) {
        const parsed =
          JSON.parse(
            rawDetails
          ) as StoredGameDetails;

        setGameDetails(
          parsed
        );

        if (
          typeof parsed.players ===
            "number" &&
          parsed.players > 0
        ) {
          setCardCount(
            Math.min(
              500,
              Math.max(
                1,
                Math.floor(
                  parsed.players
                )
              )
            )
          );
        }

        if (
          isWinningPattern(
            parsed.winningPattern
          )
        ) {
          setWinningPattern(
            parsed.winningPattern
          );
        }
      }

      const rawSettings =
        sessionStorage.getItem(
          APPLE_GAME_SETTINGS_KEY
        );

      if (rawSettings) {
        const parsed =
          JSON.parse(
            rawSettings
          ) as Partial<AppleGameSettings>;

        if (
          typeof parsed.cardCount ===
            "number" &&
          parsed.cardCount > 0
        ) {
          setCardCount(
            Math.min(
              500,
              Math.max(
                1,
                Math.floor(
                  parsed.cardCount
                )
              )
            )
          );
        }

        if (
          typeof parsed.clipLength ===
            "number" &&
          [15, 20, 30, 45, 60]
            .includes(
              parsed.clipLength
            )
        ) {
          setClipLength(
            parsed.clipLength
          );
        }

        if (
          typeof parsed.shuffle ===
            "boolean"
        ) {
          setShuffle(
            parsed.shuffle
          );
        }

        if (
          isWinningPattern(
            parsed.winningPattern
          )
        ) {
          setWinningPattern(
            parsed.winningPattern
          );
        }
      }
    } catch {
      // Keep the Serato-equivalent defaults.
    }
  }, []);

  useEffect(() => {
    try {
      const settings:
        AppleGameSettings = {
          cardCount,
          clipLength,
          shuffle,
          winningPattern,
        };

      sessionStorage.setItem(
        APPLE_GAME_SETTINGS_KEY,
        JSON.stringify(
          settings
        )
      );

      sessionStorage.setItem(
        "bttbWinningPattern",
        winningPattern
      );

      sessionStorage.setItem(
        APPLE_GAME_DETAILS_KEY,
        JSON.stringify({
          ...(gameDetails ?? {}),
          players:
            cardCount,
          winningPattern,
        })
      );
    } catch {
      // Browser storage is optional for the UI.
    }
  }, [
    cardCount,
    clipLength,
    shuffle,
    winningPattern,
    gameDetails,
  ]);

useEffect(() => {
    if (
      status !== "connected" ||
      !selectedPlaylistId
    ) {
      setAdvisorTrackCount(
        null
      );
      setAdvisorError("");
      return;
    }

    let cancelled = false;

    async function loadAdvisor() {
      setAdvisorLoading(true);
      setAdvisorError("");
      setAdvisorTrackCount(
        null
      );

      try {
        const music =
          window.MusicKit?.getInstance();

        if (!music) {
          throw new Error(
            "Apple Music is not ready."
          );
        }

        let nextPath:
          | string
          | undefined =
          `/v1/me/library/playlists/${encodeURIComponent(
            selectedPlaylistId
          )}/tracks`;

        let total = 0;
        const seenPaths =
          new Set<string>();

        while (
          nextPath &&
          !seenPaths.has(
            nextPath
          )
        ) {
          seenPaths.add(
            nextPath
          );

          const response =
            (await music.api.music(
              nextPath,
              {
                limit: 100,
              }
            )) as unknown as {
              data?:
                | AppleAdvisorBody
                | AppleAdvisorTrack[];
              errors?:
                AppleAdvisorBody["errors"];
            };

          const body:
            AppleAdvisorBody =
            Array.isArray(
              response.data
            )
              ? {
                  data:
                    response.data,
                }
              : response.data &&
                  !Array.isArray(
                    response.data
                  )
                ? response.data
                : {
                    data: [],
                    errors:
                      response.errors,
                  };

          const errors =
            Array.isArray(
              response.errors
            )
              ? response.errors
              : body.errors ?? [];

          if (
            errors.length > 0
          ) {
            const first =
              errors[0];

            throw new Error(
              first?.detail ||
                first?.title ||
                "Unable to review this Apple Music playlist."
            );
          }

          total +=
            Array.isArray(
              body.data
            )
              ? body.data.length
              : 0;

          nextPath =
            typeof body.next ===
              "string" &&
            body.next.trim()
              ? body.next
              : undefined;
        }

        if (!cancelled) {
          setAdvisorTrackCount(
            total
          );
        }
      } catch (error) {
        if (!cancelled) {
          setAdvisorTrackCount(
            null
          );

          setAdvisorError(
            error instanceof Error
              ? error.message
              : "Unable to review this Apple Music playlist."
          );
        }
      } finally {
        if (!cancelled) {
          setAdvisorLoading(
            false
          );
        }
      }
    }

    void loadAdvisor();

    return () => {
      cancelled = true;
    };
  }, [
    selectedPlaylistId,
    status,
  ]);

  async function refreshPlaylists() {
    const music =
      window.MusicKit?.getInstance();

    if (!music) {
      setMessage(
        "Apple Music is not ready."
      );
      return;
    }

    try {
      await loadPlaylists(
        music
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to refresh Apple Music playlists."
      );
    }
  }

  const artworkUrl = (url?: string) =>
    url ? url.replace("{w}", "600").replace("{h}", "600") : "";

  return (
    <>
      <Script
        id="apple-musickit-v3"
        src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"
        strategy="afterInteractive"
        onReady={() =>
          setScriptReady(true)
        }
        onLoad={() =>
          setScriptReady(true)
        }
        onError={() => {
          setStatus("error");
          setMessage(
            "The Apple Music connection library could not be loaded."
          );
        }}
      />

      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#24205f_0%,_#0f172a_42%,_#020617_100%)] text-white">
        <header className="flex min-h-[78px] flex-wrap items-center justify-between gap-[18px] border-b border-slate-400/20 bg-slate-950/90 px-6 py-[15px] backdrop-blur-xl">
          <div className="flex items-center gap-[14px]">
            <div className="grid h-12 w-12 place-items-center rounded-[15px] bg-gradient-to-br from-blue-600 to-purple-600 text-[23px] shadow-[0_12px_30px_rgba(124,58,237,0.3)]">
              ♫
            </div>

            <div>
              <p className="m-0 text-[11px] font-black uppercase tracking-[0.15em] text-violet-400">
                Bingo to the Beats
              </p>
              <h1 className="mt-[3px] text-[22px] font-bold">
                Apple Music Workspace
              </h1>
            </div>
          </div>

          <nav className="flex flex-wrap gap-[9px]">
            <Link
              href="/music"
              className="rounded-[11px] border border-slate-700 px-[14px] py-[10px] text-[13px] font-extrabold text-slate-200 no-underline"
            >
              Music Sources
            </Link>

            <Link
              href="/dashboard"
              className="rounded-[11px] border border-slate-700 px-[14px] py-[10px] text-[13px] font-extrabold text-slate-200 no-underline"
            >
              Dashboard
            </Link>

            <Link
              href="/dj-console"
              className="rounded-[11px] border border-slate-700 px-[14px] py-[10px] text-[13px] font-extrabold text-slate-200 no-underline"
            >
              DJ Console
            </Link>
          </nav>
        </header>

        <section className="relative z-[1] mx-auto w-[min(calc(100%-32px),1280px)] max-w-[1280px] px-4 pb-20 pt-[34px] sm:px-0">
          <section className="flex flex-wrap items-end justify-between gap-7 rounded-[26px] border border-violet-300/20 bg-gradient-to-br from-indigo-950/95 to-slate-900/90 p-[34px] shadow-[0_28px_70px_rgba(0,0,0,0.32)]">
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.15em] text-violet-300">
                Apple Music Integration
              </p>

              <h2 className="mt-[10px] max-w-[700px] text-[clamp(35px,5vw,58px)] font-black leading-none tracking-[-0.04em]">
                Build a game from your Apple Music playlists
              </h2>

              <p className="mt-[18px] max-w-[680px] text-[17px] leading-[1.7] text-slate-300">
                Choose a playlist, prepare the game, and launch
                directly into the same Bingo to the Beats workflow
                used by Serato.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-[10px] max-sm:w-full max-sm:grid-cols-1">
              <div className="min-w-[115px] rounded-2xl border border-slate-700 bg-slate-950/60 p-[17px] text-center">
                <strong className="block text-[23px]">
                  {status ===
                  "loading-playlists"
                    ? "—"
                    : playlists.length}
                </strong>
                <span className="mt-[5px] block text-[11px] font-extrabold uppercase text-slate-400">
                  Playlists
                </span>
              </div>

              <div className="min-w-[115px] rounded-2xl border border-slate-700 bg-slate-950/60 p-[17px] text-center">
                <strong className="block text-[23px]">
                  Apple
                </strong>
                <span className="mt-[5px] block text-[11px] font-extrabold uppercase text-slate-400">
                  Music Source
                </span>
              </div>

              <div className="min-w-[115px] rounded-2xl border border-slate-700 bg-slate-950/60 p-[17px] text-center">
                <strong
                  className={`block text-[23px] ${
                    status === "error"
                      ? "text-rose-300"
                      : status ===
                          "connected"
                        ? "text-lime-300"
                        : "text-violet-300"
                  }`}
                >
                  {status === "error"
                    ? "Issue"
                    : status ===
                        "connected"
                      ? "Ready"
                      : "Connect"}
                </strong>

                <span className="mt-[5px] block text-[11px] font-extrabold uppercase text-slate-400">
                  Library Status
                </span>
              </div>
            </div>
          </section>

          <section className="mt-[22px] grid grid-cols-[minmax(0,1.55fr)_minmax(330px,0.75fr)] gap-[22px] max-[900px]:grid-cols-1 items-stretch min-w-0">
            <section className="flex min-h-[680px] min-w-0 self-stretch flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/95 p-[26px] [contain:size]">
              <div className="flex items-center justify-between gap-[15px]">
                <div>
                  <p className="m-0 text-[11px] font-black uppercase tracking-[0.13em] text-violet-400">
                    Apple Music Library
                  </p>
                  <h2 className="mt-[6px] text-[27px] font-bold">
                    Choose a Playlist
                  </h2>
                </div>

                {status ===
                  "connected" && (
                  <button
                    type="button"
                    onClick={() =>
                      void refreshPlaylists()
                    }
                    className="rounded-[10px] border border-slate-600 bg-slate-900 px-[13px] py-[9px] font-extrabold text-white"
                  >
                    Refresh
                  </button>
                )}
              </div>

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search Apple Music playlists..."
                disabled={
                  status !==
                  "connected"
                }
                className="mt-[22px] w-full rounded-[14px] border border-slate-600 bg-slate-950 px-[17px] py-[15px] text-[15px] text-white outline-none disabled:opacity-50"
              />

              <div className="mt-4 grid min-h-0 min-w-0 flex-1 auto-rows-max content-start gap-[10px] overflow-y-auto overflow-x-hidden overscroll-x-none pr-[5px] [scrollbar-gutter:stable]">
                {status ===
                "loading-playlists" ? (
                  <div className="rounded-2xl border border-dashed border-slate-600 px-[18px] py-[50px] text-center text-slate-400">
                    Reading Apple Music playlists...
                  </div>
                ) : status !==
                  "connected" ? (
                  <div className="rounded-2xl border border-dashed border-slate-600 px-[18px] py-[50px] text-center text-slate-400">
                    Connect Apple Music to view your playlists.
                  </div>
                ) : filteredPlaylists
                    .length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-600 px-[18px] py-[50px] text-center text-slate-400">
                    No matching playlists were found.
                  </div>
                ) : (
                  filteredPlaylists.map(
                    (playlist) => {
                      const selected =
                        playlist.id ===
                        selectedPlaylistId;

                      const name =
                        playlist
                          .attributes
                          ?.name ||
                        "Untitled Playlist";

                      const description =
                        playlist
                          .attributes
                          ?.description
                          ?.short ||
                        playlist
                          .attributes
                          ?.description
                          ?.standard ||
                        "Apple Music playlist";

                      const art =
                        artworkUrl(
                          playlist
                            .attributes
                            ?.artwork
                            ?.url
                        );

                      return (
                        <button
                          key={
                            playlist.id
                          }
                          type="button"
                          onClick={() => {
                            setSelectedPlaylistId(
                              playlist.id
                            );

                            setMessage(
                              `${name} selected.`
                            );
                          }}
                          className={`flex h-auto min-h-[72px] w-full min-w-0 max-w-full box-border items-center gap-[14px] overflow-hidden rounded-[15px] border p-[15px] text-left text-white transition ${
                            selected
                              ? "border-violet-400 bg-gradient-to-br from-violet-700/30 to-blue-600/20 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
                              : "border-slate-700 bg-slate-950/70"
                          }`}
                        >
                          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center overflow-hidden rounded-xl bg-indigo-500/20 text-lg text-violet-300">
                            {art ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={art}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              "♫"
                            )}
                          </span>

                          <span className="flex min-w-0 flex-1 self-stretch flex-col justify-center overflow-visible">
                            <strong className="block whitespace-normal break-words text-[15px] leading-[1.3] [overflow-wrap:anywhere]">
                              {name}
                            </strong>

                            <small className="mt-[5px] block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-[1.3] text-slate-400">
                              {description}
                            </small>
                          </span>

                          <span
                            className={`h-[10px] w-[10px] shrink-0 rounded-full ${
                              selected
                                ? "bg-lime-400"
                                : "bg-slate-600"
                            }`}
                          />
                        </button>
                      );
                    }
                  )
                )}
              </div>
            </section>

            <aside className="sticky top-[18px] self-start rounded-3xl border border-slate-700 bg-slate-900/95 p-[26px] max-[900px]:static">
              <p className="m-0 text-[11px] font-black uppercase tracking-[0.13em] text-violet-400">
                Game Builder
              </p>

              <h2 className="mt-[6px] text-[27px] font-bold">
                Game Settings
              </h2>

              <div className="mt-5 rounded-2xl border border-violet-300/30 bg-violet-700/10 p-[18px]">
                <span className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Selected playlist
                </span>

                <strong className="mt-[7px] block text-[18px]">
                  {selectedPlaylist
                    ?.attributes
                    ?.name ||
                    "No playlist selected"}
                </strong>

                <small className="mt-[6px] block leading-[1.5] text-slate-400">
                  {selectedPlaylist
                    ? "Ready for game settings"
                    : "Choose a playlist from the library"}
                </small>
              </div>

              {gameDetails?.gameName && (
                <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-[18px]">
                  <span className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Event
                  </span>

                  <strong className="mt-[7px] block text-[18px]">
                    {gameDetails.gameName}
                  </strong>

                  <small className="mt-[6px] block leading-[1.5] text-slate-400">
                    {[
                      gameDetails.venueName ??
                        gameDetails.venue,
                      gameDetails.hostName,
                    ]
                      .filter(Boolean)
                      .join(" • ") ||
                      "Event setup is ready"}
                  </small>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <label className="block text-[13px] font-extrabold text-slate-200">
                  Bingo cards

                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={cardCount}
                    onChange={(event) =>
                      setCardCount(
                        Math.max(
                          1,
                          Math.min(
                            500,
                            Number(
                              event.target.value
                            ) || 1
                          )
                        )
                      )
                    }
                    className="mt-[9px] w-full rounded-xl border border-slate-600 bg-slate-950 px-[14px] py-[13px] text-[15px] text-white outline-none"
                  />
                </label>

                <label className="block text-[13px] font-extrabold text-slate-200">
                  Clip length

                  <select
                    value={clipLength}
                    onChange={(event) =>
                      setClipLength(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="mt-[9px] w-full rounded-xl border border-slate-600 bg-slate-950 px-[14px] py-[13px] text-[15px] text-white outline-none"
                  >
                    <option value={15}>
                      15 seconds
                    </option>
                    <option value={20}>
                      20 seconds
                    </option>
                    <option value={30}>
                      30 seconds
                    </option>
                    <option value={45}>
                      45 seconds
                    </option>
                    <option value={60}>
                      60 seconds
                    </option>
                  </select>
                </label>
              </div>

              <label className="mt-[18px] block text-[13px] font-extrabold text-slate-200">
                Winning pattern

                <select
                  value={winningPattern}
                  onChange={(event) =>
                    setWinningPattern(
                      event.target
                        .value as WinningPattern
                    )
                  }
                  className="mt-[9px] w-full rounded-xl border border-slate-600 bg-slate-950 px-[14px] py-[13px] text-[15px] text-white outline-none"
                >
                  {WINNING_PATTERNS.map(
                    (pattern) => (
                      <option
                        key={
                          pattern.value
                        }
                        value={
                          pattern.value
                        }
                      >
                        {pattern.label}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="mt-5 flex items-center justify-between gap-[18px] rounded-[15px] border border-slate-700 bg-slate-950/60 p-[17px]">
                <span>
                  <strong className="block text-[15px]">
                    Shuffle playlist
                  </strong>

                  <small className="mt-1 block text-slate-400">
                    Randomize the song
                    order before opening
                    the DJ Console.
                  </small>
                </span>

                <input
                  type="checkbox"
                  checked={shuffle}
                  onChange={(event) =>
                    setShuffle(
                      event.target.checked
                    )
                  }
                  className="h-[22px] w-[22px] accent-violet-500"
                />
              </label>

              <section className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-[18px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="block text-[11px] font-black uppercase tracking-[0.1em] text-violet-400">
                      Game Advisor
                    </span>

                    <strong className="mt-[7px] block text-[18px]">
                      {advisorLoading
                        ? "Reviewing Playlist..."
                        : advisorError
                          ? "Unable to Review"
                          : advisorTrackCount ===
                              null
                            ? "Choose a Playlist"
                            : gameAdvisor.readiness ===
                                "ready"
                              ? "Ready to Create"
                              : gameAdvisor.readiness ===
                                  "warning"
                                ? "Review Recommended"
                                : "More Songs Required"}
                    </strong>
                  </div>

                  {!advisorLoading &&
                    !advisorError &&
                    advisorTrackCount !==
                      null && (
                      <span
                        className={`rounded-full px-3 py-[6px] text-[10px] font-black uppercase tracking-[0.1em] ${
                          gameAdvisor.readiness ===
                          "ready"
                            ? "bg-lime-400/15 text-lime-300"
                            : gameAdvisor.readiness ===
                                "warning"
                              ? "bg-amber-400/15 text-amber-300"
                              : "bg-rose-400/15 text-rose-300"
                        }`}
                      >
                        {gameAdvisor.readiness}
                      </span>
                    )}
                </div>

                {advisorLoading ? (
                  <p className="mt-3 text-[13px] leading-[1.6] text-slate-400">
                    Checking the selected Apple Music playlist for game readiness.
                  </p>
                ) : advisorError ? (
                  <p className="mt-3 text-[13px] leading-[1.6] text-rose-300">
                    {advisorError}
                  </p>
                ) : advisorTrackCount ===
                  null ? (
                  <p className="mt-3 text-[13px] leading-[1.6] text-slate-400">
                    Select an Apple Music playlist to check whether it has enough songs for a game.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                          Available Songs
                        </span>
                        <strong className="mt-1 block text-xl">
                          {gameAdvisor.availableTrackCount.toLocaleString(
                            "en-US"
                          )}
                        </strong>
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                          Selected Songs
                        </span>
                        <strong className="mt-1 block text-xl">
                          {gameAdvisor.selectedTrackCount.toLocaleString(
                            "en-US"
                          )}
                        </strong>
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                          Minimum Required
                        </span>
                        <strong className="mt-1 block text-xl">
                          {gameAdvisor.minimumTrackCount}
                        </strong>
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                          Recommended
                        </span>
                        <strong className="mt-1 block text-xl">
                          {gameAdvisor.idealTrackCount}
                        </strong>
                      </div>
                    </div>

                    {gameAdvisor.issues.length >
                      0 && (
                      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
                        <strong className="text-[12px] text-amber-200">
                          Items to Review
                        </strong>

                        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-[1.55] text-slate-300">
                          {gameAdvisor.issues.map(
                            (issue) => (
                              <li
                                key={
                                  issue
                                }
                              >
                                {issue}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4">
                      <strong className="text-[12px] text-slate-200">
                        Recommendations
                      </strong>

                      <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-[1.55] text-slate-400">
                        {gameAdvisor.recommendations.map(
                          (
                            recommendation
                          ) => (
                            <li
                              key={
                                recommendation
                              }
                            >
                              {recommendation}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </>
                )}
              </section>

              <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-[18px]">
                <span className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Apple Music
                </span>

                <strong
                  className={`mt-[7px] block text-[18px] ${
                    status === "error"
                      ? "text-rose-300"
                      : status ===
                          "connected"
                        ? "text-lime-300"
                        : "text-white"
                  }`}
                >
                  {status ===
                    "connected"
                    ? "Connected"
                    : status ===
                        "error"
                      ? "Connection issue"
                      : "Not connected"}
                </strong>

                <small className="mt-[6px] block leading-[1.5] text-slate-400">
                  {message}
                </small>
              </div>

              {status ===
                "error" ? (
                <button
                  type="button"
                  onClick={retry}
                  className="mt-[22px] w-full rounded-full bg-gradient-to-r from-[#FA2D48] to-purple-600 p-4 text-[15px] font-black text-white"
                >
                  Retry Apple Music
                </button>
              ) : status !==
                "connected" ? (
                <button
                  type="button"
                  onClick={() =>
                    void connect()
                  }
                  disabled={
                    status !==
                    "ready"
                  }
                  className="mt-[22px] w-full rounded-full bg-gradient-to-r from-[#FA2D48] to-purple-600 p-4 text-[15px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === "loading"
                    ? "Preparing Apple Music..."
                    : status ===
                        "connecting"
                      ? "Authorizing..."
                      : status ===
                          "loading-playlists"
                        ? "Loading Playlists..."
                        : "Connect Apple Music"}
                </button>
              ) : (
                <>
                  {selectedPlaylist &&
                  !(
                    advisorTrackCount !== null &&
                    gameAdvisor.readiness === "blocked"
                  ) ? (
                    <AppleDirectCreateButton
                      playlistId={
                        selectedPlaylist.id
                      }
                      playlistName={
                        selectedPlaylist
                          .attributes
                          ?.name ||
                        "Untitled Playlist"
                      }
                      cardCount={
                        cardCount
                      }
                      clipLength={
                        clipLength
                      }
                      winningPattern={
                        winningPattern
                      }
                      shuffle={
                        shuffle
                      }
                      gameName={
                        gameDetails
                          ?.gameName
                      }
                      venueName={
                        gameDetails
                          ?.venueName ??
                        gameDetails
                          ?.venue
                      }
                      hostName={
                        gameDetails
                          ?.hostName
                      }
                      eventDate={
                        gameDetails
                          ?.eventDate
                      }
                      eventTime={
                        gameDetails
                          ?.eventTime
                      }
                      primaryColor={
                        gameDetails
                          ?.primaryColor
                      }
                      onMessage={
                        setMessage
                      }
                    />
                  ) : (
                    <div className="mt-[22px] w-full cursor-not-allowed rounded-full bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-center text-[15px] font-black text-white opacity-50">
                      {selectedPlaylist &&
                      advisorTrackCount !== null &&
                      gameAdvisor.readiness === "blocked"
                        ? "More Songs Required"
                        : "Choose a Playlist"}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void disconnect()
                    }
                    className="mt-3 w-full rounded-full border border-slate-600 bg-slate-950/60 p-[13px] text-[13px] font-extrabold text-slate-300"
                  >
                    Disconnect Apple Music
                  </button>
                </>
              )}
            </aside>
          </section>
        </section>
      </main>
    </>
  );
}
