"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  FolderPicker,
  GameAdvisor,
  LibraryStats,
  PlaylistList,
} from "@/components/music/local";

import type {
  LocalMusicGameAdvisor,
} from "@/lib/music/local/game-builder";

import type {
  ActiveGame,
} from "@/lib/game/types";

import type {
  LocalMusicPlaylist,
  LocalMusicScanResult,
  LocalMusicTrack,
} from "@/types/local-music";

import styles from "./local-music.module.css";

type CreateGameResponse =
  | {
      ok: true;
      libraryId: string;
      game: ActiveGame;
    }
  | {
      ok: false;
      error: string;
    };

const MINIMUM_TRACKS = 25;
const IDEAL_TRACKS = 75;
const REQUESTED_TRACKS = 80;
const DEFAULT_CARD_COUNT = 25;
const DEFAULT_CLIP_LENGTH = 30;
const GAME_SESSION_KEY =
  "bttb-v2-game-session";
const CREATED_GAME_KEY =
  "bttb-v2-created-game";

function createAdvisor(
  playlist: LocalMusicPlaylist | null
): LocalMusicGameAdvisor | null {
  if (!playlist) {
    return null;
  }

  const tracks = playlist.tracks;

  const playableTracks = tracks.filter(
    (track) =>
      track.readable &&
      !track.duplicate
  );

  const duplicateTrackCount =
    tracks.filter(
      (track) => track.duplicate
    ).length;

  const unreadableTrackCount =
    tracks.filter(
      (track) => !track.readable
    ).length;

  const missingArtistCount =
    tracks.filter(
      (track) =>
        !track.artist ||
        track.artist ===
          "Unknown Artist"
    ).length;

  const missingTitleCount =
    tracks.filter(
      (track) =>
        !track.title ||
        track.title ===
          "Unknown Song"
    ).length;

  const issues: string[] = [];
  const recommendations: string[] = [];

  let readiness:
    LocalMusicGameAdvisor["readiness"] =
      "ready";

  if (
    playableTracks.length <
    MINIMUM_TRACKS
  ) {
    readiness = "blocked";

    issues.push(
      `Only ${playableTracks.length} playable songs are available. At least ${MINIMUM_TRACKS} are required.`
    );

    recommendations.push(
      `Add at least ${
        MINIMUM_TRACKS -
        playableTracks.length
      } more playable songs.`
    );
  } else if (
    playableTracks.length <
    IDEAL_TRACKS
  ) {
    readiness = "warning";

    issues.push(
      `${playableTracks.length} playable songs are available, which is below the recommended ${IDEAL_TRACKS}.`
    );

    recommendations.push(
      `Add ${
        IDEAL_TRACKS -
        playableTracks.length
      } more songs for better card variety.`
    );
  }

  if (duplicateTrackCount > 0) {
    if (readiness === "ready") {
      readiness = "warning";
    }

    issues.push(
      `${duplicateTrackCount} duplicate song${
        duplicateTrackCount === 1
          ? ""
          : "s"
      } detected.`
    );

    recommendations.push(
      "Duplicate songs will be excluded from the game."
    );
  }

  if (unreadableTrackCount > 0) {
    if (readiness === "ready") {
      readiness = "warning";
    }

    issues.push(
      `${unreadableTrackCount} unreadable song file${
        unreadableTrackCount === 1
          ? ""
          : "s"
      } detected.`
    );

    recommendations.push(
      "Unreadable song files will be excluded from the game."
    );
  }

  if (
    missingArtistCount > 0 ||
    missingTitleCount > 0
  ) {
    if (readiness === "ready") {
      readiness = "warning";
    }

    issues.push(
      `${missingArtistCount} song${
        missingArtistCount === 1
          ? ""
          : "s"
      } missing an artist and ${missingTitleCount} missing a title.`
    );

    recommendations.push(
      "Rename files using Artist - Song Title for cleaner game cards."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "This playlist is ready to create a game."
    );
  }

  return {
    readiness,
    availableTrackCount:
      playableTracks.length,
    selectedTrackCount:
      Math.min(
        REQUESTED_TRACKS,
        playableTracks.length
      ),
    minimumTrackCount:
      MINIMUM_TRACKS,
    idealTrackCount:
      IDEAL_TRACKS,
    recommendedTrackCount:
      Math.min(
        IDEAL_TRACKS,
        playableTracks.length
      ),
    duplicateTrackCount,
    unreadableTrackCount,
    missingArtistCount,
    missingTitleCount,
    issues,
    recommendations,
  };
}

