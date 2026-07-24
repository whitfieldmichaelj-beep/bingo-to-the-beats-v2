import {
  MusicPlaylist,
  MusicTrack,
} from "./types";

type SpotifyImage = {
  url?: string;
};

type SpotifyArtist = {
  name?: string;
};

type SpotifyAlbum = {
  name?: string;
  images?: SpotifyImage[];
};

type SpotifyPlaylistApiItem = {
  id?: string;
  name?: string;
  description?: string | null;
  images?: SpotifyImage[];
  tracks?: {
    total?: number;
  };
};

type SpotifyPlaylistsApiResponse = {
  playlists?: SpotifyPlaylistApiItem[];
  connected?: boolean;
  error?: string;
};

type SpotifyTrackApiItem = {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  duration_ms?: number;
  explicit?: boolean;
};

type SpotifyPlaylistTrackItem = {
  track?: SpotifyTrackApiItem | null;
};

type SpotifyTracksApiResponse = {
  tracks?: SpotifyPlaylistTrackItem[];
  error?: string;
};

export class SpotifyProvider {
  /**
   * Returns true when the Spotify account is connected.
   */
  async isConnected(): Promise<boolean> {
    try {
      const response = await fetch("/api/spotify/player", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return false;
      }

      const data =
        (await response.json()) as SpotifyPlaylistsApiResponse;

      return data.connected === true;
    } catch (error) {
      console.error("Unable to check Spotify connection:", error);
      return false;
    }
  }

  /**
   * Gets the user's Spotify playlists.
   */
  async getPlaylists(): Promise<MusicPlaylist[]> {
    try {
      const response = await fetch("/api/spotify/playlists", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return [];
      }

      const data =
        (await response.json()) as SpotifyPlaylistsApiResponse;

      const playlists: SpotifyPlaylistApiItem[] = Array.isArray(
        data.playlists
      )
        ? data.playlists
        : [];

      const result: MusicPlaylist[] = [];

      for (const playlist of playlists) {
        if (!playlist.id || !playlist.name) {
          continue;
        }

        result.push({
          id: playlist.id,
          providerPlaylistId: playlist.id,
          provider: "spotify",
          name: playlist.name,
          description: playlist.description ?? "",
          artwork: playlist.images?.[0]?.url ?? null,
          totalTracks: playlist.tracks?.total ?? 0,
        });
      }

      return result;
    } catch (error) {
      console.error("Unable to load Spotify playlists:", error);
      return [];
    }
  }

  /**
   * Gets the tracks from a Spotify playlist.
   */
  async getTracks(
    playlistId: string
  ): Promise<MusicTrack[]> {
    try {
      const response = await fetch(
        `/api/spotify/playlists/${encodeURIComponent(
          playlistId
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        return [];
      }

      const data =
        (await response.json()) as SpotifyTracksApiResponse;

      const items: SpotifyPlaylistTrackItem[] = Array.isArray(
        data.tracks
      )
        ? data.tracks
        : [];

      const result: MusicTrack[] = [];

      for (const item of items) {
        const track = item.track;

        if (!track?.id || !track.name) {
          continue;
        }

        result.push({
          id: track.id,
          providerTrackId: track.id,
          provider: "spotify",
          title: track.name,
          artist: (track.artists ?? [])
            .map((artist) => artist.name)
            .filter((name): name is string => Boolean(name))
            .join(", "),
          album: track.album?.name ?? "",
          artwork: track.album?.images?.[0]?.url ?? null,
          durationMs: track.duration_ms ?? 0,
          explicit: track.explicit ?? false,
        });
      }

      return result;
    } catch (error) {
      console.error(
        `Unable to load Spotify playlist ${playlistId}:`,
        error
      );
      return [];
    }
  }
}

export const spotifyProvider = new SpotifyProvider();

