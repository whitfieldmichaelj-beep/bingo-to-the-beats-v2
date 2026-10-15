import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyCompanionToken } from "@/lib/companion/session";
import { sanitizeCompanionPlaylist, SELECTED_CRATE_TTL_MS } from "@/lib/companion/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pairing(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token ? verifyCompanionToken(token) : null;
}

function response(value: object, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// The paired DJ computer polls for the ONE crate currently requested by its host.
export async function GET(request: NextRequest) {
  const session = await pairing(request);
  if (!session) return response({ ok: false, error: "Companion pairing required." }, 401);

  const row = await prisma.companionLibrarySnapshot.findUnique({
    where: {
      clerkId_deviceId_provider: {
        clerkId: session.clerkId, deviceId: session.deviceId, provider: "serato",
      },
    },
  });
  const fresh = row?.requestedPlaylistAt &&
    Date.now() - row.requestedPlaylistAt.getTime() < SELECTED_CRATE_TTL_MS;
  return response({
    ok: true,
    playlistId: fresh && !row?.selectedPlaylistAt ? row?.requestedPlaylistId : null,
  });
}

// Only an authenticated Companion can fulfill a host-initiated crate request.
export async function POST(request: NextRequest) {
  const session = await pairing(request);
  if (!session) return response({ ok: false, error: "Companion pairing required." }, 401);

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2_000_000) return response({ ok: false, error: "Selected crate is too large." }, 413);
  const payload = await request.json().catch(() => null) as { playlist?: unknown } | null;
  const source = payload?.playlist;
  if (!source || typeof source !== "object") {
    return response({ ok: false, error: "Selected crate required." }, 400);
  }
  const rawTracks = (source as { tracks?: unknown }).tracks;
  if (!Array.isArray(rawTracks) || rawTracks.length === 0 || rawTracks.length > 2000) {
    return response({ ok: false, error: "Selected crate requires 1 to 2000 songs." }, 400);
  }
  const playlist = sanitizeCompanionPlaylist(source);
  if (!playlist || !playlist.tracks.length) {
    return response({ ok: false, error: "No valid songs were found." }, 400);
  }

  const now = new Date();
  const result = await prisma.companionLibrarySnapshot.updateMany({
    where: {
      clerkId: session.clerkId,
      deviceId: session.deviceId,
      provider: "serato",
      requestedPlaylistId: playlist.id,
      requestedPlaylistAt: { gte: new Date(now.getTime() - SELECTED_CRATE_TTL_MS) },
      selectedPlaylistAt: null,
    },
    data: {
      selectedPlaylist: JSON.parse(JSON.stringify(playlist)) as Prisma.InputJsonValue,
      selectedPlaylistAt: now,
    },
  });
  if (result.count !== 1) {
    return response({ ok: false, error: "That crate was not requested or has expired." }, 409);
  }
  return response({ ok: true, trackCount: playlist.tracks.length });
}
