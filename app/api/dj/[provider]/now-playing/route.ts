import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { localLibraryAccessResponse } from "@/lib/auth/local-library";
import {
  activeCompanionSnapshot,
  sanitizeCompanionDetection,
} from "@/lib/companion/library";
import {
  HostAccessError,
  requireGameHostAccess,
} from "@/lib/billing/access";
import { getDjAdapter } from "@/lib/dj/bridge";
import {
  isDjProvider,
  DJ_PROVIDERS,
} from "@/lib/dj/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        live: false,
        track: null,
        message: "Sign in to connect DJ playback.",
      },
      { status: 401 }
    );
  }

  const { provider } = await context.params;
  if (!isDjProvider(provider)) {
    return NextResponse.json(
      { ok: false, message: "Unknown DJ software." },
      { status: 400 }
    );
  }

  const gameId = request.nextUrl.searchParams.get("gameId");
  if (!gameId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Load a game before connecting.",
      },
      { status: 400 }
    );
  }

  try {
    await requireGameHostAccess(
      gameId,
      userId,
      provider
    );

    if (provider === "serato") {
      const snapshot =
        await activeCompanionSnapshot(userId, "serato");

      if (snapshot) {
        const track =
          sanitizeCompanionDetection(
            snapshot.currentTrack
          );

        return NextResponse.json(
          {
            ok: true,
            source: "companion",
            live: Boolean(track),
            track,
            tracks: track ? [track] : [],
            message:
              "Serato Companion connected. Waiting for a new song.",
          },
          {
            headers: {
              "Cache-Control": "no-store",
            },
          }
        );
      }
    }

    const denied =
      await localLibraryAccessResponse();
    if (denied) return denied;

    const track =
      await (await getDjAdapter(provider))
        .nowPlaying();

    return NextResponse.json(
      {
        ok: true,
        source: "local",
        live: Boolean(track),
        track,
        tracks: track ? [track] : [],
        message:
          `${DJ_PROVIDERS[provider].name} local history connected. Waiting for a new song.`,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        live: false,
        track: null,
        message:
          error instanceof HostAccessError
            ? error.message
            : "Local DJ connection unavailable. Open the selected software and check library access.",
      },
      {
        status:
          error instanceof HostAccessError
            ? error.status
            : 503,
      }
    );
  }
}
