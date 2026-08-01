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
  isReady: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  error: string | null;

  setQueue: (
    tracks: AudioTrack[],
    startIndex?: number,
    autoplay?: boolean
  ) => Promise<void>;

  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;

  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  clearQueue: () => void;

  audio: HTMLAudioElement | null;
};

const AudioContext = createContext<AudioContextValue | null>(null);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function AudioProvider({
  children,
}: {
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<AudioTrack[]>([]);
  const currentIndexRef = useRef(-1);

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [queue, setQueueState] = useState<AudioTrack[]>([]);
  const [currentIndex, setCurrentIndexState] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const currentTrack =
    currentIndex >= 0 && currentIndex < queue.length
      ? queue[currentIndex]
      : null;

  const updateQueue = useCallback((tracks: AudioTrack[]) => {
    queueRef.current = tracks;
    setQueueState(tracks);
  }, []);

  const updateCurrentIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
    setCurrentIndexState(index);
  }, []);

  const loadTrack = useCallback(
    async (index: number, autoplay = false) => {
      const audioElement = audioRef.current;
      const track = queueRef.current[index];

      if (!audioElement || !track) {
        return;
      }

      setError(null);
      setIsReady(false);
      setCurrentTime(0);
      setDuration(0);
      updateCurrentIndex(index);

      audioElement.pause();
      audioElement.src = track.url;
      audioElement.load();

      if (autoplay) {
        try {
          await audioElement.play();
        } catch (playError) {
          const message =
            playError instanceof Error
              ? playError.message
              : "The browser could not start audio playback.";

          setError(message);
          setIsPlaying(false);
          console.error("Unable to play audio track:", playError);
        }
      }
    },
    [updateCurrentIndex]
  );

  const play = useCallback(async () => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      setError("The audio player has not finished loading.");
      return;
    }

    if (!audioElement.src) {
      const index = currentIndexRef.current;
      const track = queueRef.current[index];

      if (!track) {
        setError("There is no track loaded.");
        return;
      }

      audioElement.src = track.url;
      audioElement.load();
    }

    try {
      setError(null);
      await audioElement.play();
    } catch (playError) {
      const message =
        playError instanceof Error
          ? playError.message
          : "The browser could not start audio playback.";

      setError(message);
      setIsPlaying(false);
      console.error("Unable to play audio:", playError);
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(async () => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      return;
    }

    if (audioElement.paused) {
      await play();
    } else {
      pause();
    }
  }, [pause, play]);

  const next = useCallback(async () => {
    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex >= queueRef.current.length) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    await loadTrack(nextIndex, true);
  }, [loadTrack]);

  const previous = useCallback(async () => {
    const audioElement = audioRef.current;

    if (
      audioElement &&
      audioElement.currentTime > 3 &&
      currentIndexRef.current >= 0
    ) {
      audioElement.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const previousIndex = currentIndexRef.current - 1;

    if (previousIndex < 0) {
      if (audioElement) {
        audioElement.currentTime = 0;
      }

      setCurrentTime(0);
      return;
    }

    await loadTrack(previousIndex, true);
  }, [loadTrack]);

  const setQueue = useCallback(
    async (
      tracks: AudioTrack[],
      startIndex = 0,
      autoplay = false
    ) => {
      const safeTracks = tracks.filter(
        (track) =>
          Boolean(track.id) &&
          Boolean(track.title) &&
          Boolean(track.url)
      );

      updateQueue(safeTracks);

      if (safeTracks.length === 0) {
        const audioElement = audioRef.current;

        if (audioElement) {
          audioElement.pause();
          audioElement.removeAttribute("src");
          audioElement.load();
        }

        updateCurrentIndex(-1);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setIsReady(false);
        setError(null);
        return;
      }

      const safeStartIndex = clamp(
        startIndex,
        0,
        safeTracks.length - 1
      );

      await loadTrack(safeStartIndex, autoplay);
    },
    [loadTrack, updateCurrentIndex, updateQueue]
  );

  const seek = useCallback((time: number) => {
    const audioElement = audioRef.current;

    if (!audioElement || !Number.isFinite(audioElement.duration)) {
      return;
    }

    const safeTime = clamp(time, 0, audioElement.duration);
    audioElement.currentTime = safeTime;
    setCurrentTime(safeTime);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const safeVolume = clamp(nextVolume, 0, 1);
    const audioElement = audioRef.current;

    if (audioElement) {
      audioElement.volume = safeVolume;
    }

    setVolumeState(safeVolume);
  }, []);

  const clearQueue = useCallback(() => {
    const audioElement = audioRef.current;

    if (audioElement) {
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();
    }

    updateQueue([]);
    updateCurrentIndex(-1);
    setIsPlaying(false);
    setIsReady(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [updateCurrentIndex, updateQueue]);

  useEffect(() => {
    const audioElement = new Audio();

    audioElement.preload = "metadata";
    audioElement.volume = volume;

    audioRef.current = audioElement;
    setAudio(audioElement);

    const handlePlay = () => {
      setIsPlaying(true);
      setError(null);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audioElement.currentTime || 0);
    };

    const handleLoadedMetadata = () => {
      setDuration(
        Number.isFinite(audioElement.duration)
          ? audioElement.duration
          : 0
      );
      setIsReady(true);
    };

    const handleDurationChange = () => {
      setDuration(
        Number.isFinite(audioElement.duration)
          ? audioElement.duration
          : 0
      );
    };

    const handleWaiting = () => {
      setIsReady(false);
    };

    const handleCanPlay = () => {
      setIsReady(true);
    };

    const handleError = () => {
      const mediaError = audioElement.error;

      setIsPlaying(false);
      setIsReady(false);
      setError(
        mediaError
          ? `Audio playback error ${mediaError.code}. The file may be unavailable or unsupported.`
          : "The audio file could not be loaded."
      );
    };

    const handleEnded = () => {
      void next();
    };

    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("timeupdate", handleTimeUpdate);
    audioElement.addEventListener(
      "loadedmetadata",
      handleLoadedMetadata
    );
    audioElement.addEventListener(
      "durationchange",
      handleDurationChange
    );
    audioElement.addEventListener("waiting", handleWaiting);
    audioElement.addEventListener("canplay", handleCanPlay);
    audioElement.addEventListener("error", handleError);
    audioElement.addEventListener("ended", handleEnded);

    return () => {
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();

      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener(
        "timeupdate",
        handleTimeUpdate
      );
      audioElement.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );
      audioElement.removeEventListener(
        "durationchange",
        handleDurationChange
      );
      audioElement.removeEventListener("waiting", handleWaiting);
      audioElement.removeEventListener("canplay", handleCanPlay);
      audioElement.removeEventListener("error", handleError);
      audioElement.removeEventListener("ended", handleEnded);

      audioRef.current = null;
      setAudio(null);
    };
  }, [next, volume]);

  const value = useMemo<AudioContextValue>(
    () => ({
      queue,
      currentTrack,
      currentIndex,
      isPlaying,
      isReady,
      volume,
      currentTime,
      duration,
      error,
      setQueue,
      play,
      pause,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      clearQueue,
      audio,
    }),
    [
      audio,
      clearQueue,
      currentIndex,
      currentTime,
      currentTrack,
      duration,
      error,
      isPlaying,
      isReady,
      next,
      pause,
      play,
      previous,
      queue,
      seek,
      setQueue,
      setVolume,
      togglePlay,
      volume,
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