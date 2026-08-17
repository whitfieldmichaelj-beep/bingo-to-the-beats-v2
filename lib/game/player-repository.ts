import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { BingoCard, BingoCardSquare } from "./types";

export const CARD_PRICING = {
  1: 500,
  2: 900,
  3: 1200,
  5: 2000,
  10: 3700,
} as const;

export type CardQuantity = keyof typeof CARD_PRICING;

export type JoinPlayerInput = {
  gameId: string;
  joinCode: string;
  playerId?: string;
  playerName: string;
  quantity: CardQuantity;
};

export type PlayerAssignment = {
  playerId: string;
  playerName: string;
  gameId: string;
  joinCode: string;
  purchaseId: string;
  cardIds: string[];
  cardQuantity: CardQuantity;
  amountCents: number;
  purchaseStatus: "PENDING" | "PAID";
  joinedAt: string;
};

export type PlayerRosterItem = {
  playerId: string;
  playerName: string;
  connected: boolean;
  joinedAt: string;
  lastSeenAt: string;
  cardQuantity: number;
  cardIds: string[];
  amountCents: number;
  paymentStatus: "PENDING" | "PAID" | "NONE";
};

export type PlayerActivityItem = {
  id: string;
  type: "joined" | "rejoined";
  playerId: string;
  playerName: string;
  cardQuantity: number;
  createdAt: string;
};

type DatabaseCardWithSquares = {
  id: string;
  cardNumber: number;
  gameId: string;
  rows: number;
  columns: number;
  squareCount: number;
  signature: string;
  createdAt: Date;
  squares: Array<{
    position: number;
    row: number;
    column: number;
    marked: boolean;
    markedAt: Date | null;
    track: {
      providerTrackId: string;
      title: string;
      artist: string;
    };
  }>;
};

const cardInclude = {
  squares: {
    include: {
      track: true,
    },
    orderBy: {
      position: "asc" as const,
    },
  },
} as const;

function mapCard(card: DatabaseCardWithSquares): BingoCard {
  const squares: BingoCardSquare[] = card.squares.map((square) => ({
    squareIndex: square.position,
    row: square.row,
    column: square.column,
    trackId: square.track.providerTrackId,
    gameTrackId: "",
    title: square.track.title,
    artist: square.track.artist,
    marked: square.marked,
    markedAt: square.markedAt?.toISOString() ?? null,
  }));

  return {
    id: card.id,
    cardNumber: card.cardNumber,
    gameId: card.gameId,
    rows: card.rows,
    columns: card.columns,
    squareCount: card.squareCount,
    signature: card.signature,
    squares,
    createdAt: card.createdAt.toISOString(),
  };
}

