"use client";

import type {
  LocalMusicLibraryStats,
} from "@/types/local-music";

export type LibraryStatsProps = {
  stats: LocalMusicLibraryStats | null;
  loading?: boolean;
};

function formatNumber(
  value: number
): string {
  return value.toLocaleString(
    "en-US"
  );
}

function formatBytes(
  bytes: number
): string {
  if (bytes <= 0) {
    return "0 MB";
  }

  const megabytes =
    bytes / (1024 * 1024);

  if (megabytes < 1024) {
    return `${megabytes.toFixed(
      megabytes >= 100 ? 0 : 1
    )} MB`;
  }

  const gigabytes =
    megabytes / 1024;

  return `${gigabytes.toFixed(
    gigabytes >= 100 ? 0 : 1
  )} GB`;
}

function formatDuration(
  milliseconds: number
): string {
  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }

  return `${(
    milliseconds / 1000
  ).toFixed(1)} sec`;
}

export default function LibraryStats({
  stats,
  loading = false,
}: LibraryStatsProps) {
  if (loading) {
    return (
      <section
        aria-labelledby="local-library-stats-title"
        aria-busy="true"
      >
        <h2 id="local-library-stats-title">
          Library Summary
        </h2>

        <p>Loading library details...</p>
      </section>
    );
  }

  if (!stats) {
    return (
      <section
        aria-labelledby="local-library-stats-title"
      >
        <h2 id="local-library-stats-title">
          Library Summary
        </h2>

        <p>
          Scan a music folder to view
          your library details.
        </p>
      </section>
    );
  }

  const cards = [
    {
      label: "Playable Songs",
      value: formatNumber(
        stats.playableTracks
      ),
    },
    {
      label: "Playlists",
      value: formatNumber(
        stats.playlistCount
      ),
    },
    {
      label: "Folders",
      value: formatNumber(
        stats.folderCount
      ),
    },
    {
      label: "Duplicates",
      value: formatNumber(
        stats.duplicateTracks
      ),
    },
    {
      label: "Unreadable",
      value: formatNumber(
        stats.unreadableTracks
      ),
    },
    {
      label: "Library Size",
      value: formatBytes(
        stats.totalSizeBytes
      ),
    },
  ];

  return (
    <section
      aria-labelledby="local-library-stats-title"
    >
      <div>
        <p>LIBRARY</p>

        <h2 id="local-library-stats-title">
          Library Summary
        </h2>
      </div>

      <div role="list">
        {cards.map((card) => (
          <div
            key={card.label}
            role="listitem"
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>

      <dl>
        <div>
          <dt>Total files scanned</dt>
          <dd>
            {formatNumber(
              stats.totalFilesScanned
            )}
          </dd>
        </div>

        <div>
          <dt>Supported audio files</dt>
          <dd>
            {formatNumber(
              stats.supportedAudioFiles
            )}
          </dd>
        </div>

        <div>
          <dt>Unsupported files</dt>
          <dd>
            {formatNumber(
              stats.unsupportedFiles
            )}
          </dd>
        </div>

        <div>
          <dt>Missing artist names</dt>
          <dd>
            {formatNumber(
              stats.missingArtistCount
            )}
          </dd>
        </div>

        <div>
          <dt>Missing song titles</dt>
          <dd>
            {formatNumber(
              stats.missingTitleCount
            )}
          </dd>
        </div>

        <div>
          <dt>Missing artwork</dt>
          <dd>
            {formatNumber(
              stats.missingArtworkCount
            )}
          </dd>
        </div>

        <div>
          <dt>Missing BPM</dt>
          <dd>
            {formatNumber(
              stats.missingBpmCount
            )}
          </dd>
        </div>

        <div>
          <dt>Scan time</dt>
          <dd>
            {formatDuration(
              stats.scanDurationMs
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
