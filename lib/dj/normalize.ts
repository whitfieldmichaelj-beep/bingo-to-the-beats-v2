import path from "node:path";
import { createHash } from "node:crypto";
import type { DjProvider } from "./providers";
import type { DjTrack } from "./types";
export function normalizeDjTrack(source: DjProvider, row: {id?: string; title?: string; artist?: string; album?: string; bpm?: number | null; filePath: string; version?: string; duration?: number; key?: string}): DjTrack {
  const sourceTrackId = row.id || row.filePath;
  const id = source === "serato" && row.id ? row.id : `${source}:${createHash("sha256").update(sourceTrackId).digest("hex").slice(0,32)}`;
  const title = row.title || path.basename(row.filePath, path.extname(row.filePath));
  const version = row.version?.trim();
  return { ...row, source, sourceTrackId, id, title: version && !title.toLowerCase().includes(version.toLowerCase()) ? `${title} (${version})` : title, artist: row.artist || "Unknown Artist", bpm: Number.isFinite(row.bpm) ? row.bpm! : null, fileName: path.basename(row.filePath) };
}
