// lib/music/player/PlaybackController.ts

import type { PlayableQueueSong } from "@/lib/music/queue";

export interface PlaybackLoadResult {
  success: boolean;
  error?: string;
}

export class PlaybackController {
  private musicKit: MusicKitInstance;

  constructor(musicKit: MusicKitInstance) {
    this.musicKit = musicKit;
  }

  get volume(): number {
    return this.musicKit.player.volume ?? 1;
  }

  set volume(value: number) {
    this.musicKit.player.volume = Math.max(
      0,
      Math.min(1, value)
    );
  }

  async play(): Promise<void> {
    await this.musicKit.play();
  }

  pause(): void {
    this.musicKit.pause();
  }

  stop(): void {
    this.musicKit.stop();
  }

  async skipToNext(): Promise<void> {
    await this.musicKit.skipToNextItem();
  }

  async skipToPrevious(): Promise<void> {
    await this.musicKit.skipToPreviousItem();
  }

  /**
   * Loads one song rather than the entire playlist.
   */
  async loadSong(
    song: PlayableQueueSong
  ): Promise<PlaybackLoadResult> {
    try {
      if (song.playbackIdType === "catalog") {
        await this.musicKit.setQueue({
          song: song.playbackId,
        });
      } else {
        await this.musicKit.setQueue({
          librarySong: song.playbackId,
        });
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "Unable to load Apple Music track",
        song,
        error
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown MusicKit error",
      };
    }
  }

  async verifySong(
    song: PlayableQueueSong
  ): Promise<boolean> {
    const result = await this.loadSong(song);

    if (!result.success) {
      return false;
    }

    try {
      await this.musicKit.play();
      this.musicKit.pause();

      return true;
    } catch {
      return false;
    }
  }

  get currentPlaybackTime(): number {
    return (
      this.musicKit.player.currentPlaybackTime ?? 0
    );
  }

  seek(seconds: number): void {
    this.musicKit.player.seekToTime(seconds);
  }

  get currentMediaItem() {
    return this.musicKit.player.nowPlayingItem;
  }

  get playbackState() {
    return this.musicKit.player.playbackState;
  }
}
