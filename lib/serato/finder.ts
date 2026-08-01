import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
  return (
    process.env.SERATO_SCAN_VOLUMES
      ?.trim()
      .toLowerCase() === "true"
  );
}

async function findMountedVolumeLibraries(
  locations: Set<string>
): Promise<void> {
  const volumesPath = "/Volumes";

  if (!(await isDirectory(volumesPath))) {
    return;
  }

  let volumeNames: string[];

  try {
    volumeNames = await withTimeout(
      fs.readdir(volumesPath)
    );
  } catch (error) {
    console.warn(
      "Unable to read mounted macOS volumes:",
      error
    );

    return;
  }

  for (const volumeName of volumeNames) {
    if (
      !volumeName ||
      volumeName.startsWith(".")
    ) {
      continue;
    }

    const volumePath = path.join(
      volumesPath,
      volumeName
    );

    if (!(await isDirectory(volumePath))) {
      continue;
    }

    await addSeratoLibrary(
      locations,
      path.join(
        volumePath,
        "_Serato_"
      )
    );

    await addSeratoLibrary(
      locations,
      path.join(
        volumePath,
        "Music",
        "_Serato_"
      )
    );
  }
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
   * Mounted drives are not scanned automatically because
   * sleeping, disconnected, network, or cloud volumes can
   * cause filesystem requests to hang.
   *
   * To enable automatic volume scanning, add this to
   * .env.local:
   *
   * SERATO_SCAN_VOLUMES=true
   *
   * The safer option is to specify the exact path:
   *
   * SERATO_LIBRARY_PATHS=/Volumes/My Drive/_Serato_
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