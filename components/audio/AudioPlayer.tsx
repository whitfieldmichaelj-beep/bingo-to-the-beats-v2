"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type AudioTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string | null;
  url: string;
  duration?: number;
};

type AudioContextValue = {
  queue: AudioTrack[];
  currentTrack: AudioTrack | null;
  currentIndex: number;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isReady: boolean;
  error: string | null;

  setQueue: (
    tracks: AudioTrack[],
    startIndex?: number
  ) => void;

  play: () => Promise<void>;
  pause: () => void;
  next: () => Promise<void>;
  previous: () => Promise<void>;

  seek: (time: number) => void;
  setVolume: (volume: number) => void;
};

const AudioContext =
  createContext<AudioContextValue | null>(null);

export function AudioProvider({
  children,
}: {
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<AudioTrack[]>([]);
  const currentIndexRef = useRef(0);
  const shouldContinuePlayingRef = useRef(false);

  const [queue, setQueueState] = useState<AudioTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(
    null
  );

  const currentTrack =
    queue[currentIndex] ?? null;

  const loadTrack = useCallback(
    (
      index: number,
      tracks: AudioTrack[] = queueRef.current
    ) => {
      const audio = audioRef.current;
      const track = tracks[index];

      if (!audio || !track) {
        return false;
      }

      audio.pause();
      audio.src = track.url;
      audio.currentTime = 0;
      audio.load();

      setCurrentTime(0);
      setDuration(track.duration ?? 0);
      setError(null);

      return true;
    },
    []
  );

  const play = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio) {
      setError("The audio player is not ready.");
      return;
    }

    if (!audio.src) {
      setError("Choose a playlist before pressing Play.");
      return;
    }

    try {
      shouldContinuePlayingRef.current = true;
      await audio.play();
      setError(null);
    } catch (playError) {
      shouldContinuePlayingRef.current = false;

      setError(
        playError instanceof Error
          ? playError.message
          : "The browser could not play this track."
      );
    }
  }, []);

  const pause = useCallback(() => {
    const audio = audioRef.current;

    shouldContinuePlayingRef.current = false;
    audio?.pause();
  }, []);

  const playTrackAtIndex = useCallback(
    async (index: number) => {
      const tracks = queueRef.current;

      if (
        index < 0 ||
        index >= tracks.length ||
        !loadTrack(index, tracks)
      ) {
        return;
      }

      currentIndexRef.current = index;
      setCurrentIndex(index);

      try {
        shouldContinuePlayingRef.current = true;
        await audioRef.current?.play();
        setError(null);
      } catch (playError) {
        shouldContinuePlayingRef.current = false;

        setError(
          playError instanceof Error
            ? playError.message
            : "The browser could not play this track."
        );
      }
    },
    [loadTrack]
  );

  const next = useCallback(async () => {
    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex >= queueRef.current.length) {
      shouldContinuePlayingRef.current = false;
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    await playTrackAtIndex(nextIndex);
  }, [playTrackAtIndex]);

  const previous = useCallback(async () => {
    const audio = audioRef.current;

    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const previousIndex = currentIndexRef.current - 1;

    if (previousIndex < 0) {
      if (audio) {
        audio.currentTime = 0;
      }

      setCurrentTime(0);
      return;
    }

    await playTrackAtIndex(previousIndex);
  }, [playTrackAtIndex]);

  const setQueue = useCallback(
    (tracks: AudioTrack[], startIndex = 0) => {
      const safeIndex =
        tracks.length === 0
          ? 0
          : Math.min(
              Math.max(startIndex, 0),
              tracks.length - 1
            );

      shouldContinuePlayingRef.current = false;
      audioRef.current?.pause();

      queueRef.current = tracks;
      currentIndexRef.current = safeIndex;

      setQueueState(tracks);
      setCurrentIndex(safeIndex);
      setIsPlaying(false);
      setCurrentTime(0);
      setError(null);

      if (tracks.length === 0) {
        const audio = audioRef.current;

        if (audio) {
          audio.removeAttribute("src");
          audio.load();
        }

        setDuration(0);
        return;
      }

      loadTrack(safeIndex, tracks);
    },
    [loadTrack]
  );

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;

    if (!audio || !Number.isFinite(time)) {
      return;
    }

    const maximum =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : time;

    const safeTime = Math.min(
      Math.max(time, 0),
      maximum
    );

    audio.currentTime = safeTime;
    setCurrentTime(safeTime);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const audio = audioRef.current;
    const safeVolume = Math.min(
      Math.max(nextVolume, 0),
      1
    );

    if (audio) {
      audio.volume = safeVolume;
    }

    setVolumeState(safeVolume);
  }, []);

  useEffect(() => {
    const audio = new Audio();

    audio.preload = "metadata";
    audio.volume = volume;
    audioRef.current = audio;
    setIsReady(true);

    const handlePlay = () => {
      setIsPlaying(true);
      setError(null);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(
        Number.isFinite(audio.duration)
          ? audio.duration
          : 0
      );
    };

    const handleDurationChange = () => {
      setDuration(
        Number.isFinite(audio.duration)
          ? audio.duration
          : 0
      );
    };

    const handleEnded = () => {
      void next();
    };

    const handleError = () => {
      shouldContinuePlayingRef.current = false;
      setIsPlaying(false);

      setError(
        "This audio file could not be loaded or played."
      );
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener(
      "timeupdate",
      handleTimeUpdate
    );
    audio.addEventListener(
      "loadedmetadata",
      handleLoadedMetadata
    );
    audio.addEventListener(
      "durationchange",
      handleDurationChange
    );
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();

      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener(
        "pause",
        handlePause
      );
      audio.removeEventListener(
        "timeupdate",
        handleTimeUpdate
      );
      audio.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );
      audio.removeEventListener(
        "durationchange",
        handleDurationChange
      );
      audio.removeEventListener(
        "ended",
        handleEnded
      );
      audio.removeEventListener(
        "error",
        handleError
      );

      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, [next, volume]);

  const value = useMemo<AudioContextValue>(
    () => ({
      queue,
      currentTrack,
      currentIndex,
      isPlaying,
      volume,
      currentTime,
      duration,
      isReady,
      error,
      setQueue,
      play,
      pause,
      next,
      previous,
      seek,
      setVolume,
    }),
    [
      queue,
      currentTrack,
      currentIndex,
      isPlaying,
      volume,
      currentTime,
      duration,
      isReady,
      error,
      setQueue,
      play,
      pause,
      next,
      previous,
      seek,
      setVolume,
    ]
  );

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);

  if (!context) {
    throw new Error(
      "useAudio must be used inside an AudioProvider."
    );
  }

  return context;
}