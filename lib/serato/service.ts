import { findSeratoLibraries } from "./finder";
import { readSeratoLibrary } from "./parser";
import type {
  SeratoLibrary,
  SeratoResult,
} from "./types";

// Loading an entire Serato library is expensive on large DJ collections.
// Reuse one in-flight scan across crate lookups and briefly cache its result,
// rather than reparsing the same database once for every crate.
const LIBRARY_CACHE_MS = 30_000;
let libraryCache: {
  promise: Promise<SeratoResult>;
  settledAt: number;
} | null = null;

async function readAllSeratoLibraries(): Promise<SeratoResult> {
  const seratoPaths = await findSeratoLibraries();

  const results = await Promise.all(
    seratoPaths.map((seratoPath) =>
      readSeratoLibrary(seratoPath)
    )
  );

  const libraries: SeratoLibrary[] = results.filter(
    (library): library is SeratoLibrary =>
      library !== null
  );

  const totalTracks = libraries.reduce(
    (total, library) => total + library.trackCount,
    0
  );

  return {
    ok: libraries.length > 0,
    libraryCount: libraries.length,
    totalTracks,
    libraries,
  };
}

export function getSeratoLibrary(): Promise<SeratoResult> {
  if (
    libraryCache &&
    (libraryCache.settledAt === 0 ||
      Date.now() - libraryCache.settledAt < LIBRARY_CACHE_MS)
  ) {
    return libraryCache.promise;
  }

  const entry = {
    promise: readAllSeratoLibraries(),
    settledAt: 0,
  };
  libraryCache = entry;
  void entry.promise.then(
    () => {
      entry.settledAt = Date.now();
    },
    () => {
      if (libraryCache === entry) libraryCache = null;
    }
  );
  return entry.promise;
}