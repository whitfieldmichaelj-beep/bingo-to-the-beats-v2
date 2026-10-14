import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mountedMusicVolumes } from "./locations";

const FILESYSTEM_TIMEOUT_MS = 3000;

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs = FILESYSTEM_TIMEOUT_MS
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Filesystem operation timed out after ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      operation,
      timeout,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function fileExists(
  filePath: string
): Promise<boolean> {
  try {
    await withTimeout(fs.access(filePath));
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(
  directoryPath: string
): Promise<boolean> {
  try {
    const stats = await withTimeout(
      fs.stat(directoryPath)
    );

    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function addSeratoLibrary(
  locations: Set<string>,
  candidatePath: string
): Promise<void> {
  if (!(await isDirectory(candidatePath))) {
    return;
  }

  let resolvedPath = candidatePath;

  try {
    resolvedPath = await withTimeout(
      fs.realpath(candidatePath)
    );
  } catch {
    resolvedPath = candidatePath;
  }

  locations.add(resolvedPath);
}

function getEnvironmentLibraryPaths(): string[] {
  const configuredPaths =
    process.env.SERATO_LIBRARY_PATHS?.trim();

  if (!configuredPaths) {
    return [];
  }

  return configuredPaths
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
}

function shouldScanMountedVolumes(): boolean {
  const configured =
    process.env.SERATO_SCAN_VOLUMES
      ?.trim()
      .toLowerCase();

  // DJs commonly keep Serato libraries and music on removable drives.
  // Discover mounted volumes by default; allow an explicit opt-out for
  // unusual environments where volume probing is undesirable.
  return configured !== "false";
}

async function findMountedVolumeLibraries(
  locations: Set<string>
): Promise<void> {
  const volumes = await mountedMusicVolumes();
  const candidates = volumes.flatMap((volume) => [
    path.join(volume.path, "_Serato_"),
    path.join(volume.path, "Music", "_Serato_"),
  ]);

  // Probe drives concurrently. Each probe is already bounded by
  // FILESYSTEM_TIMEOUT_MS, so a sleeping/disconnected volume cannot make
  // startup wait serially across every mounted drive or Windows drive letter.
  await Promise.all(
    candidates.map((candidatePath) =>
      addSeratoLibrary(
        locations,
        candidatePath
      )
    )
  );
}

export async function findSeratoLibraries(): Promise<
  string[]
> {
  const locations = new Set<string>();

  const localLibraryPath = path.join(
    os.homedir(),
    "Music",
    "_Serato_"
  );

  await addSeratoLibrary(
    locations,
    localLibraryPath
  );

  for (const configuredPath of getEnvironmentLibraryPaths()) {
    await addSeratoLibrary(
      locations,
      configuredPath
    );
  }

  /*
   * Mounted drives are scanned automatically because many DJs keep Serato
   * libraries and music on removable storage. Filesystem probes are bounded
   * by a timeout and run concurrently so a sleeping or disconnected drive
   * cannot block startup for each volume in sequence.
   *
   * Set SERATO_SCAN_VOLUMES=false to opt out in unusual environments.
   * SERATO_LIBRARY_PATHS can still pin one or more exact library paths.
   */
  if (shouldScanMountedVolumes()) {
    await findMountedVolumeLibraries(
      locations
    );
  }

  const discoveredLibraries =
    Array.from(locations);

  console.log(
    "Serato libraries found:",
    discoveredLibraries
  );

  return discoveredLibraries;
}