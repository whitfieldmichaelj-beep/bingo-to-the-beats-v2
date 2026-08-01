import fs from "node:fs/promises";
import path from "node:path";

import { findSeratoLibraries, fileExists } from "./finder";
import type { SeratoPlaylist } from "./types";

function createPlaylistId(
  seratoPath: string,
  playlistName: string
): string {
  return Buffer.from(
    `${seratoPath}:${playlistName}`.toLowerCase()
  ).toString("base64url");
}

function cleanPlaylistName(fileName: string): string {
  return fileName.replace(/\.crate$/i, "").trim();
}

export async function getSeratoPlaylists(): Promise<
  SeratoPlaylist[]
> {
  const seratoLibraries = await findSeratoLibraries();
  const playlists: SeratoPlaylist[] = [];

  for (const seratoPath of seratoLibraries) {
    const subcratesPath = path.join(
      seratoPath,
      "Subcrates"
    );

    if (!(await fileExists(subcratesPath))) {
      continue;
    }

    const entries = await fs.readdir(subcratesPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !entry.name.toLowerCase().endsWith(".crate")
      ) {
        continue;
      }

      const playlistName = cleanPlaylistName(entry.name);
      const playlistFilePath = path.join(
        subcratesPath,
        entry.name
      );

      playlists.push({
        id: createPlaylistId(
          seratoPath,
          playlistName
        ),
        name: playlistName,
        filePath: playlistFilePath,
        trackCount: 0,
        tracks: [],
      });
    }
  }

  return playlists.sort((first, second) =>
    first.name.localeCompare(second.name)
  );
}