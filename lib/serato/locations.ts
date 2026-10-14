import os from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";

export function windowsDriveRoots() { return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => `${letter}:\\`); }

export async function mountedMusicVolumes(): Promise<{ name: string; path: string }[]> {
  if (process.platform === "win32") return windowsDriveRoots().map(root => ({ name: root, path: root }));
  if (process.platform !== "darwin") return [];
  try {
    const entries = await readdir("/Volumes", { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory() && !entry.name.startsWith(".")).map(entry => ({ name: entry.name, path: path.join("/Volumes", entry.name) }));
  } catch { return []; }
}

export function allowedSeratoPath(candidate: string, platform = process.platform, home = os.homedir(), configured = process.env.SERATO_LIBRARY_PATHS ?? "") {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const normalize = (value: string) => platform === "win32" ? paths.resolve(value).toLowerCase() : paths.resolve(value);
  const resolved = normalize(candidate);
  const roots = [paths.join(home, "Music", "_Serato_"), ...configured.split(paths.delimiter).filter(Boolean)];
  if (platform === "win32") roots.push(...windowsDriveRoots().flatMap(root => [paths.join(root, "_Serato_"), paths.join(root, "Music", "_Serato_")]));
  if (roots.some(root => resolved === normalize(root) || resolved.startsWith(normalize(root) + paths.sep))) return true;
  return platform === "darwin" && resolved.startsWith("/Volumes/") && resolved.split("/").includes("_Serato_");
}
