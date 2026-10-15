import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyCompanionToken } from "@/lib/companion/session";
import {
  sanitizeCompanionDetection,
  sanitizeCompanionPlaylist,
  sanitizeLibraryLabels,
  SELECTED_CRATE_TTL_MS,
} from "@/lib/companion/library";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ")
    ? value.slice(7).trim()
    : "";
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function POST(request: NextRequest) {
  const token = bearer(request);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Pairing credential required." },
      { status: 401 }
    );
  }

  const session = await verifyCompanionToken(token);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        disconnected: true,
        error: "Companion pairing expired or was revoked.",
      },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null) as
    | {
        playlists?: unknown;
        currentTrack?: unknown;
        libraryLabels?: unknown;
      }
    | null;

  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Sync body is required." },
      { status: 400 }
    );
  }

  // Old Companion builds pushed every crate's tracks. Refuse those uploads
  // rather than quietly accepting private library contents.
  if (Array.isArray(body.playlists) && body.playlists.some(
    value => value && typeof value === "object" &&
      "tracks" in value && Array.isArray(value.tracks) && value.tracks.length > 0
  )) {
    return NextResponse.json(
      { ok: false, error: "Update BTTB Companion: library-wide track uploads are no longer supported." },
      { status: 426 }
    );
  }

  const playlists = Array.isArray(body.playlists)
    ? body.playlists
        .map(sanitizeCompanionPlaylist)
        .filter((playlist): playlist is NonNullable<typeof playlist> =>
          Boolean(playlist)
        )
        .slice(0, 500)
        // Never retain unselected crate tracks, including from older Companions.
        .map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          trackCount: playlist.trackCount,
          tracks: [],
        }))
    : null;

  const currentTrack =
    body.currentTrack === null
      ? null
      : sanitizeCompanionDetection(body.currentTrack);

  const libraryLabels = sanitizeLibraryLabels(body.libraryLabels);
  const now = new Date();

  const existing =
    await prisma.companionLibrarySnapshot.findUnique({
      where: {
        clerkId_deviceId_provider: {
          clerkId: session.clerkId,
          deviceId: session.deviceId,
          provider: "serato",
        },
      },
    });

  if (!existing && !playlists) {
    return NextResponse.json(
      { ok: false, error: "Initial sync must include playlists." },
      { status: 400 }
    );
  }

  // Purge interrupted transfers on the normal sync loop.
  await prisma.companionLibrarySnapshot.updateMany({
    where: {
      clerkId: session.clerkId,
      deviceId: session.deviceId,
      provider: "serato",
      requestedPlaylistAt: {
        lt: new Date(now.getTime() - SELECTED_CRATE_TTL_MS),
      },
    },
    data: {
      requestedPlaylistId: null,
      requestedPlaylistAt: null,
      selectedPlaylist: Prisma.JsonNull,
      selectedPlaylistAt: null,
    },
  });

  await prisma.$transaction([
    prisma.companionSession.update({
      where: { id: session.id },
      data: { lastHeartbeatAt: now },
    }),
    prisma.companionLibrarySnapshot.upsert({
      where: {
        clerkId_deviceId_provider: {
          clerkId: session.clerkId,
          deviceId: session.deviceId,
          provider: "serato",
        },
      },
      create: {
        clerkId: session.clerkId,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        provider: "serato",
        playlists: json(playlists ?? []),
        libraryLabels: json(libraryLabels),
        currentTrack:
          currentTrack === null
            ? Prisma.JsonNull
            : json(currentTrack),
        lastLibrarySyncAt: now,
        lastTrackSyncAt: now,
      },
      update: {
        ...(playlists
          ? {
              playlists: json(playlists),
              libraryLabels: json(libraryLabels),
              lastLibrarySyncAt: now,
            }
          : {}),
        currentTrack:
          currentTrack === null
            ? Prisma.JsonNull
            : json(currentTrack),
        lastTrackSyncAt: now,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    connected: true,
    playlistCount:
      playlists?.length ??
      (Array.isArray(existing?.playlists)
        ? existing.playlists.length
        : 0),
  });
}
