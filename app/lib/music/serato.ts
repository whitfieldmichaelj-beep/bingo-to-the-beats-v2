import type {
  MusicPlaylist,
  MusicTrack,
} from "./types";

type SeratoPlaylistApiItem = {
  id?: string;
  name?: string;
  trackCount?: number;
};

type SeratoPlaylistsApiResponse = {
  playlists?: SeratoPlaylistApiItem[];
};

export class SeratoMusicProvider {
  async isConnected(): Promise<boolean> {
    try {
      const response = await fetch(
        "/api/serato/playlists",
        {
          cache: "no-store",
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  async getPlaylists(): Promise<MusicPlaylist[]> {
    const response = await fetch(
      "/api/serato/playlists",
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return [];
    }

    const data =
      (await response.json()) as SeratoPlaylistsApiResponse;

    return (data.playlists ?? [])
      .filter(
        (playlist) =>
          typeof playlist.id === "string" &&
          typeof playlist.name === "string"
      )
      .map((playlist) => ({
        id: playlist.id!,
        providerPlaylistId:
          playlist.id!,
        provider: "serato" as const,
        name: playlist.name!,
        totalTracks:
          playlist.trackCount ?? 0,
      }));
  }

  async getTracks(): Promise<MusicTrack[]> {
    return [];
  }
}

export const seratoMusicProvider =
  new SeratoMusicProvider();
