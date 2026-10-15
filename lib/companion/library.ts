import path from "node:path";
import { prisma } from "@/lib/prisma";
import { COMPANION_HEARTBEAT_TTL_MS } from "./session";
import type { DjDetection, DjPlaylist, DjTrack } from "@/lib/dj/types";

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sanitizeCompanionTrack(value: unknown): DjTrack | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, 300);
  const sourceTrackId = text(row.sourceTrackId, 500) || id;
  const title = text(row.title, 500);
  const artist = text(row.artist, 500) || "Unknown Artist";
  if (!id || !title) return null;
  const fileName = path.basename(text(row.fileName, 500) || text(row.filePath, 1000));
  return {
    id,
    source: "serato",
    sourceTrackId,
    title,
    artist,
    album: text(row.album, 500) || undefined,
    version: text(row.version, 200) || undefined,
    duration: numberOrNull(row.duration) ?? undefined,
    key: text(row.key, 100) || undefined,
    bpm: numberOrNull(row.bpm),
    filePath: "",
    fileName,
  };
}

export function sanitizeCompanionPlaylist(value: unknown): DjPlaylist | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, 500);
  const name = text(row.name, 500);
  if (!id || !name) return null;
  const tracks = Array.isArray(row.tracks)
    ? row.tracks.map(sanitizeCompanionTrack).filter((track): track is DjTrack => Boolean(track))
    : [];
  const count = numberOrNull(row.trackCount);
  const trackCount = count !== null && Number.isInteger(count) && count >= 0
    ? Math.min(count, 100_000)
    : tracks.length;
  return { id, name, filePath: "", trackCount, tracks };
}

export function sanitizeCompanionDetection(value: unknown): DjDetection | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, 500);
  const title = text(row.title, 500);
  const artist = text(row.artist, 500) || "Unknown Artist";
  if (!id || !title) return null;
  return {
    id,
    title,
    artist,
    displayText: text(row.displayText, 1000) || `${artist} - ${title}`,
    playedAtText: text(row.playedAtText, 100) || null,
  };
}

export function sanitizeLibraryLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => text(item, 200))
    .filter(Boolean)
    .slice(0, 64);
}

export async function activeCompanionSnapshot(clerkId: string, provider = "serato") {
  const cutoff = new Date(Date.now() - COMPANION_HEARTBEAT_TTL_MS);
  const session = await prisma.companionSession.findFirst({
    where: { clerkId, isActive: true, lastHeartbeatAt: { gte: cutoff } },
    orderBy: { lastHeartbeatAt: "desc" },
  });
  if (!session) return null;
  return prisma.companionLibrarySnapshot.findUnique({
    where: { clerkId_deviceId_provider: { clerkId, deviceId: session.deviceId, provider } },
  });
}

// Selected-crate payloads are short lived and never include audio or local paths.
export const SELECTED_CRATE_TTL_MS = 2 * 60_000;

export async function companionSelectedPlaylist(clerkId: string, playlistId: string) {
  const snapshot = await activeCompanionSnapshot(clerkId, "serato");
  if (!snapshot) return { connected: false as const, playlist: null, snapshot: null };

  const listings = Array.isArray(snapshot.playlists) ? snapshot.playlists : [];
  if (!listings.some(row => sanitizeCompanionPlaylist(row)?.id === playlistId)) {
    return { connected: true as const, missing: true, playlist: null, snapshot };
  }

  const fresh = Boolean(
    snapshot.requestedPlaylistId === playlistId &&
    snapshot.selectedPlaylistAt &&
    Date.now() - snapshot.selectedPlaylistAt.getTime() < SELECTED_CRATE_TTL_MS
  );
  return {
    connected: true as const,
    missing: false,
    playlist: fresh ? sanitizeCompanionPlaylist(snapshot.selectedPlaylist) : null,
    snapshot,
  };
}

export async function companionPlaylists(clerkId: string): Promise<DjPlaylist[] | null> {
  const snapshot = await activeCompanionSnapshot(clerkId, "serato");
  if (!snapshot) return null;
  const rows = Array.isArray(snapshot.playlists) ? snapshot.playlists : [];
  return rows.map(sanitizeCompanionPlaylist).filter((playlist): playlist is DjPlaylist => Boolean(playlist));
}

export async function companionPlaylist(clerkId: string, playlistId: string) {
  const playlists = await companionPlaylists(clerkId);
  return playlists?.find(playlist => playlist.id === playlistId) ?? null;
}

export async function companionNowPlaying(clerkId: string) {
  const snapshot = await activeCompanionSnapshot(clerkId, "serato");
  return snapshot ? sanitizeCompanionDetection(snapshot.currentTrack) : null;
}

export async function companionLibraryLabels(clerkId: string) {
  const snapshot = await activeCompanionSnapshot(clerkId, "serato");
  return snapshot ? sanitizeLibraryLabels(snapshot.libraryLabels) : [];
}