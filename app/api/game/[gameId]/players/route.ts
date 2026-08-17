// BTTB_PLAYER_SESSION_SECURITY_V1
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { listPlayers } from "@/lib/game/player-repository";
import { findGameById } from "@/lib/game/repository";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WINNER_PERCENT = 70;

function normalizePercent(value: string | null): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_WINNER_PERCENT;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(parsed))
  );
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      gameId: string;
    }>;
  }
) {
  try {
    const { gameId } = await context.params;

    const { isAuthenticated, userId } =
      await auth();

    if (!isAuthenticated || !userId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Host authentication is required.",
        },
        { status: 401 }
      );
    }

    const ownedGame = await prisma.game.findFirst({
      where: {
        id: gameId,
        host: {
          clerkId: userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!ownedGame) {
      return NextResponse.json(
        {
          ok: false,
          message: "Game not found for this host.",
        },
        { status: 404 }
      );
    }

    const game = await findGameById(gameId);

    if (!game) {
      return NextResponse.json(
        {
          ok: false,
          message: "Game not found.",
        },
        { status: 404 }
      );
    }

    const roster = await listPlayers(gameId);

    const winnerPercent = normalizePercent(
      request.nextUrl.searchParams.get(
        "winnerPercent"
      )
    );

    const hostPercent = 100 - winnerPercent;

    const winnerPayoutCents = Math.round(
      roster.totals.totalPotCents *
        (winnerPercent / 100)
    );

    const hostPayoutCents =
      roster.totals.totalPotCents -
      winnerPayoutCents;

    return NextResponse.json({
      ok: true,
      game: {
        id: game.id,
        joinCode: game.joinCode,
        playlistName: game.playlistName,
        status: game.status,
      },
      players: roster.players,
      activities: roster.activities,
      totals: roster.totals,
      payout: {
        winnerPercent,
        hostPercent,
        totalPotCents:
          roster.totals.totalPotCents,
        winnerPayoutCents,
        hostPayoutCents,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Unable to load game players:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to load the player roster.",
      },
      { status: 500 }
    );
  }
}
