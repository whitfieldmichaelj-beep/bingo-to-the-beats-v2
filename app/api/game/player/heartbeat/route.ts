// BTTB_PLAYER_SESSION_SECURITY_V1
import { NextRequest, NextResponse } from "next/server";

import { readPlayerSession } from "@/lib/auth/player-session";
import { prisma } from "@/lib/prisma";
import { hasUnavailableDispute } from "@/lib/payments/disputes";

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

    /*
     * BTTB_PLAYER_HEARTBEAT_ELIGIBILITY_V1
     *
     * Lock this player's session while checking game/payment
     * eligibility. This prevents a heartbeat from reconnecting
     * the player after a concurrent Stripe refund disconnects it.
     */
    const heartbeat =
      await prisma.$transaction(async (tx) => {
        const lockedSessions =
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "GameSession"
            WHERE "gameId" = ${gameId}
              AND "sessionKey" = ${playerSession.playerId}
            FOR UPDATE
          `;

        if (lockedSessions.length === 0) {
          return {
            sessionFound: false,
            gameFound: true,
            refunded: false,
            connected: false,
            gameStatus: null as string | null,
          };
        }

        const game =
          await tx.game.findUnique({
            where: {
              id: gameId,
            },
            select: {
              status: true,
            },
          });

        if (!game) {
          return {
            sessionFound: true,
            gameFound: false,
            refunded: false,
            connected: false,
            gameStatus: null as string | null,
          };
        }

        const purchase =
          await tx.purchase.findUnique({
            where: {
              gameId_playerKey: {
                gameId,
                playerKey:
                  playerSession.playerId,
              },
            },
            select: {
              status: true,
              disputes: {
                select: {
                  status: true,
                  fundsWithdrawn: true,
                },
              },
            },
          });

        const refunded =
          purchase?.status === "REFUNDED";

        const disputed =
          purchase
            ? hasUnavailableDispute(
                purchase.disputes
              )
            : false;

        const gameEnded =
          game.status === "COMPLETED" ||
          game.status === "CANCELLED";

        const effectiveConnected =
          gameEnded ||
          refunded ||
          disputed
            ? false
            : connected;

        await tx.gameSession.updateMany({
          where: {
            gameId,
            sessionKey:
              playerSession.playerId,
          },
          data: {
            connected:
              effectiveConnected,
            lastSeenAt: new Date(),
          },
        });

        return {
          sessionFound: true,
          gameFound: true,
          refunded,
          disputed,
          connected:
            effectiveConnected,
          gameStatus: game.status,
        };
      });

    if (!heartbeat.sessionFound) {
      return NextResponse.json(
        {
          ok: false,
          message: "Player session not found.",
        },
        { status: 404 }
      );
    }

    if (!heartbeat.gameFound) {
      return NextResponse.json(
        {
          ok: false,
          message: "Game not found.",
        },
        { status: 404 }
      );
    }

    if (heartbeat.refunded) {
      return NextResponse.json(
        {
          ok: false,
          code: "PURCHASE_REFUNDED",
          message:
            "This player's purchase has been refunded.",
          connected: false,
          gameStatus:
            heartbeat.gameStatus,
        },
        { status: 403 }
      );
    }

    if (heartbeat.disputed) {
      return NextResponse.json(
        {
          ok: false,
          code: "PURCHASE_DISPUTED",
          message:
            "This player's purchase has an active payment dispute.",
          connected: false,
          gameStatus:
            heartbeat.gameStatus,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      connected:
        heartbeat.connected,
      gameStatus:
        heartbeat.gameStatus,
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
