import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import os from "node:os";
import { readdir, readFile, stat } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SeratoCrate = {
  name: string;
  fileName: string;
  filePath: string;
  trackCount: number;
  tracks: Array<{
    filePath: string;
    fileName: string;
  }>;
};

const AUDIO_EXTENSIONS =
  /\.(mp3|m4a|aac|wav|aiff|aif|flac|ogg|opus|wma)$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

async function isDirectory(targetPath: string) {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

function cleanCrateName(fileName: string) {
  return fileName.replace(/\.crate$/i, "");
}

function normalizeTrackPath(rawValue: string) {
  return rawValue
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .replace(/^file:\/\//i, "")
    .replace(/^\/+Volumes\//i, "/Volumes/")
    .trim();
}

function collectAudioPaths(text: string) {
  const results = new Set<string>();

  const patterns = [
    /(?:\/Volumes\/|\/Users\/|[A-Za-z]:\/)[^\u0000\r\n"'<>]+?\.(?:mp3|m4a|aac|wav|aiff|aif|flac|ogg|opus|wma)/gi,
    /[^\u0000\r\n"'<>]{2,}?\.(?:mp3|m4a|aac|wav|aiff|aif|flac|ogg|opus|wma)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = normalizeTrackPath(match[0]);

      if (
        candidate.length >= 5 &&
        candidate.length <= 2048 &&
        AUDIO_EXTENSIONS.test(candidate)
      ) {
        results.add(candidate);
      }
    }
  }

  return results;
}

function decodeUtf16Be(buffer: Buffer) {
  const evenLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(evenLength);

  for (let index = 0; index < evenLength; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }

  return swapped.toString("utf16le");
}

function extractTrackPaths(buffer: Buffer) {
  const paths = new Set<string>();

  const decodedVersions = [
    buffer.toString("utf8"),
    buffer.toString("latin1"),
    buffer.toString("utf16le"),
    decodeUtf16Be(buffer),
  ];

  for (const decoded of decodedVersions) {
    for (const trackPath of collectAudioPaths(decoded)) {
      paths.add(trackPath);
    }
  }

  return [...paths];
}

function allowedLibraryRoots() {
  return [
    path.join(os.homedir(), "Music", "_Serato_"),
    "/Volumes",
  ];
}

function isAllowedSeratoPath(candidatePath: string) {
  const resolved = path.resolve(candidatePath);

  const localRoot = path.resolve(
    path.join(os.homedir(), "Music", "_Serato_")
  );

  if (
    resolved === localRoot ||
    resolved.startsWith(`${localRoot}${path.sep}`)
  ) {
    return true;
  }

  const volumesRoot = path.resolve("/Volumes");

  return (
    resolved.startsWith(`${volumesRoot}${path.sep}`) &&
    resolved.split(path.sep).includes("_Serato_")
  );
}

async function readCrate(cratePath: string): Promise<SeratoCrate> {
  const fileName = path.basename(cratePath);
  const buffer = await readFile(cratePath);
  const trackPaths = extractTrackPaths(buffer);

  return {
    name: cleanCrateName(fileName),
    fileName,
    filePath: cratePath,
    trackCount: trackPaths.length,
    tracks: trackPaths.map((trackPath) => ({
      filePath: trackPath,
      fileName: path.basename(trackPath),
    })),
  };
}

export async function GET(request: NextRequest) {
  const requestedLibraryPath =
    request.nextUrl.searchParams.get("libraryPath") ??
    path.join(os.homedir(), "Music", "_Serato_");

  const libraryPath = path.resolve(requestedLibraryPath);

  if (!isAllowedSeratoPath(libraryPath)) {
    return noStore(
      {
        ok: false,
        crates: [],
        message:
          "The requested path is not an allowed Serato library location.",
        allowedRoots: allowedLibraryRoots(),
      },
      400
    );
  }

  const subcratesPath = path.join(libraryPath, "Subcrates");

  if (!(await isDirectory(subcratesPath))) {
    return noStore(
      {
        ok: false,
        libraryPath,
        subcratesPath,
        crates: [],
        message:
          "The Serato Subcrates folder was not found at this location.",
      },
      404
    );
  }

  try {
    const entries = await readdir(subcratesPath, {
      withFileTypes: true,
    });

    const cratePaths = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.toLowerCase().endsWith(".crate")
      )
      .map((entry) =>
        path.join(subcratesPath, entry.name)
      );

    const crates = await Promise.all(
      cratePaths.map(readCrate)
    );

    crates.sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return noStore({
      ok: true,
      libraryPath,
      subcratesPath,
      crateCount: crates.length,
      totalTrackReferences: crates.reduce(
        (total, crate) => total + crate.trackCount,
        0
      ),
      crates,
      message:
        crates.length > 0
          ? `Loaded ${crates.length} Serato crate${crates.length === 1 ? "" : "s"}.`
          : "No .crate files were found in this Serato library.",
    });
  } catch (error) {
    console.error("Serato crate scan failed:", error);

    return noStore(
      {
        ok: false,
        libraryPath,
        subcratesPath,
        crates: [],
        message:
          error instanceof Error
            ? error.message
            : "BTTB could not read the Serato crates.",
      },
      500
    );
  }
}

