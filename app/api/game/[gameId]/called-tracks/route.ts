import { auth } from "@clerk/nextjs/server";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    gameId: string;
  }>;
};

function stringArray(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set<string>(
      value
        .filter(
          (
            item
          ): item is string =>
            typeof item ===
              "string" &&
            item.trim().length >
              0
        )
        .map((item) =>
          item.trim()
        )
    )
  ).slice(0, 500);
}

export async function GET(
  _request: NextRequest,
  context: Context
) {
  try {
    const { gameId } =
      await context.params;

    const tracks =
      await prisma.gameTrack.findMany({
        where: {
          gameId,
          called: true,
        },
        select: {
          id: true,
          trackId: true,
          calledAt: true,
          track: {
            select: {
              providerTrackId:
                true,
            },
          },
        },
        orderBy: {
          position: "asc",
        },
      });

    return NextResponse.json({
      ok: true,

      // CardSquare.gameTrackId -> GameTrack.id
      calledGameTrackIds:
        tracks.map(
          (track) =>
            track.id
        ),

      // CardSquare.trackId -> Track.providerTrackId
      calledTrackIds:
        tracks.map(
          (track) =>
            track.track
              .providerTrackId
        ),

      tracks:
        tracks.map((track) => ({
          gameTrackId:
            track.id,
          trackId:
            track.track
              .providerTrackId,
          databaseTrackId:
            track.trackId,
          calledAt:
            track.calledAt?.toISOString() ??
            null,
        })),
    });
  } catch (error) {
    console.error(
      "Unable to load called tracks:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to load played songs.",
      },
      {
        status: 500,
      }
    );
  }
}

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

    const game =
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

    if (!game) {
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
      await request.json();

    const gameTrackIds =
      stringArray(
        body.gameTrackIds
      );

    const providerTrackIds =
      stringArray(
        body.providerTrackIds
      );

    const byGameTrackId =
      gameTrackIds.length > 0
        ? await prisma.gameTrack.findMany({
            where: {
              gameId,
              id: {
                in:
                  gameTrackIds,
              },
            },
            select: {
              id: true,
            },
          })
        : [];

    const byProviderTrackId =
      providerTrackIds.length > 0
        ? await prisma.gameTrack.findMany({
            where: {
              gameId,
              track: {
                providerTrackId: {
                  in:
                    providerTrackIds,
                },
              },
            },
            select: {
              id: true,
            },
          })
        : [];

    const matchedIds:
      string[] =
      Array.from(
        new Set<string>([
          ...byGameTrackId.map(
            (track) =>
              track.id
          ),
          ...byProviderTrackId.map(
            (track) =>
              track.id
          ),
        ])
      );

    if (
      matchedIds.length ===
      0
    ) {
      return NextResponse.json({
        ok: true,
        matched: 0,
        updated: 0,
      });
    }

    const calledAt =
      new Date();

    const result =
      await prisma.gameTrack.updateMany({
        where: {
          gameId,
          id: {
            in:
              matchedIds,
          },
          called: false,
        },
        data: {
          called: true,
          calledAt,
          playedAt:
            calledAt,
        },
      });

    return NextResponse.json({
      ok: true,
      matched:
        matchedIds.length,
      updated:
        result.count,
      calledAt:
        calledAt.toISOString(),
    });
  } catch (error) {
    console.error(
      "Unable to record played songs:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to record played songs.",
      },
      {
        status: 500,
      }
    );
  }
}
