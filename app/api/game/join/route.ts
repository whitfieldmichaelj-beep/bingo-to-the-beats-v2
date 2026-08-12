// BTTB_PLAYER_SESSION_SECURITY_V1
import { NextRequest, NextResponse } from "next/server";

import { findGameByJoinCode } from "@/lib/game/repository";
import {
  createPlayerSessionToken,
  readPlayerSession,
  setPlayerSessionCookie,
} from "@/lib/auth/player-session";
import {
  CARD_PRICING,
  getGameAvailability,
  joinPlayer,
  type CardQuantity,
} from "@/lib/game/player-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeJoinCode(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
    : "";
}

function normalizePlayerName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 50);
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

  if (
    !Number.isInteger(quantity) ||
    !(quantity in CARD_PRICING)
  ) {
    return null;
  }

  return quantity as CardQuantity;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const joinCode = normalizeJoinCode(body.joinCode);
    const playerName = normalizePlayerName(body.playerName);
    const cardQuantity = normalizeCardQuantity(
      body.cardQuantity ?? 1
    );

    if (!joinCode) {
      return NextResponse.json(
        {
          ok: false,
          message: "Enter a game code.",
        },
        { status: 400 }
      );
    }

    if (!playerName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Enter your name.",
        },
        { status: 400 }
      );
    }

    if (!cardQuantity) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Choose 1, 2, 3, 5, or 10 cards.",
          pricing: CARD_PRICING,
        },
        { status: 400 }
      );
    }

    const game = await findGameByJoinCode(joinCode);

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

    const trustedPlayerSession =
      await readPlayerSession(request);

    if (game.status === "completed") {
      return NextResponse.json(
        {
          ok: false,
          message: "This game has already ended.",
        },
        { status: 409 }
      );
    }

    const result = await joinPlayer({
      gameId: game.id,
      joinCode: game.joinCode,
      playerId:
        trustedPlayerSession?.playerId,
      playerName,
      quantity: cardQuantity,
    });

    if ("soldOut" in result && result.soldOut) {
      const available = result.availableCardCount;

      return NextResponse.json(
        {
          ok: false,
          message:
            available === 0
              ? "This game is sold out."
              : `Only ${available} card${
                  available === 1 ? " is" : "s are"
                } still available.`,
          availableCardCount: available,
        },
        { status: 409 }
      );
    }

    const availability = await getGameAvailability(
      game.id
    );

    const response = NextResponse.json({
      ok: true,
      rejoined: result.rejoined,
      player: result.assignment,
      game: createGameSummary(game),
      cards: result.cards,
      card: result.cards[0] ?? null,
      pricing: {
        quantity: result.assignment.cardQuantity,
        amountCents: result.assignment.amountCents,
      },
      availability,
    });

    const playerSessionToken =
      await createPlayerSessionToken(
        result.assignment.playerId
      );

    setPlayerSessionCookie(
      response,
      playerSessionToken
    );

    return response;
  } catch (error) {
    console.error("Unable to join game:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to join the game.",
      },
      { status: 500 }
    );
  }
}
