"use client";

import type {
  LocalMusicPlaylist,
} from "@/types/local-music";

export type PlaylistListProps = {
  playlists: LocalMusicPlaylist[];
  selectedPlaylistId?: string | null;
  loading?: boolean;
  emptyMessage?: string;
  onSelect?: (
    playlist: LocalMusicPlaylist
  ) => void;
};

function formatTrackCount(
  count: number
): string {
  return `${count.toLocaleString(
    "en-US"
  )} song${count === 1 ? "" : "s"}`;
}

export default function PlaylistList({
  playlists,
  selectedPlaylistId = null,
  loading = false,
  emptyMessage =
    "Scan a music folder to create playlists.",
  onSelect,
}: PlaylistListProps) {
  if (loading) {
    return (
      <section
        aria-labelledby="local-playlists-title"
        aria-busy="true"
      >
        <h2 id="local-playlists-title">
          Local Playlists
        </h2>

        <p>Loading playlists...</p>
      </section>
    );
  }

  if (playlists.length === 0) {
    return (
      <section
        aria-labelledby="local-playlists-title"
      >
        <h2 id="local-playlists-title">
          Local Playlists
        </h2>

        <p>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="local-playlists-title"
    >
      <div>
        <div>
          <p>PLAYLISTS</p>

          <h2 id="local-playlists-title">
            Choose Music for the Game
          </h2>
        </div>

        <p>
          {playlists.length.toLocaleString(
            "en-US"
          )}{" "}
          playlist
          {playlists.length === 1
            ? ""
            : "s"}
        </p>
      </div>

      <div role="list">
        {playlists.map(
          (playlist) => {
            const isSelected =
              playlist.id ===
              selectedPlaylistId;

            return (
              <button
                key={playlist.id}
                type="button"
                role="listitem"
                aria-pressed={
                  isSelected
                }
                onClick={() =>
                  onSelect?.(playlist)
                }
              >
                <div>
                  <strong>
                    {playlist.name}
                  </strong>

                  <span>
                    {playlist.relativePath ||
                      "All Music"}
                  </span>
                </div>

                <div>
                  <span>
                    {formatTrackCount(
                      playlist.playableTrackCount
                    )}
                  </span>

                  {playlist.duplicateTrackCount >
                  0 ? (
                    <span>
                      {
                        playlist.duplicateTrackCount
                      }{" "}
                      duplicate
                      {playlist.duplicateTrackCount ===
                      1
                        ? ""
                        : "s"}
                    </span>
                  ) : null}

                  {playlist.unreadableTrackCount >
                  0 ? (
                    <span>
                      {
                        playlist.unreadableTrackCount
                      }{" "}
                      unreadable
                    </span>
                  ) : null}
                </div>
              </button>
            );
          }
        )}
      </div>
    </section>
  );
}
