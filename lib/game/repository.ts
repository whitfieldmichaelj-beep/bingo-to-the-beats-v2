import type {
  CardStatus,
  GameStatus as PrismaGameStatus,
  MusicProvider,
} from "@/app/generated/prisma/client";

import { prisma } from "@/lib/prisma";

import {
  mapDatabaseGameToActiveGame,
  type DatabaseGameWithRelations,
} from "./mapper";

import type {
  ActiveGame,
  GameStatus,
} from "./types";

const gameInclude = {
  tracks: {
    include: {
      track: true,
    },
    orderBy: {
      position: "asc" as const,
    },
  },
  cards: {
    include: {
      squares: {
        include: {
          track: true,
        },
        orderBy: {
          position: "asc" as const,
        },
      },
    },
    orderBy: {
      cardNumber: "asc" as const,
    },
  },
} as const;

function toPrismaStatus(
  status: GameStatus
): PrismaGameStatus {
  if (status === "active") return "LIVE";
  if (status === "paused") return "PAUSED";
  if (status === "completed") return "COMPLETED";
  return "READY";
}

function toDate(value: string | null): Date | null {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function normalizeJoinCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function providerTrackId(
  id: string,
  filePath: string
): string {
  return id.trim() || filePath.trim();
}

async function loadGameById(
  gameId: string
): Promise<ActiveGame | null> {
  const game = await prisma.game.findUnique({
    where: {
      id: gameId,
    },
    include: gameInclude,
  });

  return game
    ? mapDatabaseGameToActiveGame(
        game as DatabaseGameWithRelations
      )
    : null;
}

export async function createGame(
  game: ActiveGame,
  hostClerkId: string
): Promise<ActiveGame> {
  const cards = game.cards ?? [];

  await prisma.$transaction(
    async (tx) => {
      const host = await tx.user.upsert({
        where: {
          clerkId: hostClerkId,
        },
        update: {},
        create: {
          clerkId: hostClerkId,
        },
      });

      const sourceTrackIds = game.tracks.map(
        (track) =>
          providerTrackId(
            track.id,
            track.filePath
          )
      );

      await tx.track.createMany({
        data: game.tracks.map((track) => ({
          provider: "SERATO" as MusicProvider,
          providerTrackId:
            providerTrackId(
              track.id,
              track.filePath
            ),
          title:
            track.title ||
            "Unknown Title",
          artist:
            track.artist ||
            "Unknown Artist",
          album: track.album ?? null,
          artworkUrl: null,
          previewUrl: null,
          durationMs: null,
          explicit: false,
          uri: null,
          isrc: null,
          filePath:
            track.filePath || null,
          fileName:
            track.fileName || null,
          bpm:
            typeof track.bpm === "number" &&
            Number.isFinite(track.bpm)
              ? track.bpm
              : null,
        })),
        skipDuplicates: true,
      });

      const storedTracks =
        await tx.track.findMany({
          where: {
            provider: "SERATO",
            providerTrackId: {
              in: sourceTrackIds,
            },
          },
        });

      const storedTrackBySourceId =
        new Map(
          storedTracks.map((track) => [
            track.providerTrackId,
            track,
          ])
        );

      await tx.game.create({
        data: {
          id: game.id,
          hostId: host.id,
          sourcePlaylistId:
            game.playlistId || null,
          playlistName:
            game.playlistName,
          playlistTrackCount:
            game.playlistTrackCount,
          title: game.playlistName,
          joinCode:
            normalizeJoinCode(
              game.joinCode
            ),
          status:
            toPrismaStatus(
              game.status
            ),
          locked: game.locked,
          winningRule:
            game.bingoPattern,
          requestedCardCount:
            game.requestedCardCount ??
            cards.length,
          songsPerCard:
            game.songsPerCard ?? 25,
          currentTrackId:
            game.currentTrackId,
          startedAt:
            toDate(game.startedAt),
          completedAt:
            toDate(
              game.completedAt
            ),
        },
      });

      await tx.gameTrack.createMany({
        data: game.tracks.map(
          (track) => {
            const sourceId =
              providerTrackId(
                track.id,
                track.filePath
              );

            const storedTrack =
              storedTrackBySourceId.get(
                sourceId
              );

            if (!storedTrack) {
              throw new Error(
                `Track was not persisted: ${sourceId}`
              );
            }

            return {
              id: track.gameTrackId,
              gameId: game.id,
              trackId:
                storedTrack.id,
              position:
                track.position,
              called: track.called,
              calledAt:
                toDate(
                  track.calledAt
                ),
              playedAt:
                toDate(
                  track.calledAt
                ),
            };
          }
        ),
      });

      if (cards.length === 0) {
        return;
      }

      await tx.bingoCard.createMany({
        data: cards.map((card) => ({
          id: card.id,
          gameId: game.id,
          cardNumber:
            card.cardNumber,
          status:
            "AVAILABLE" as CardStatus,
          rows: card.rows,
          columns:
            card.columns,
          squareCount:
            card.squareCount,
          signature:
            card.signature,
          createdAt:
            new Date(
              card.createdAt
            ),
        })),
      });

      const squares = cards.flatMap(
        (card) =>
          card.squares.map(
            (square) => {
              const storedTrack =
                storedTrackBySourceId.get(
                  square.trackId
                );

              if (!storedTrack) {
                throw new Error(
                  `Card square track was not persisted: ${square.trackId}`
                );
              }

              return {
                cardId: card.id,
                trackId:
                  storedTrack.id,
                position:
                  square.squareIndex,
                row: square.row,
                column:
                  square.column,
                marked:
                  square.marked,
                markedAt:
                  toDate(
                    square.markedAt
                  ),
              };
            }
          )
      );

      const chunkSize = 5000;

      for (
        let index = 0;
        index < squares.length;
        index += chunkSize
      ) {
        await tx.cardSquare.createMany({
          data: squares.slice(
            index,
            index + chunkSize
          ),
        });
      }
    },
    {
      timeout: 120_000,
      maxWait: 20_000,
    }
  );

  const savedGame =
    await loadGameById(game.id);

  if (!savedGame) {
    throw new Error(
      "The game was saved but could not be reloaded."
    );
  }

  return savedGame;
}

export async function findGameById(
  gameId: string
): Promise<ActiveGame | null> {
  return loadGameById(gameId);
}

export async function findGameByJoinCode(
  joinCode: string
): Promise<ActiveGame | null> {
  const game =
    await prisma.game.findUnique({
      where: {
        joinCode:
          normalizeJoinCode(
            joinCode
          ),
      },
      include: gameInclude,
    });

  return game
    ? mapDatabaseGameToActiveGame(
        game as DatabaseGameWithRelations
      )
    : null;
}

export async function listGames(
  hostClerkId?: string
): Promise<ActiveGame[]> {
  const games =
    await prisma.game.findMany({
      where: hostClerkId
        ? {
            host: {
              clerkId:
                hostClerkId,
            },
          }
        : undefined,
      include: gameInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

  return games.map((game) =>
    mapDatabaseGameToActiveGame(
      game as DatabaseGameWithRelations
    )
  );
}

export async function updateGame(
  gameId: string,
  updater: (
    game: ActiveGame
  ) => ActiveGame
): Promise<ActiveGame | null> {
  const existing =
    await findGameById(gameId);

  if (!existing) {
    return null;
  }

  const updated = updater(existing);

  await prisma.$transaction(
    async (tx) => {
      await tx.game.update({
        where: {
          id: gameId,
        },
        data: {
          status:
            toPrismaStatus(
              updated.status
            ),
          winningRule:
            updated.bingoPattern,
          currentTrackId:
            updated.currentTrackId,
          startedAt:
            toDate(
              updated.startedAt
            ),
          completedAt:
            toDate(
              updated.completedAt
            ),
        },
      });

      const calledIds =
        new Set(
          updated.calledTrackIds
        );

      for (
        const track of updated.tracks
      ) {
        await tx.gameTrack.update({
          where: {
            id:
              track.gameTrackId,
          },
          data: {
            called:
              calledIds.has(
                track.id
              ) ||
              track.called,
            calledAt:
              toDate(
                track.calledAt
              ),
            playedAt:
              toDate(
                track.calledAt
              ),
          },
        });
      }
    },
    {
      timeout: 60_000,
      maxWait: 20_000,
    }
  );

  return findGameById(gameId);
}

export async function deleteGame(
  gameId: string
): Promise<boolean> {
  try {
    await prisma.game.delete({
      where: {
        id: gameId,
      },
    });

    return true;
  } catch {
    return false;
  }
}
