"use client";

// BTTB_APPLE_DIRECT_CREATE_NO_HOST_PAGE_V2

import { useRouter } from "next/navigation";
import { useState } from "react";

type AppleArtwork = {
  url?: string;
};

type AppleTrackResource = {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    artwork?: AppleArtwork;
    playParams?: {
      id?: string;
      catalogId?: string;
      isLibrary?: boolean;
    };
  };
};

type AppleTrackBody = {
  data?: AppleTrackResource[];
  next?: string;
  errors?: Array<{
    title?: string;
    detail?: string;
  }>;
};

type AppleTrackResponse = {
  data?: AppleTrackBody | AppleTrackResource[];
  errors?: AppleTrackBody["errors"];
};

type GameTrack = {
  id: string;
  gameTrackId?: string;
  name: string;
  artist: string;
  album: string;
  image: string | null;
  appleCatalogId?: string;
  appleLibraryId?: string;
};

type Props = {
  playlistId: string;
  playlistName: string;
  cardCount: number;
  clipLength: number;
  winningPattern: string;
  shuffle: boolean;
  gameName?: string;
  venueName?: string;
  hostName?: string;
  eventDate?: string;
  eventTime?: string;
  primaryColor?: string;
  onMessage: (message: string) => void;
};

function formatArtwork(
  artwork?: AppleArtwork,
  width = 300,
  height = 300
) {
  if (!artwork?.url) {
    return null;
  }

  return artwork.url
    .replace("{w}", String(width))
    .replace("{h}", String(height));
}

function mapAppleTracks(
  resources: AppleTrackResource[]
): GameTrack[] {
  const result: GameTrack[] = [];
  const seen = new Set<string>();

  for (const resource of resources) {
    const attributes = resource.attributes;
    const name = attributes?.name?.trim();

    if (!name) {
      continue;
    }

    const playParams = attributes?.playParams;

    const libraryId =
      resource.type?.startsWith("library-") ||
      playParams?.isLibrary === true
        ? playParams?.id ?? resource.id
        : undefined;

    const catalogId = playParams?.catalogId;

    const id =
      resource.id ??
      playParams?.id ??
      catalogId;

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);

    result.push({
      id,
      name,
      artist: attributes?.artistName ?? "",
      album: attributes?.albumName ?? "",
      image: formatArtwork(attributes?.artwork),
      appleCatalogId: catalogId,
      appleLibraryId: libraryId,
    });
  }

  return result;
}

