import { auth } from "@clerk/nextjs/server";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  findGameByJoinCode,
} from "@/lib/game/repository";

import {
  prisma,
} from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BTTB_RESTORE_EXISTING_GAME_BY_CODE_V1

function normalizeJoinCode(
  value: string
) {
  return value
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ""
    );
}

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

    const joinCode =
      normalizeJoinCode(
        request.nextUrl.searchParams.get(
          "code"
        ) ?? ""
      );

    if (!joinCode) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Game code is required.",
        },
        {
          status: 400,
        }
      );
    }

    const ownedGame =
      await prisma.game.findFirst({
        where: {
          joinCode,
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
      await findGameByJoinCode(
        joinCode
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
