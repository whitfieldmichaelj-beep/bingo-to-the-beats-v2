import {
  localMusicProvider,
} from "./local";

import {
  seratoMusicProvider,
} from "./serato";

import {
  spotifyProvider,
} from "./spotify";

import type {
  MusicPlaylist,
  MusicTrack,
  MusicProvider,
} from "./types";

class MusicManager {
  private provider: MusicProvider =
    "spotify";

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

      case "serato":
        return seratoMusicProvider.isConnected();

      case "local":
        return localMusicProvider.isConnected();

      default:
        return false;
    }
  }

  async getPlaylists(): Promise<
    MusicPlaylist[]
  > {
    switch (this.provider) {
      case "spotify":
        return spotifyProvider.getPlaylists();

      case "serato":
        return seratoMusicProvider.getPlaylists();

      case "local":
        return localMusicProvider.getPlaylists();

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

      case "serato":
        return seratoMusicProvider.getTracks();

      case "local":
        return localMusicProvider.getTracks();

      default:
        return [];
    }
  }
}

export const musicManager =
  new MusicManager();
