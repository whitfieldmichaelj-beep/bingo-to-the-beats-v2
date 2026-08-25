// BTTB_PLAYER_SESSION_SECURITY_V1
import { auth } from "@clerk/nextjs/server";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { readPlayerSession } from "@/lib/auth/player-session";
import {
  getPlayerClaim,
  listHostClaims,
  reviewBingoClaim,
  submitBingoClaim,
} from "@/lib/game/bingo-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { gameId } = await context.params;
    const body = await request.json();

    const cardId =
      typeof body.cardId === "string"
        ? body.cardId.trim()
        : "";

    const requestedPlayerId =
      typeof body.playerId === "string"
        ? body.playerId.trim()
        : "";

    const playerSession =
      await readPlayerSession(request);

    if (!playerSession) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "A valid player session is required.",
        },
        {
          status: 401,
        }
      );
    }

    if (!gameId || !cardId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "gameId and cardId are required.",
        },
        {
          status: 400,
        }
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
            "The player session does not match this claim.",
        },
        {
          status: 403,
        }
      );
    }

    const result = await submitBingoClaim(
      gameId,
      cardId,
      playerSession.playerId
    );

    if (!result.ok) {
      return NextResponse.json(
        result,
        {
          status:
            result.code === "NOT_VERIFIED" ||
            result.code === "GAME_COMPLETED"
              ? 409
              : 403,
        }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Unable to submit BINGO claim:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to submit the BINGO claim.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { gameId } = await context.params;

    const cardId =
      request.nextUrl.searchParams.get("cardId");

    const playerId =
      request.nextUrl.searchParams.get("playerId");

    if (cardId) {
      const playerSession =
        await readPlayerSession(request);

      if (!playerSession) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "A valid player session is required.",
          },
          {
            status: 401,
          }
        );
      }

      if (
        playerId &&
        playerId !== playerSession.playerId
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "The player session does not match this claim.",
          },
          {
            status: 403,
          }
        );
      }

      const claim = await getPlayerClaim(
        gameId,
        cardId,
        playerSession.playerId
      );

      return NextResponse.json({
        ok: true,
        claim,
      });
    }

    const {
      isAuthenticated,
      userId,
    } = await auth();

    if (!isAuthenticated || !userId) {
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

    const claims = await listHostClaims(
      gameId,
      userId
    );

    if (!claims) {
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

    return NextResponse.json({
      ok: true,
      claims,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Unable to load BINGO claims:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to load BINGO claims.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { gameId } = await context.params;

    const {
      isAuthenticated,
      userId,
    } = await auth();

    if (!isAuthenticated || !userId) {
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

    const body = await request.json();

    const claimId =
      typeof body.claimId === "string"
        ? body.claimId.trim()
        : "";

    const action =
      body.action === "verify" ||
      body.action === "reject"
        ? body.action
        : null;

    if (!claimId || !action) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "claimId and a valid action are required.",
        },
        {
          status: 400,
        }
      );
    }

    const result = await reviewBingoClaim(
      gameId,
      claimId,
      userId,
      action
    );

    if (!result.ok) {
      return NextResponse.json(
        result,
        {
          status:
            result.code === "NOT_HOST"
              ? 403
              : result.code === "CLAIM_NOT_FOUND"
                ? 404
                : 409,
        }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Unable to review BINGO claim:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to review the BINGO claim.",
      },
      {
        status: 500,
      }
    );
  }
}
