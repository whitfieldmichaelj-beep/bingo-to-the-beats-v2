// BTTB_PLAYER_SESSION_SECURITY_V1
import { NextRequest, NextResponse } from "next/server";

import { readPlayerSession } from "@/lib/auth/player-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const gameId = normalizeString(body.gameId);
    const requestedPlayerId =
      normalizeString(body.playerId);
    const connected = body.connected !== false;

    const playerSession =
      await readPlayerSession(request);

    if (!playerSession) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "A valid player session is required.",
        },
        { status: 401 }
      );
    }

    if (!gameId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Game ID is required.",
        },
        { status: 400 }
      );
    }

    if (
      requestedPlayerId &&
      requestedPlayerId !== playerSession.playerId
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "The player session does not match this request.",
        },
        { status: 403 }
      );
    }

    const game =
      await prisma.game.findUnique({
        where: {
          id: gameId,
        },
        select: {
          status: true,
        },
      });

    if (!game) {
      return NextResponse.json(
        {
          ok: false,
          message: "Game not found.",
        },
        { status: 404 }
      );
    }

    /*
     * BTTB_END_GAME_PLAYER_SHUTDOWN_V1
     *
     * Once the host completes a game, a player heartbeat
     * must never keep that player marked online.
     */
    const effectiveConnected =
      game.status === "COMPLETED"
        ? false
        : connected;

    const result =
      await prisma.gameSession.updateMany({
        where: {
          gameId,
          sessionKey: playerSession.playerId,
        },
        data: {
          connected: effectiveConnected,
          lastSeenAt: new Date(),
        },
      });

    if (result.count === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Player session not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      connected: effectiveConnected,
      gameStatus: game.status,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Unable to update player presence:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to update player presence.",
      },
      { status: 500 }
    );
  }
}
