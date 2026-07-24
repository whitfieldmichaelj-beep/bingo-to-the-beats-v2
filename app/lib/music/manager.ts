import { spotifyProvider } from "./spotify";

import {
  MusicPlaylist,
  MusicTrack,
  MusicProvider,
} from "./types";

class MusicManager {
  private provider: MusicProvider = "spotify";

  setProvider(provider: MusicProvider) {
    this.provider = provider;
  }

  getProvider() {
    return this.provider;
  }

  async isConnected() {
    switch (this.provider) {
      case "spotify":
        return spotifyProvider.isConnected();

      default:
        return false;
    }
  }

  async getPlaylists(): Promise<MusicPlaylist[]> {
    switch (this.provider) {
      case "spotify":
        return spotifyProvider.getPlaylists();

      default:
        return [];
    }
  }

  async getTracks(
    playlistId: string
  ): Promise<MusicTrack[]> {
    switch (this.provider) {
      case "spotify":
        return spotifyProvider.getTracks(
          playlistId
        );

      default:
        return [];
    }
  }
}

export const musicManager =
  new MusicManager();