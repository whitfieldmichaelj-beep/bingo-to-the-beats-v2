import { createHash } from "node:crypto";
import path from "node:path";

import { getSeratoSongs } from "seratolibraryparser";

import { fileExists } from "./finder";
import type {
  SeratoLibrary,
  SeratoTrack,
} from "./types";

type ParsedSeratoSong = {
  title?: string;
  artist?: string;
  album?: string;
  bpm?: number;
  filePath?: string;
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\u0000/g, "").trim();
}

function normalizeTrackPath(filePath: string): string {
  return filePath
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .trim()
    .toLowerCase();
}

function createTrackId(
  filePath: string,
  index: number
): string {
  const normalizedPath =
    normalizeTrackPath(filePath);

  if (!normalizedPath) {
    return `serato-track-${index}`;
  }

  const pathHash = createHash("sha256")
    .update(normalizedPath)
    .digest("hex");

  return `serato-${pathHash}`;
}

export async function readSeratoLibrary(
  seratoPath: string
): Promise<SeratoLibrary | null> {
  const databasePath = path.join(
    seratoPath,
    "database V2"
  );

  if (!(await fileExists(databasePath))) {
    console.warn(
      `Serato database was not found: ${databasePath}`
    );

    return null;
  }

  const parsedSongs = await getSeratoSongs(
    databasePath
  );

  const songs = Array.isArray(parsedSongs)
    ? (parsedSongs as ParsedSeratoSong[])
    : [];

  const tracks: SeratoTrack[] = songs
    .map((song, index) => {
      const filePath = cleanText(
        song.filePath
      );

      const title = cleanText(song.title);
      const artist = cleanText(song.artist);
      const album = cleanText(song.album);

      return {
        id: createTrackId(filePath, index),

        title:
          title ||
          path.parse(filePath).name ||
          "Unknown Title",

        artist:
          artist || "Unknown Artist",

        album:
          album || undefined,

        bpm:
          typeof song.bpm === "number" &&
          Number.isFinite(song.bpm)
            ? song.bpm
            : null,

        filePath,

        fileName: filePath
          ? path.basename(filePath)
          : "",
      };
    })
    .filter((track) => {
      return (
        track.filePath.length > 0 ||
        track.title !== "Unknown Title" ||
        track.artist !== "Unknown Artist"
      );
    });

  return {
    seratoPath,
    databasePath,
    trackCount: tracks.length,
    tracks,
  };
}