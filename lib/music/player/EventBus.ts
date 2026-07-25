// lib/music/player/EventBus.ts

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "fading"
  | "stopped"
  | "ended"
  | "error";

export interface PlayerEventMap {
  statusChanged: {
    status: PlaybackStatus;
  };

  trackChanged: {
    index: number;
    title: string;
    artist: string;
    artwork?: string;
  };

  progressChanged: {
    elapsedSeconds: number;
    clipLengthSeconds: number;
    remainingSeconds: number;
    percentage: number;
  };

  queueChanged: {
    currentIndex: number;
    totalSongs: number;
  };

  queueHealthChanged: {
    totalSongs: number;
    playableSongs: number;
    skippedSongs: number;
  };

  fadeStarted: {
    durationSeconds: number;
  };

  fadeCompleted: {
    durationSeconds: number;
  };

  songSkipped: {
    title: string;
    artist: string;
    reason: string;
  };

  error: {
    message: string;
    cause?: unknown;
  };
}

export type PlayerEventName = keyof PlayerEventMap;

export type PlayerEventListener<
  TEventName extends PlayerEventName,
> = (payload: PlayerEventMap[TEventName]) => void;

export class PlayerEventBus {
  private listeners: {
    [TEventName in PlayerEventName]?: Set<
      PlayerEventListener<TEventName>
    >;
  } = {};

  on<TEventName extends PlayerEventName>(
    eventName: TEventName,
    listener: PlayerEventListener<TEventName>
  ): () => void {
    const existingListeners =
      this.listeners[eventName] ??
      new Set<PlayerEventListener<TEventName>>();

    existingListeners.add(listener);
    this.listeners[eventName] =
      existingListeners as typeof this.listeners[TEventName];

    return () => {
      this.off(eventName, listener);
    };
  }

  once<TEventName extends PlayerEventName>(
    eventName: TEventName,
    listener: PlayerEventListener<TEventName>
  ): () => void {
    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      listener(payload);
    });

    return unsubscribe;
  }

  off<TEventName extends PlayerEventName>(
    eventName: TEventName,
    listener: PlayerEventListener<TEventName>
  ): void {
    const eventListeners = this.listeners[eventName];

    if (!eventListeners) {
      return;
    }

    eventListeners.delete(
      listener as PlayerEventListener<TEventName>
    );

    if (eventListeners.size === 0) {
      delete this.listeners[eventName];
    }
  }

  emit<TEventName extends PlayerEventName>(
    eventName: TEventName,
    payload: PlayerEventMap[TEventName]
  ): void {
    const eventListeners = this.listeners[eventName];

    if (!eventListeners) {
      return;
    }

    for (const listener of eventListeners) {
      try {
        (
          listener as PlayerEventListener<TEventName>
        )(payload);
      } catch (error) {
        console.error(
          `Music player event listener failed for "${eventName}".`,
          error
        );
      }
    }
  }

  removeAllListeners(
    eventName?: PlayerEventName
  ): void {
    if (eventName) {
      delete this.listeners[eventName];
      return;
    }

    this.listeners = {};
  }
}