export {};

declare global {
  namespace MusicKit {
    type PlaybackState = number | string;

    interface Artwork {
      url?: string;
      width?: number;
      height?: number;
    }

    interface PlayParams {
      id?: string;
      kind?: string;
      isLibrary?: boolean;
      catalogId?: string;
    }

    interface MediaItemAttributes {
      name?: string;
      artistName?: string;
      albumName?: string;
      durationInMillis?: number;
      artwork?: Artwork;
      playParams?: PlayParams;
    }

    interface MediaItem {
      id?: string;
      type?: string;
      title?: string;
      artistName?: string;
      albumName?: string;
      artworkURL?: string;
      playbackDuration?: number;
      attributes?: MediaItemAttributes;
    }

    interface ApiError {
      id?: string;
      title?: string;
      detail?: string;
      status?: string;
      code?: string;
    }

    interface ApiResponse<T = unknown> {
      data?: T;
      errors?: ApiError[];
    }

    interface QueueOptions {
      song?: string;
      songs?: string[];
      librarySong?: string;
      librarySongs?: string[];
      playlist?: string;
      url?: string;
      startPosition?: number;
      startTime?: number;
    }

    interface Player {
      volume: number;
      currentPlaybackTime: number;
      playbackState: PlaybackState;
      nowPlayingItem?: MediaItem;

      play(): Promise<void>;
      pause(): Promise<void> | void;
      stop(): Promise<void> | void;
      seekToTime(time: number): Promise<void> | void;
      skipToNextItem(): Promise<void> | void;
      skipToPreviousItem(): Promise<void> | void;
    }
  }

  interface MusicKitInstance {
    authorize(): Promise<string>;
    unauthorize(): Promise<void>;

    isAuthorized?: boolean;
    musicUserToken?: string;

    player: MusicKit.Player;

    api: {
      music<T = unknown>(
        path: string,
        parameters?: Record<string, unknown>
      ): Promise<MusicKit.ApiResponse<T>>;
    };

    setQueue(options: MusicKit.QueueOptions): Promise<unknown>;
    play(): Promise<void> | void;
    pause(): Promise<void> | void;
    stop(): Promise<void> | void;
    skipToNextItem(): Promise<void> | void;
    skipToPreviousItem(): Promise<void> | void;
  }

  interface MusicKitGlobal {
    configure(configuration: {
      developerToken: string;
      app: {
        name: string;
        build: string;
      };
    }): void | Promise<void>;

    getInstance(): MusicKitInstance;
  }

  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

