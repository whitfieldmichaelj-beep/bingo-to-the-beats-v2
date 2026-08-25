import { auth } from "@clerk/nextjs/server";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { updateGame } from "@/lib/game/repository";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: Context
) {
  try {
    const { gameId } =
      await context.params;

    const {
      isAuthenticated,
      userId,
    } = await auth();

    if (
      !isAuthenticated ||
      !userId
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Host authentication is required.",
        },
        {
          status: 401,
        }
      );
    }

    const ownedGame =
      await prisma.game.findFirst({
        where: {
          id: gameId,
          host: {
            clerkId:
              userId,
          },
        },
        select: {
          id: true,
          status: true,
          completedAt: true,
        },
      });

    if (!ownedGame) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Game not found for this host.",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      (await request.json()) as {
        status?: string;
      };

    if (
      body.status !==
      "completed"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Unsupported game status.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      ownedGame.status ===
      "COMPLETED"
    ) {
      return NextResponse.json({
        ok: true,
        game: {
          id: ownedGame.id,
          status: "completed",
          completedAt:
            ownedGame.completedAt?.toISOString() ??
            null,
        },
      });
    }

    const completedAt =
      new Date().toISOString();

    const game =
      await updateGame(
        gameId,
        (currentGame) => ({
          ...currentGame,
          status: "completed",
          completedAt,
        })
      );

    if (!game) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Game not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      game: {
        id: game.id,
        status: game.status,
        completedAt:
          game.completedAt,
      },
    });
  } catch (error) {
    console.error(
      "Unable to update game status:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to update game status.",
      },
      {
        status: 500,
      }
    );
  }
}
