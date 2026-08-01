import { findSeratoLibraries } from "./finder";
import { readSeratoLibrary } from "./parser";
import type {
  SeratoLibrary,
  SeratoResult,
} from "./types";

export async function getSeratoLibrary(): Promise<SeratoResult> {
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