import type {
  MusicPlaylist,
  MusicTrack,
} from "./types";

export type LocalScanSummary = {
  folderPath: string;
  playlistName: string;
  totalAudioFiles: number;
  usableTrackCount: number;
  duplicateCount: number;
  unreadableCount: number;
  unsupportedCount: number;
};

export type LocalScanResult = {
  ok: boolean;
  playlist?: MusicPlaylist;
  tracks?: MusicTrack[];
  summary?: LocalScanSummary;
  message?: string;
  error?: string;
};

export class LocalMusicProvider {
  async scanFolder(
    folderPath: string
  ): Promise<LocalScanResult> {
    const response = await fetch(
      "/api/music/local/scan",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          folderPath,
        }),
      }
    );

    const data =
      (await response.json()) as LocalScanResult;

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          "The local music folder could not be scanned."
      );
    }

    return data;
  }

  async isConnected(): Promise<boolean> {
    return true;
  }

  async getPlaylists(): Promise<MusicPlaylist[]> {
    return [];
  }

  async getTracks(): Promise<MusicTrack[]> {
    return [];
  }
}

export const localMusicProvider =
  new LocalMusicProvider();
