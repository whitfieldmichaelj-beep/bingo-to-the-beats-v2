import { auth } from "@clerk/nextjs/server";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  findGameById,
} from "@/lib/game/repository";

import {
  prisma,
} from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest
) {
  try {
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

    const gameId = request.nextUrl.searchParams.get("gameId")?.trim();
    if (!gameId) {
      return NextResponse.json({ ok: false, message: "Game ID is required." }, { status: 400 });
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

    const game =
      await findGameById(
        ownedGame.id
      );

    if (!game) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Game could not be restored.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      game,
    });
  } catch (error) {
    console.error(
      "Unable to restore game:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to restore the game.",
      },
      {
        status: 500,
      }
    );
  }
}
