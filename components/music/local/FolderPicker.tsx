"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import type {
  LocalMusicScanResult,
} from "@/types/local-music";

type ScanApiResponse =
  | (LocalMusicScanResult & {
      cacheFilePath?: string | null;
    })
  | {
      ok: false;
      error: string;
    };

export type FolderPickerProps = {
  initialFolderPath?: string;
  disabled?: boolean;
  onScanStart?: () => void;
  onScanComplete?: (
    result: LocalMusicScanResult
  ) => void;
  onError?: (
    message: string
  ) => void;
};

function getDefaultMusicPath(): string {
  return "~/Music";
}

export default function FolderPicker({
  initialFolderPath = "",
  disabled = false,
  onScanStart,
  onScanComplete,
  onError,
}: FolderPickerProps) {
  const [folderPath, setFolderPath] =
    useState(
      initialFolderPath ||
        getDefaultMusicPath()
    );

  const [recursive, setRecursive] =
    useState(true);

  const [
    buildFolderPlaylists,
    setBuildFolderPlaylists,
  ] = useState(true);

  const [
    includeHiddenFiles,
    setIncludeHiddenFiles,
  ] = useState(false);

  const [isScanning, setIsScanning] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [result, setResult] =
    useState<LocalMusicScanResult | null>(
      null
    );

  const canScan = useMemo(
    () =>
      folderPath.trim().length > 0 &&
      !disabled &&
      !isScanning,
    [
      folderPath,
      disabled,
      isScanning,
    ]
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canScan) {
      return;
    }

    setIsScanning(true);
    setError(null);
    setResult(null);
    onScanStart?.();

    try {
      const response = await fetch(
        "/api/music/local/scan",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            folderPath:
              folderPath.trim(),
            recursive,
            buildFolderPlaylists,
            includeHiddenFiles,
          }),
        }
      );

      const data =
        (await response.json()) as
          ScanApiResponse;

      if (
        !response.ok ||
        !data.ok
      ) {
        const message =
          "error" in data
            ? data.error
            : "The music folder could not be scanned.";

        throw new Error(message);
      }

      setResult(data);
      onScanComplete?.(data);
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "The music folder could not be scanned.";

      setError(message);
      onError?.(message);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <section
      aria-labelledby="local-music-folder-title"
    >
      <div>
        <p>LOCAL MUSIC</p>

        <h2 id="local-music-folder-title">
          Choose Your Music Folder
        </h2>

        <p>
          Enter the full path to the
          folder containing your music.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <label
          htmlFor="local-music-folder-path"
        >
          Music folder path
        </label>

        <div>
          <input
            id="local-music-folder-path"
            type="text"
            value={folderPath}
            onChange={(event) =>
              setFolderPath(
                event.target.value
              )
            }
            placeholder="/Users/your-name/Music"
            autoComplete="off"
            spellCheck={false}
            disabled={
              disabled || isScanning
            }
          />

          <button
            type="submit"
            disabled={!canScan}
          >
            {isScanning
              ? "Scanning..."
              : "Scan Music"}
          </button>
        </div>

        <p>
          Example:{" "}
          <code>
            /Users/djmikedoelo/Music
          </code>
        </p>

        <fieldset
          disabled={
            disabled || isScanning
          }
        >
          <legend>Scan options</legend>

          <label>
            <input
              type="checkbox"
              checked={recursive}
              onChange={(event) =>
                setRecursive(
                  event.target.checked
                )
              }
            />
            Include subfolders
          </label>

          <label>
            <input
              type="checkbox"
              checked={
                buildFolderPlaylists
              }
              onChange={(event) =>
                setBuildFolderPlaylists(
                  event.target.checked
                )
              }
            />
            Create playlists from
            folders
          </label>

          <label>
            <input
              type="checkbox"
              checked={
                includeHiddenFiles
              }
              onChange={(event) =>
                setIncludeHiddenFiles(
                  event.target.checked
                )
              }
            />
            Include hidden files
          </label>
        </fieldset>
      </form>

      {error ? (
        <div role="alert">
          <strong>Scan failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <div role="status">
          <strong>
            {result.message}
          </strong>

          <p>
            {result.stats.playableTracks.toLocaleString(
              "en-US"
            )}{" "}
            playable songs ·{" "}
            {result.stats.folderCount.toLocaleString(
              "en-US"
            )}{" "}
            folders ·{" "}
            {result.stats.playlistCount.toLocaleString(
              "en-US"
            )}{" "}
            playlists
          </p>

          {result.warnings.length >
          0 ? (
            <details>
              <summary>
                {result.warnings.length}{" "}
                scan warning
                {result.warnings.length ===
                1
                  ? ""
                  : "s"}
              </summary>

              <ul>
                {result.warnings.map(
                  (warning) => (
                    <li key={warning}>
                      {warning}
                    </li>
                  )
                )}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
