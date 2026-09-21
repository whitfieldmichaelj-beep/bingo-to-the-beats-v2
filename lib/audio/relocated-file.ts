import { readdir } from "node:fs/promises";
import path from "node:path";

// Saved games may predate a move from Dropbox onto the DJ drive.
// Keep the complete filename (including mix and extension), and refuse ambiguity.
export async function findRelocatedAudio(storedPath: string, musicRoot: string): Promise<string | null> {
  if (!musicRoot || !storedPath.trim()) return null;
  const normalize = (name: string) => name.normalize("NFC").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = normalize(path.basename(storedPath.replace(/\\/g, "/")));
  const matches = new Set<string>();
  for (const directory of [musicRoot, path.join(musicRoot, "All Music")]) {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && !entry.name.startsWith("._") && normalize(entry.name) === wanted) {
          matches.add(path.join(directory, entry.name));
        }
      }
    } catch {
      // An unavailable directory must not prevent other candidates from loading.
    }
  }
  return matches.size === 1 ? [...matches][0] : null;
}