function shuffleTracks<T>(tracks: T[]) {
  const shuffled = [...tracks];

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = Math.floor(
      Math.random() * (index + 1)
    );

    [
      shuffled[index],
      shuffled[randomIndex],
    ] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

async function loadAppleTracks(
  playlistId: string
) {
  const music =
    window.MusicKit?.getInstance();

  if (!music) {
    throw new Error(
      "Apple Music is not ready."
    );
  }

  if (
    !music.isAuthorized &&
    !music.musicUserToken
  ) {
    throw new Error(
      "Apple Music is not connected."
    );
  }

  let nextPath: string | undefined =
    `/v1/me/library/playlists/${encodeURIComponent(
      playlistId
    )}/tracks`;

  const resources: AppleTrackResource[] = [];
  const visited = new Set<string>();

  while (
    nextPath &&
    !visited.has(nextPath)
  ) {
    visited.add(nextPath);

    const response =
      (await music.api.music(
        nextPath,
        { limit: 100 }
      )) as unknown as AppleTrackResponse;

    const body: AppleTrackBody =
      Array.isArray(response.data)
        ? {
            data: response.data,
            errors: response.errors,
          }
        : response.data &&
            !Array.isArray(response.data)
          ? response.data
          : {
              data: [],
              errors: response.errors,
            };

    const errors =
      Array.isArray(response.errors)
        ? response.errors
        : body.errors ?? [];

    if (errors.length > 0) {
      const first = errors[0];

      throw new Error(
        first?.detail ||
          first?.title ||
          "Unable to load Apple Music songs."
      );
    }

    if (Array.isArray(body.data)) {
      resources.push(...body.data);
    }

    nextPath =
      typeof body.next === "string" &&
      body.next.trim()
        ? body.next
        : undefined;
  }

  return mapAppleTracks(resources);
}

export default function AppleDirectCreateButton({
  playlistId,
  playlistName,
  cardCount,
  clipLength,
  winningPattern,
  shuffle,
  gameName,
  venueName,
  hostName,
  eventDate,
  eventTime,
  primaryColor,
  onMessage,
}: Props) {
  const router = useRouter();
  const [creating, setCreating] =
    useState(false);

  async function createGame() {
    if (creating) {
      return;
    }

    try {
      setCreating(true);

      onMessage(
        `Loading ${playlistName} songs...`
      );

      const tracks =
        await loadAppleTracks(
          playlistId
        );

      if (tracks.length < 25) {
        throw new Error(
          `This playlist has ${tracks.length} usable song${
            tracks.length === 1 ? "" : "s"
          }. At least 25 unique songs are required.`
        );
      }

      const safeCardCount =
        Math.min(
          500,
          Math.max(
            1,
            Math.floor(
              Number(cardCount) || 25
            )
          )
        );

      const safeClipLength =
        [15, 20, 30, 45, 60].includes(
          Number(clipLength)
        )
          ? Number(clipLength)
          : 30;

      onMessage(
        `Creating Apple Music game and generating ${safeCardCount} bingo card${
          safeCardCount === 1 ? "" : "s"
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
            body: JSON.stringify({
              source: "apple",
              playlistId,
              playlistName,
              cardCount:
                safeCardCount,
              bingoPattern:
                winningPattern,
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

      const originalById =
        new Map(
          tracks.map(
            (track) => [
              track.id,
              track,
            ]
          )
        );

      const persistedTracks:
        GameTrack[] =
        createdGame.tracks.map(
          (track) => {
            const original =
              originalById.get(
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
            };
          }
        );

      const gameTracks =
        shuffle
          ? shuffleTracks(
              persistedTracks
            )
          : persistedTracks;

      const session = {
        version: 2 as const,
        sessionId:
          createdGame.id,
        joinCode:
          createdGame.joinCode,
        source:
          "apple" as const,
        playlistId,
        playlistName,
        clipLength:
          safeClipLength,
        cardCount:
          safeCardCount,
        createdAt:
          new Date().toISOString(),
        currentIndex: 0,
        status:
          "ready" as const,
        tracks: gameTracks,
        playedTrackIds:
          [] as string[],
        gameName:
          gameName ||
          playlistName,
        venueName:
          venueName || "",
        hostName:
          hostName || "",
        eventDate:
          eventDate || "",
        eventTime:
          eventTime || "",
        primaryColor:
          primaryColor ||
          "#00519a",
        winningPattern,
      };

      const callerState = {
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
        status:
          "ready" as const,
      };

      localStorage.setItem(
        "bttb-v2-game-session",
        JSON.stringify(session)
      );

      localStorage.setItem(
        "bttb-v2-caller-state",
        JSON.stringify(callerState)
      );

      localStorage.removeItem(
        "bttb-v2-dj-activity"
      );

      sessionStorage.setItem(
        "bttbWinningPattern",
        winningPattern
      );

      onMessage(
        `Game created. Join code: ${createdGame.joinCode}`
      );

      router.push(
        "/dj-console"
      );
    } catch (error) {
      console.error(
        "Apple direct game creation error:",
        error
      );

      onMessage(
        error instanceof Error
          ? error.message
          : "Unable to create the game."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() =>
        void createGame()
      }
      disabled={creating}
      className="mt-[22px] block w-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-center text-[15px] font-black text-white shadow-[0_15px_36px_rgba(99,102,241,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {creating
        ? "Creating Game..."
        : "Create Game & Open DJ Console"}
    </button>
  );
}
