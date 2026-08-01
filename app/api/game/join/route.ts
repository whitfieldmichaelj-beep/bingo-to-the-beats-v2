import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getGameByJoinCode } from "@/lib/game/store";
import type { BingoCard } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICING = {
  1: 500,
  2: 900,
  3: 1200,
  5: 2000,
  10: 3700,
} as const;

type CardQuantity = keyof typeof PRICING;

type PlayerAssignment = {
  playerId: string;
  playerName: string;
  gameId: string;
  joinCode: string;
  purchaseId: string;
  cardIds: string[];
  cardQuantity: CardQuantity;
  amountCents: number;
  joinedAt: string;
};

type AssignmentStore = Map<string, PlayerAssignment>;

declare global {
  var bingoToTheBeatsPlayerAssignmentsV2:
    | AssignmentStore
    | undefined;
}

const assignmentStore: AssignmentStore =
  globalThis.bingoToTheBeatsPlayerAssignmentsV2 ??
  new Map<string, PlayerAssignment>();

if (process.env.NODE_ENV !== "production") {
  globalThis.bingoToTheBeatsPlayerAssignmentsV2 =
    assignmentStore;
}

function assignmentKey(
  gameId: string,
  playerId: string
): string {
  return `${gameId}:${playerId}`;
}

function normalizeJoinCode(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

function normalizePlayerName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, 50);
}

function normalizeCardQuantity(
  value: unknown
): CardQuantity | null {
  const quantity =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(quantity) || !(quantity in PRICING)) {
    return null;
  }

  return quantity as CardQuantity;
}

function getExistingAssignment(
  gameId: string,
  playerId: string
): PlayerAssignment | null {
  return (
    assignmentStore.get(
      assignmentKey(gameId, playerId)
    ) ?? null
  );
}

function getAssignedCardIds(gameId: string): Set<string> {
  const assignedCardIds = new Set<string>();

  for (const assignment of assignmentStore.values()) {
    if (assignment.gameId !== gameId) {
      continue;
    }

    for (const cardId of assignment.cardIds) {
      assignedCardIds.add(cardId);
    }
  }

  return assignedCardIds;
}

function getAvailableCards(
  cards: BingoCard[],
  gameId: string
): BingoCard[] {
  const assignedCardIds = getAssignedCardIds(gameId);

  return cards.filter(
    (card) => !assignedCardIds.has(card.id)
  );
}

function selectRandomCards(
  availableCards: BingoCard[],
  quantity: number
): BingoCard[] {
  const shuffled = [...availableCards];

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

  return shuffled.slice(0, quantity);
}

function createGameSummary(game: {
  id: string;
  joinCode: string;
  playlistName: string;
  status: string;
  bingoPattern: string;
  playlistTrackCount: number;
}) {
  return {
    id: game.id,
    joinCode: game.joinCode,
    playlistName: game.playlistName,
    status: game.status,
    bingoPattern: game.bingoPattern,
    playlistTrackCount: game.playlistTrackCount,
  };
}

function createAvailabilitySummary(
  totalCards: number,
  gameId: string
) {
  const assignedCount =
    getAssignedCardIds(gameId).size;

  return {
    totalCards,
    assignedCards: assignedCount,
    remainingCards: Math.max(
      0,
      totalCards - assignedCount
    ),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const joinCode = normalizeJoinCode(body.joinCode);
    const playerName = normalizePlayerName(body.playerName);
    const cardQuantity = normalizeCardQuantity(
      body.cardQuantity ?? 1
    );

    const requestedPlayerId =
      typeof body.playerId === "string"
        ? body.playerId.trim()
        : "";

    if (!joinCode) {
      return NextResponse.json(
        { ok: false, message: "Enter a game code." },
        { status: 400 }
      );
    }

    if (!playerName) {
      return NextResponse.json(
        { ok: false, message: "Enter your name." },
        { status: 400 }
      );
    }

    if (!cardQuantity) {
      return NextResponse.json(
        {
          ok: false,
          message: "Choose 1, 2, 3, 5, or 10 cards.",
          pricing: PRICING,
        },
        { status: 400 }
      );
    }

    const game = getGameByJoinCode(joinCode);

    if (!game) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Game not found. Check the code or ask the host to create a new game.",
        },
        { status: 404 }
      );
    }

    if (game.status === "completed") {
      return NextResponse.json(
        {
          ok: false,
          message: "This game has already ended.",
        },
        { status: 409 }
      );
    }

    const cards = Array.isArray(game.cards)
      ? game.cards
      : [];

    if (cards.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "This game does not have any bingo cards available.",
        },
        { status: 409 }
      );
    }

    const playerId =
      requestedPlayerId || randomUUID();

    const existingAssignment =
      getExistingAssignment(game.id, playerId);

    if (existingAssignment) {
      const existingCards = existingAssignment.cardIds
        .map(
          (cardId) =>
            cards.find((card) => card.id === cardId) ?? null
        )
        .filter(
          (card): card is BingoCard => card !== null
        );

      if (
        existingCards.length ===
        existingAssignment.cardIds.length
      ) {
        return NextResponse.json({
          ok: true,
          rejoined: true,
          player: existingAssignment,
          game: createGameSummary(game),
          cards: existingCards,
          card: existingCards[0] ?? null,
          pricing: {
            quantity: existingAssignment.cardQuantity,
            amountCents: existingAssignment.amountCents,
          },
          availability: createAvailabilitySummary(
            cards.length,
            game.id
          ),
        });
      }

      assignmentStore.delete(
        assignmentKey(game.id, playerId)
      );
    }

    const availableCards = getAvailableCards(
      cards,
      game.id
    );

    if (availableCards.length < cardQuantity) {
      return NextResponse.json(
        {
          ok: false,
          message:
            availableCards.length === 0
              ? "This game is sold out."
              : `Only ${availableCards.length} card${
                  availableCards.length === 1
                    ? " is"
                    : "s are"
                } still available.`,
          availableCardCount: availableCards.length,
        },
        { status: 409 }
      );
    }

    const selectedCards = selectRandomCards(
      availableCards,
      cardQuantity
    );

    const assignment: PlayerAssignment = {
      playerId,
      playerName,
      gameId: game.id,
      joinCode: game.joinCode,
      purchaseId: randomUUID(),
      cardIds: selectedCards.map((card) => card.id),
      cardQuantity,
      amountCents: PRICING[cardQuantity],
      joinedAt: new Date().toISOString(),
    };

    assignmentStore.set(
      assignmentKey(game.id, playerId),
      assignment
    );

    return NextResponse.json({
      ok: true,
      rejoined: false,
      player: assignment,
      game: createGameSummary(game),
      cards: selectedCards,
      card: selectedCards[0] ?? null,
      pricing: {
        quantity: cardQuantity,
        amountCents: PRICING[cardQuantity],
      },
      availability: createAvailabilitySummary(
        cards.length,
        game.id
      ),
    });
  } catch (error) {
    console.error("Unable to join game:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to join the game.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown join error",
      },
      { status: 500 }
    );
  }
}