function getPlayableTracks(
  playlist: LocalMusicPlaylist | null
): LocalMusicTrack[] {
  if (!playlist) {
    return [];
  }

  return playlist.tracks.filter(
    (track) =>
      track.readable &&
      !track.duplicate
  );
}

export default function LocalMusicPage() {
  const router = useRouter();
  const [
    library,
    setLibrary,
  ] =
    useState<LocalMusicScanResult | null>(
      null
    );

  const [
    selectedPlaylist,
    setSelectedPlaylist,
  ] =
    useState<LocalMusicPlaylist | null>(
      null
    );

  const [
    createdGame,
    setCreatedGame,
  ] =
    useState<ActiveGame | null>(
      null
    );

  const [
    isCreatingGame,
    setIsCreatingGame,
  ] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const advisor = useMemo(
    () =>
      createAdvisor(
        selectedPlaylist
      ),
    [selectedPlaylist]
  );

  const playableTracks =
    useMemo(
      () =>
        getPlayableTracks(
          selectedPlaylist
        ),
      [selectedPlaylist]
    );

  function handleScanComplete(
    result: LocalMusicScanResult
  ) {
    setLibrary(result);
    setCreatedGame(null);
    setError(null);

    setSelectedPlaylist(
      result.playlists[0] ?? null
    );
  }

  function handlePlaylistSelect(
    playlist: LocalMusicPlaylist
  ) {
    setSelectedPlaylist(
      playlist
    );
    setCreatedGame(null);
    setError(null);
  }

  async function handleCreateGame() {
    if (
      !selectedPlaylist ||
      !advisor ||
      advisor.readiness ===
        "blocked"
    ) {
      return;
    }

    setIsCreatingGame(true);
    setCreatedGame(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/music/local/game",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            libraryId:
              library?.libraryId,
            gameName:
              selectedPlaylist.name,
            playlistId:
              selectedPlaylist.id,
            requestedTrackCount:
              Math.min(
                REQUESTED_TRACKS,
                playableTracks.length
              ),
            minimumTrackCount:
              MINIMUM_TRACKS,
            idealTrackCount:
              IDEAL_TRACKS,
            includeDuplicates:
              false,
            includeUnreadable:
              false,
            cardCount:
              DEFAULT_CARD_COUNT,
            winningPattern:
              "any-line",
          }),
        }
      );

      const responseText =
        await response.text();

      if (!responseText.trim()) {
        throw new Error(
          `The game server returned an empty response (HTTP ${response.status}).`
        );
      }

      let data: CreateGameResponse;

      try {
        data = JSON.parse(
          responseText
        ) as CreateGameResponse;
      } catch {
        throw new Error(
          `The game server returned an invalid response (HTTP ${response.status}).`
        );
      }

      if (
        !response.ok ||
        !data.ok
      ) {
        const message =
          "error" in data
            ? data.error
            : "The game could not be created.";

        throw new Error(message);
      }

      const createdGame =
        data.game;

      const session = {
        version: 2 as const,
        sessionId:
          createdGame.id,
        source: "local" as const,
        playlistId:
          createdGame.playlistId,
        playlistName:
          createdGame.playlistName,
        clipLength:
          DEFAULT_CLIP_LENGTH,
        cardCount:
          createdGame.cards?.length ??
          DEFAULT_CARD_COUNT,
        createdAt:
          new Date().toISOString(),
        currentIndex: 0,
        status: "ready" as const,
        tracks:
          createdGame.tracks.map(
            (track) => ({
              id: track.id,
              gameTrackId:
                track.gameTrackId,
              name:
                track.title ||
                "Unknown Song",
              artist:
                track.artist ||
                "Unknown Artist",
              album:
                track.album ||
                track.fileName ||
                "Local Music",
              image: null,
              fileName:
                track.fileName,
              filePath:
                track.filePath,
            })
          ),
        playedTrackIds: [],
        joinCode:
          createdGame.joinCode,
        winningPattern:
          "any-line" as const,
        gameName:
          createdGame.playlistName,
        venueName: "",
        hostName: "",
      };

      localStorage.setItem(
        GAME_SESSION_KEY,
        JSON.stringify(session)
      );

      localStorage.setItem(
        CREATED_GAME_KEY,
        JSON.stringify(
          createdGame
        )
      );

      sessionStorage.setItem(
        "bttbWinningPattern",
        "any-line"
      );

      setCreatedGame(
        createdGame
      );

      router.push(
        "/dj-console"
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The game could not be created."
      );
    } finally {
      setIsCreatingGame(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>
              BINGO TO THE BEATS
            </p>

            <h1>
              Local Music Library
            </h1>

            <p className={styles.heroCopy}>
              Scan music stored on this
              computer, choose a folder
              playlist, and build a
              ready-to-play game.
            </p>
          </div>

          <div
            className={styles.heroBadge}
            aria-label="Local music status"
          >
            <span>LOCAL</span>
            <strong>
              {library
                ? `${library.stats.playableTracks.toLocaleString(
                    "en-US"
                  )} SONGS`
                : "READY TO SCAN"}
            </strong>
          </div>
        </header>

        <div className={styles.scanPanel}>
          <FolderPicker
            onScanComplete={
              handleScanComplete
            }
            onError={setError}
          />
        </div>

        <div className={styles.dashboardGrid}>
          <div className={styles.statsPanel}>
            <LibraryStats
              stats={
                library?.stats ?? null
              }
            />
          </div>

          <div className={styles.playlistPanel}>
            <PlaylistList
              playlists={
                library?.playlists ?? []
              }
              selectedPlaylistId={
                selectedPlaylist?.id ??
                null
              }
              onSelect={
                handlePlaylistSelect
              }
            />
          </div>

          <div className={styles.advisorPanel}>
            <GameAdvisor
              advisor={advisor}
            />
          </div>

          <section
            className={styles.createPanel}
            aria-labelledby="create-local-game-title"
          >
            <div>
              <p className={styles.eyebrow}>
                GAME BUILDER
              </p>

              <h2 id="create-local-game-title">
                Create Local Music Game
              </h2>
            </div>

            {selectedPlaylist ? (
              <>
                <div className={styles.selectionCard}>
                  <span>
                    Selected playlist
                  </span>

                  <strong>
                    {selectedPlaylist.name}
                  </strong>

                  <p>
                    {playableTracks.length.toLocaleString(
                      "en-US"
                    )}{" "}
                    playable songs
                    available.
                  </p>
                </div>

                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={
                    handleCreateGame
                  }
                  disabled={
                    isCreatingGame ||
                    advisor?.readiness ===
                      "blocked"
                  }
                >
                  {isCreatingGame
                    ? "Creating Game..."
                    : "Create Game"}
                </button>
              </>
            ) : (
              <div className={styles.emptyState}>
                Scan a folder and choose
                a playlist to create a
                game.
              </div>
            )}
          </section>
        </div>

        {error ? (
          <section
            className={styles.errorPanel}
            role="alert"
          >
            <strong>
              Local Music Error
            </strong>

            <p>{error}</p>
          </section>
        ) : null}

        {createdGame ? (
          <section
            className={styles.successPanel}
            aria-labelledby="created-local-game-title"
          >
            <div>
              <p className={styles.eyebrow}>
                GAME CREATED
              </p>

              <h2 id="created-local-game-title">
                {createdGame.playlistName}
              </h2>
            </div>

            <div className={styles.successStats}>
              <div>
                <span>Songs</span>
                <strong>
                  {createdGame.tracks.length.toLocaleString(
                    "en-US"
                  )}
                </strong>
              </div>

              <div>
                <span>Source</span>
                <strong>Local Music</strong>
              </div>

              <div>
                <span>Game ID</span>
                <code>
                  {createdGame.id}
                </code>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