function toAmountCents(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

// BTTB_ONE_PLAYER_ONE_GAME_ENROLLMENT_V1
async function getExistingPurchase(gameId: string, playerId: string) {
  return prisma.purchase.findFirst({
    where: {
      gameId,
      playerKey: playerId,
      status: {
        in: ["PENDING", "PAID"],
      },
    },
    include: {
      cards: {
        include: cardInclude,
        orderBy: {
          cardNumber: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

// BTTB_P2034_CARD_CLAIM_RETRY_V1
function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

async function waitForExistingPurchaseWithCards(
  gameId: string,
  playerId: string
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const existing = await getExistingPurchase(gameId, playerId);

    if (existing && existing.cards.length > 0) {
      return existing;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  return null;
}

async function upsertPlayerSession(
  gameId: string,
  playerId: string,
  playerName: string,
  rejoining: boolean
) {
  try {
    return await prisma.gameSession.upsert({
      where: {
        sessionKey: playerId,
      },
      create: {
        gameId,
        sessionKey: playerId,
        playerName,
        connected: true,
      },
      update: {
        gameId,
        playerName,
        connected: true,
        lastSeenAt: new Date(),
        ...(rejoining ? {} : { joinedAt: new Date() }),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    // Defensive fallback if two requests race during session creation.
    return prisma.gameSession.update({
      where: {
        sessionKey: playerId,
      },
      data: {
        gameId,
        playerName,
        connected: true,
        lastSeenAt: new Date(),
        ...(rejoining ? {} : { joinedAt: new Date() }),
      },
    });
  }
}

async function buildExistingAssignment(
  input: JoinPlayerInput,
  playerId: string,
  existingPurchase: Awaited<ReturnType<typeof getExistingPurchase>>
) {
  if (!existingPurchase || existingPurchase.cards.length === 0) {
    return null;
  }

  await upsertPlayerSession(
    input.gameId,
    playerId,
    input.playerName,
    true
  );

  const cards = existingPurchase.cards.map((card) =>
    mapCard(card as DatabaseCardWithSquares)
  );

  const assignment: PlayerAssignment = {
    playerId,
    playerName:
      existingPurchase.playerName ?? input.playerName,
    gameId: input.gameId,
    joinCode: input.joinCode,
    purchaseId: existingPurchase.id,
    cardIds: cards.map((card) => card.id),
    cardQuantity: existingPurchase.quantity as CardQuantity,
    amountCents: toAmountCents(existingPurchase.amount),
    purchaseStatus:
      existingPurchase.status === "PAID" ? "PAID" : "PENDING",
    joinedAt: existingPurchase.createdAt.toISOString(),
  };

  return {
    rejoined: true as const,
    assignment,
    cards,
  };
}

async function claimCards(
  gameId: string,
  playerId: string,
  playerName: string,
  purchaseId: string,
  quantity: number
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const available = await prisma.bingoCard.findMany({
      where: {
        gameId,
        playerKey: null,
        purchaseId: null,
        status: "AVAILABLE",
      },
      select: {
        id: true,
      },
    });

    if (available.length < quantity) {
      return {
        ok: false as const,
        availableCardCount: available.length,
      };
    }

    for (let index = available.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [available[index], available[randomIndex]] = [
        available[randomIndex],
        available[index],
      ];
    }

    const selectedIds = available
      .slice(0, quantity)
      .map((card) => card.id);

    try {
      await prisma.$transaction(
        async (tx) => {
          for (const cardId of selectedIds) {
            const result = await tx.bingoCard.updateMany({
              where: {
                id: cardId,
                gameId,
                playerKey: null,
                purchaseId: null,
                status: "AVAILABLE",
              },
              data: {
                playerKey: playerId,
                playerName,
                purchaseId,
                status: "ASSIGNED",
              },
            });

            if (result.count !== 1) {
              throw new Error("CARD_ALREADY_ASSIGNED");
            }
          }
        },
        {
          isolationLevel: "Serializable",
        }
      );

      const cards = await prisma.bingoCard.findMany({
        where: {
          id: {
            in: selectedIds,
          },
        },
        include: cardInclude,
        orderBy: {
          cardNumber: "asc",
        },
      });

      return {
        ok: true as const,
        cards: cards.map((card) =>
          mapCard(card as DatabaseCardWithSquares)
        ),
      };
    } catch (error) {
      if (
    (error instanceof Error &&
      error.message === "CARD_ALREADY_ASSIGNED") ||
    isRetryableTransactionError(error)
  ) {
    continue;
  }

      throw error;
    }
  }

  throw new Error(
    "Unable to assign cards because another player claimed them first. Please try again."
  );
}

export async function joinPlayer(input: JoinPlayerInput) {
  // BTTB_ATOMIC_PLAYER_ENROLLMENT_V1
  //
  // Purchase creation, card assignment, and GameSession creation are
  // committed together. A failure anywhere in the enrollment transaction
  // rolls the entire enrollment back instead of leaving an orphan purchase.
  const playerId = input.playerId?.trim() || randomUUID();

  const existingPurchase = await getExistingPurchase(
    input.gameId,
    playerId
  );

  const existingAssignment = await buildExistingAssignment(
    input,
    playerId,
    existingPurchase
  );

  if (existingAssignment) {
    return existingAssignment;
  }

  const amountCents = CARD_PRICING[input.quantity];

  class SoldOutEnrollmentError extends Error {
    availableCardCount: number;

    constructor(availableCardCount: number) {
      super("SOLD_OUT");
      this.name = "SoldOutEnrollmentError";
      this.availableCardCount = availableCardCount;
    }
  }

  for (
    let enrollmentAttempt = 0;
    enrollmentAttempt < 5;
    enrollmentAttempt += 1
  ) {
    const purchaseId = randomUUID();

    try {
      const transactionResult = await prisma.$transaction(
        async (tx) => {
          await tx.purchase.create({
            data: {
              id: purchaseId,
              gameId: input.gameId,
              playerKey: playerId,
              playerName: input.playerName,
              quantity: input.quantity,
              amount: amountCents / 100,
              currency: "USD",
              status: "PENDING",
            },
          });

          const available = await tx.bingoCard.findMany({
            where: {
              gameId: input.gameId,
              playerKey: null,
              purchaseId: null,
              status: "AVAILABLE",
            },
            select: {
              id: true,
            },
          });

          if (available.length < input.quantity) {
            throw new SoldOutEnrollmentError(
              available.length
            );
          }

          for (
            let index = available.length - 1;
            index > 0;
            index -= 1
          ) {
            const randomIndex = Math.floor(
              Math.random() * (index + 1)
            );

            [
              available[index],
              available[randomIndex],
            ] = [
              available[randomIndex],
              available[index],
            ];
          }

          const selectedIds = available
            .slice(0, input.quantity)
            .map((card) => card.id);

          for (const cardId of selectedIds) {
            const result =
              await tx.bingoCard.updateMany({
                where: {
                  id: cardId,
                  gameId: input.gameId,
                  playerKey: null,
                  purchaseId: null,
                  status: "AVAILABLE",
                },
                data: {
                  playerKey: playerId,
                  playerName: input.playerName,
                  purchaseId,
                  status: "ASSIGNED",
                },
              });

            if (result.count !== 1) {
              throw new Error(
                "CARD_ALREADY_ASSIGNED"
              );
            }
          }

          const session =
            await tx.gameSession.upsert({
              where: {
                sessionKey: playerId,
              },
              create: {
                gameId: input.gameId,
                sessionKey: playerId,
                playerName: input.playerName,
                connected: true,
              },
              update: {
                gameId: input.gameId,
                playerName: input.playerName,
                connected: true,
                lastSeenAt: new Date(),
                joinedAt: new Date(),
              },
            });

          const cards =
            await tx.bingoCard.findMany({
              where: {
                id: {
                  in: selectedIds,
                },
              },
              include: cardInclude,
              orderBy: {
                cardNumber: "asc",
              },
            });

          if (cards.length !== input.quantity) {
            throw new Error(
              "CARD_ASSIGNMENT_INCOMPLETE"
            );
          }

          return {
            joinedAt: session.joinedAt,
            cards: cards.map((card) =>
              mapCard(
                card as DatabaseCardWithSquares
              )
            ),
          };
        },
        {
          isolationLevel: "Serializable",
          maxWait: 10_000,
          timeout: 10_000,
        }
      );

      const assignment: PlayerAssignment = {
        playerId,
        playerName: input.playerName,
        gameId: input.gameId,
        joinCode: input.joinCode,
        purchaseId,
        cardIds: transactionResult.cards.map(
          (card) => card.id
        ),
        cardQuantity: input.quantity,
        amountCents,
        purchaseStatus: "PENDING",
        joinedAt:
          transactionResult.joinedAt.toISOString(),
      };

      return {
        rejoined: false as const,
        assignment,
        cards: transactionResult.cards,
      };
    } catch (error) {
      if (error instanceof SoldOutEnrollmentError) {
        return {
          soldOut: true as const,
          availableCardCount:
            error.availableCardCount,
        };
      }

      if (isUniqueConstraintError(error)) {
        // Another simultaneous request for this trusted player may
        // have committed the enrollment first.
        const racedPurchase =
          await waitForExistingPurchaseWithCards(
            input.gameId,
            playerId
          );

        const racedAssignment =
          await buildExistingAssignment(
            input,
            playerId,
            racedPurchase
          );

        if (racedAssignment) {
          return racedAssignment;
        }

        continue;
      }

      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? (error as { code?: unknown }).code
          : undefined;

      if (
        (error instanceof Error &&
          error.message ===
            "CARD_ALREADY_ASSIGNED") ||
        isRetryableTransactionError(error) ||
        errorCode === "P2028"
      ) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            25 * (enrollmentAttempt + 1)
          )
        );

        continue;
      }

      throw error;
    }
  }

  const finalExistingPurchase =
    await waitForExistingPurchaseWithCards(
      input.gameId,
      playerId
    );

  const finalExistingAssignment =
    await buildExistingAssignment(
      input,
      playerId,
      finalExistingPurchase
    );

  if (finalExistingAssignment) {
    return finalExistingAssignment;
  }

  // BTTB_SOLD_OUT_RACE_FALLTHROUGH_FIX_V1
  const finalAvailability =
    await getGameAvailability(input.gameId);

  if (
    finalAvailability.remainingCards <
    input.quantity
  ) {
    return {
      soldOut: true as const,
      availableCardCount:
        finalAvailability.remainingCards,
    };
  }

  throw new Error(
    "Unable to establish a unique enrollment for this player. Please try again."
  );
}

export async function getGameAvailability(gameId: string) {
  const [totalCards, assignedCards] = await Promise.all([
    prisma.bingoCard.count({
      where: {
        gameId,
      },
    }),
    prisma.bingoCard.count({
      where: {
        gameId,
        playerKey: {
          not: null,
        },
      },
    }),
  ]);

  return {
    totalCards,
    assignedCards,
    remainingCards: Math.max(0, totalCards - assignedCards),
  };
}

export async function listPlayers(gameId: string) {
  const [sessions, purchases] = await Promise.all([
    prisma.gameSession.findMany({
      where: {
        gameId,
      },
      orderBy: {
        joinedAt: "asc",
      },
    }),
    prisma.purchase.findMany({
      where: {
        gameId,
        status: {
in: ["PENDING", "PAID"],
},
        playerKey: {
          not: null,
        },
      },
      include: {
        cards: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  const purchasesByPlayer = new Map<
    string,
    {
      quantity: number;
      amountCents: number;
      cardIds: string[];
      playerName: string;
    paymentStatus: "PENDING" | "PAID";
}
  >();

  for (const purchase of purchases) {
    if (!purchase.playerKey) continue;

    const current = purchasesByPlayer.get(purchase.playerKey);

    if (current) {
      current.quantity += purchase.quantity;
      current.amountCents += toAmountCents(purchase.amount);
      current.cardIds.push(...purchase.cards.map((card) => card.id));

if (purchase.status === "PAID") {
current.paymentStatus = "PAID";
}
      continue;
    }

    purchasesByPlayer.set(purchase.playerKey, {
      quantity: purchase.quantity,
      amountCents: toAmountCents(purchase.amount),
      cardIds: purchase.cards.map((card) => card.id),
      playerName: purchase.playerName ?? "Player",
paymentStatus:
purchase.status === "PAID" ? "PAID" : "PENDING",
    });
  }

  const players: PlayerRosterItem[] = sessions.map((session) => {
    const purchase = purchasesByPlayer.get(session.sessionKey);

    return {
      playerId: session.sessionKey,
      playerName:
        session.playerName ?? purchase?.playerName ?? "Player",
      connected: session.connected,
      joinedAt: session.joinedAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      cardQuantity: purchase?.quantity ?? 0,
      cardIds: purchase?.cardIds ?? [],
      amountCents: purchase?.amountCents ?? 0,
paymentStatus: purchase?.paymentStatus ?? "NONE",
    };
  });

  const activities: PlayerActivityItem[] = purchases
    .filter((purchase) => purchase.status === "PAID")
.map((purchase) => ({
      id: `joined-${purchase.id}`,
      type: "joined" as const,
      playerId: purchase.playerKey ?? purchase.id,
      playerName: purchase.playerName ?? "Player",
      cardQuantity: purchase.quantity,
      createdAt: purchase.createdAt.toISOString(),
    }))
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
    .slice(0, 30);

  const paidPlayers = players.filter(
(player) => player.paymentStatus === "PAID"
);

const totalCards = paidPlayers.reduce(
(sum, player) => sum + player.cardQuantity,
0
);

const totalPotCents = paidPlayers.reduce(
(sum, player) => sum + player.amountCents,
0
);

  const pendingPlayers = players.filter(
    (player) => player.paymentStatus === "PENDING"
  ).length;

  const noPaymentPlayers = players.filter(
    (player) => player.paymentStatus === "NONE"
  ).length;

  return {
    players,
    activities,
    totals: {
      totalPlayers: paidPlayers.length,
      pendingPlayers,
      noPaymentPlayers,
      connectedPlayers: players.filter(
        (player) => player.connected
      ).length,
      totalCards,
      totalPotCents,
    },
  };
}

export async function markPlayerSeen(
  playerId: string,
  connected = true
) {
  return prisma.gameSession.update({
    where: {
      sessionKey: playerId,
    },
    data: {
      connected,
      lastSeenAt: new Date(),
    },
  });
}
