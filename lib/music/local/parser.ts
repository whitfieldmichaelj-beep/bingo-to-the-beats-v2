import path from "node:path";

import type {
  LocalMusicTrack,
} from "@/types/local-music";

export type ParsedLocalTrackName = {
  title: string;
  artist: string;
  album: string;
};

export type LocalTrackFileInput = {
  filePath: string;
  rootFolderPath: string;

  sizeBytes?: number;
  modifiedAt?: string | null;

  durationMs?: number;
  bpm?: number | null;
  artwork?: string | null;

  readable?: boolean;
};

const VERSION_WORDS = [
  "clean",
  "dirty",
  "explicit",
  "intro",
  "outro",
  "extended",
  "radio",
  "edit",
  "remix",
  "mix",
  "version",
  "instrumental",
  "acapella",
  "acappella",
  "redrum",
];

function normalizeWhitespace(
  value: string
): string {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeAudioExtension(
  fileName: string
): string {
  return fileName.replace(
    /\.(mp3|m4a|mp4|aac|wav|aif|aiff|flac|ogg|oga|opus)$/i,
    ""
  );
}

function removeTrackNumberPrefix(
  value: string
): string {
  return value
    .replace(
      /^\s*(?:track\s*)?\d{1,3}[\s._-]+/i,
      ""
    )
    .trim();
}

function cleanBrackets(
  value: string
): string {
  return value
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\{\s*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseFallback(
  value: string
): string {
  if (!value) {
    return "";
  }

  const hasLowercase =
    /[a-z]/.test(value);

  if (hasLowercase) {
    return value;
  }

  return value
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function cleanMetadataValue(
  value: string
): string {
  return titleCaseFallback(
    cleanBrackets(
      normalizeWhitespace(value)
    )
  );
}

function getFolderAlbum(
  filePath: string,
  rootFolderPath: string
): string {
  const parentFolder =
    path.basename(
      path.dirname(filePath)
    );

  const rootFolderName =
    path.basename(
      path.resolve(rootFolderPath)
    );

  if (
    !parentFolder ||
    parentFolder === "." ||
    parentFolder === rootFolderName
  ) {
    return "Local Music";
  }

  return cleanMetadataValue(
    parentFolder
  );
}

function splitArtistAndTitle(
  stem: string
): {
  artist: string;
  title: string;
} {
  const separators = [
    " - ",
    " – ",
    " — ",
    " | ",
  ];

  for (const separator of separators) {
    const index =
      stem.indexOf(separator);

    if (index <= 0) {
      continue;
    }

    const artist =
      cleanMetadataValue(
        stem.slice(0, index)
      );

    const title =
      cleanMetadataValue(
        stem.slice(
          index + separator.length
        )
      );

    if (artist && title) {
      return {
        artist,
        title,
      };
    }
  }

  return {
    artist: "Unknown Artist",
    title:
      cleanMetadataValue(stem) ||
      "Unknown Song",
  };
}

export function parseLocalTrackName(
  filePath: string,
  rootFolderPath: string
): ParsedLocalTrackName {
  const fileName =
    path.basename(filePath);

  const stem =
    removeTrackNumberPrefix(
      normalizeWhitespace(
        removeAudioExtension(
          fileName
        )
      )
    );

  const {
    artist,
    title,
  } = splitArtistAndTitle(stem);

  return {
    artist,
    title,
    album: getFolderAlbum(
      filePath,
      rootFolderPath
    ),
  };
}

export function createLocalTrackId(
  filePath: string
): string {
  const normalized =
    path
      .resolve(filePath)
      .replace(/\\/g, "/")
      .toLowerCase();

  let hash = 2166136261;

  for (
    let index = 0;
    index < normalized.length;
    index += 1
  ) {
    hash ^= normalized.charCodeAt(
      index
    );

    hash = Math.imul(
      hash,
      16777619
    );
  }

  return `local-${(
    hash >>> 0
  ).toString(16)}`;
}

export function createDuplicateKey(
  track: Pick<
    LocalMusicTrack,
    "title" | "artist"
  >
): string {
  const ignoredWords =
    VERSION_WORDS.join("|");

  const normalize = (
    value: string
  ) =>
    value
      .toLowerCase()
      .replace(
        new RegExp(
          `\\b(?:${ignoredWords})\\b`,
          "gi"
        ),
        " "
      )
      .replace(
        /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g,
        " "
      )
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return [
    normalize(track.artist),
    normalize(track.title),
  ].join("::");
}

export function createLocalMusicTrack(
  input: LocalTrackFileInput
): LocalMusicTrack {
  const filePath =
    path.resolve(input.filePath);

  const rootFolderPath =
    path.resolve(
      input.rootFolderPath
    );

  const fileName =
    path.basename(filePath);

  const extension =
    path
      .extname(fileName)
      .toLowerCase();

  const folderPath =
    path.dirname(filePath);

  const parsed =
    parseLocalTrackName(
      filePath,
      rootFolderPath
    );

  return {
    id: createLocalTrackId(
      filePath
    ),

    title: parsed.title,
    artist: parsed.artist,
    album: parsed.album,

    fileName,
    filePath,
    folderPath,
    extension,

    durationMs:
      input.durationMs ?? 0,

    bpm:
      input.bpm ?? null,

    artwork:
      input.artwork ?? null,

    readable:
      input.readable ?? true,

    duplicate: false,
    duplicateOf: null,

    sizeBytes:
      input.sizeBytes,

    modifiedAt:
      input.modifiedAt ?? null,
  };
}
