// lib/music/player/MusicPlayer.ts

import {
  GameSession,
  QueueSong,
} from "@/lib/game/GameSession";

import {
  PlayableQueueSong,
  prepareQueue,
  getNextQueueIndex,
  getPreviousQueueIndex,
} from "@/lib/music/queue";

import { PlaybackController } from "./PlaybackController";
import { PlayerEventBus } from "./EventBus";

export type PlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "stopped"
  | "ended"
  | "error";

export class MusicPlayer {
  private static instance: MusicPlayer;

  private playback?: PlaybackController;

  readonly events = new PlayerEventBus();

  private queue: PlayableQueueSong[] = [];

  private session?: GameSession;

  private currentIndex = 0;

  private status: PlayerStatus = "idle";

  private constructor() {}

  static getInstance(): MusicPlayer {
    if (!MusicPlayer.instance) {
      MusicPlayer.instance = new MusicPlayer();
    }

    return MusicPlayer.instance;
  }

  initialize(player: MusicKitInstance) {
    if (this.playback) return;

    this.playback = new PlaybackController(player);
  }

  getStatus() {
    return this.status;
  }

  private setStatus(status: PlayerStatus) {
    this.status = status;

    this.events.emit("statusChanged", {
      status,
    });
  }

  async loadSession(session: GameSession) {
    this.session = session;

    const prepared = prepareQueue(
      session.queue as QueueSong[],
      {
        shuffle: true,
        removeDuplicates: true,
      }
    );

    this.queue = prepared.songs;

    this.currentIndex = 0;

    this.events.emit(
      "queueHealthChanged",
      prepared.health
    );

    this.events.emit("queueChanged", {
      currentIndex: 0,
      totalSongs: this.queue.length,
    });

    this.setStatus("idle");
  }

  getCurrentSong() {
    return this.queue[this.currentIndex];
  }

  getQueue() {
    return this.queue;
  }

  async play() {
    if (!this.playback)
      throw new Error(
        "MusicPlayer not initialized."
      );

    const song = this.getCurrentSong();

    if (!song) {
      this.setStatus("ended");
      return;
    }

    this.setStatus("loading");

    const loaded =
      await this.playback.loadSong(song);

    if (!loaded.success) {
      this.setStatus("error");

      this.events.emit("songSkipped", {
        title: song.title,
        artist: song.artist,
        reason:
          loaded.error ??
          "Unable to load Apple Music track.",
      });

      await this.next();

      return;
    }

    await this.playback.play();

    this.events.emit("trackChanged", {
      index: this.currentIndex,
      title: song.title,
      artist: song.artist,
      artwork: song.artwork,
    });

    this.setStatus("playing");
  }

  pause() {
    if (!this.playback) return;

    this.playback.pause();

    this.setStatus("paused");
  }

  async resume() {
    if (!this.playback) return;

    await this.playback.play();

    this.setStatus("playing");
  }

  stop() {
    if (!this.playback) return;

    this.playback.stop();

    this.setStatus("stopped");
  }

  async next() {
    const next =
      getNextQueueIndex(
        this.currentIndex,
        this.queue.length
      );

    if (next === null) {
      this.setStatus("ended");
      return;
    }

    this.currentIndex = next;

    this.events.emit("queueChanged", {
      currentIndex: this.currentIndex,
      totalSongs: this.queue.length,
    });

    await this.play();
  }

  async previous() {
    const previous =
      getPreviousQueueIndex(
        this.currentIndex,
        this.queue.length
      );

    if (previous === null) return;

    this.currentIndex = previous;

    this.events.emit("queueChanged", {
      currentIndex: this.currentIndex,
      totalSongs: this.queue.length,
    });

    await this.play();
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  isPlaying() {
    return this.status === "playing";
  }

  isPaused() {
    return this.status === "paused";
  }

  getPlaybackController() {
    return this.playback;
  }
}

export const musicPlayer =
  MusicPlayer.getInstance();