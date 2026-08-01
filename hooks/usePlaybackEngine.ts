"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type PlaybackTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration?: number;
  audioUrl?: string | null;
  source:
    | "spotify"
    | "serato"
    | "local"
    | "apple"
    | "tidal";
};

export type PlaybackStatus =
  | "idle"
  | "ready"
  | "countdown"
  | "playing"
  | "paused"
  | "revealed"
  | "finished";

export function usePlaybackEngine(
  initialTracks: PlaybackTrack[] = [],
  clipLength = 20
) {
  const audioRef =
    useRef<HTMLAudioElement | null>(null);

  const timerRef =
    useRef<number | null>(null);

  const fadeTimerRef =
    useRef<number | null>(null);

  const [tracks, setTracks] =
    useState<PlaybackTrack[]>(initialTracks);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [status, setStatus] =
    useState<PlaybackStatus>(
      initialTracks.length > 0 ? "ready" : "idle"
    );

  const [revealed, setRevealed] =
    useState(false);

  const [secondsRemaining, setSecondsRemaining] =
    useState(clipLength);

  const [crossfadeSeconds, setCrossfadeSeconds] =
    useState(2);

  const [playbackError, setPlaybackError] =
    useState<string | null>(null);

  const currentTrack =
    tracks[currentIndex] ?? null;

  const hasPlayableAudio =
    Boolean(currentTrack?.audioUrl);

  const clearCountdownTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const pauseAudio = useCallback(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
  }, []);

  const resetAudio = useCallback(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current.volume = 1;
  }, []);

  const finishAndReveal =
    useCallback(() => {
      clearCountdownTimer();
      clearFadeTimer();
      pauseAudio();

      if (audioRef.current) {
        audioRef.current.volume = 1;
      }

      setSecondsRemaining(0);
      setStatus("revealed");
      setRevealed(true);
    }, [
      clearCountdownTimer,
      clearFadeTimer,
      pauseAudio,
    ]);

  /*
   * Create and prepare the browser audio player whenever
   * the selected track changes.
   */

  useEffect(() => {
    clearCountdownTimer();
    clearFadeTimer();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load();
      audioRef.current = null;
    }

    setPlaybackError(null);

    if (!currentTrack?.audioUrl) {
      return;
    }

    const audio =
      new window.Audio(currentTrack.audioUrl);

    audio.preload = "auto";
    audio.volume = 1;

    const handleEnded = () => {
      finishAndReveal();
    };

    const handleError = () => {
      setPlaybackError(
        "The audio could not be loaded."
      );

      setStatus("ready");
    };

    audio.addEventListener(
      "ended",
      handleEnded
    );

    audio.addEventListener(
      "error",
      handleError
    );

    audioRef.current = audio;

    return () => {
      audio.removeEventListener(
        "ended",
        handleEnded
      );

      audio.removeEventListener(
        "error",
        handleError
      );

      audio.pause();
      audio.src = "";
      audio.load();

      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [
    currentTrack?.id,
    currentTrack?.audioUrl,
    clearCountdownTimer,
    clearFadeTimer,
    finishAndReveal,
  ]);

  /*
   * Countdown engine.
   *
   * Tracks with a audio URL play real audio.
   * Tracks without a audio URL still use the countdown
   * and reveal workflow.
   */

  useEffect(() => {
    const countdownIsActive =
      status === "playing" ||
      status === "countdown";

    if (!countdownIsActive) {
      clearCountdownTimer();
      return;
    }

    if (secondsRemaining <= 0) {
      finishAndReveal();
      return;
    }

    timerRef.current = window.setTimeout(() => {
      setSecondsRemaining((current) =>
        Math.max(current - 1, 0)
      );
    }, 1000);

    return clearCountdownTimer;
  }, [
    status,
    secondsRemaining,
    clearCountdownTimer,
    finishAndReveal,
  ]);

  /*
   * Smoothly fade the audio during the final portion of
   * the selected clip.
   */

  useEffect(() => {
    clearFadeTimer();

    if (
      status !== "playing" ||
      !audioRef.current ||
      crossfadeSeconds <= 0 ||
      secondsRemaining > crossfadeSeconds
    ) {
      if (
        audioRef.current &&
        secondsRemaining > crossfadeSeconds
      ) {
        audioRef.current.volume = 1;
      }

      return;
    }

    const audio = audioRef.current;

    fadeTimerRef.current =
      window.setInterval(() => {
        const fadeDurationMilliseconds =
          crossfadeSeconds * 1000;

        const millisecondsRemaining =
          Math.max(
            secondsRemaining * 1000 -
              (Date.now() % 1000),
            0
          );

        const nextVolume =
          fadeDurationMilliseconds > 0
            ? Math.min(
                Math.max(
                  millisecondsRemaining /
                    fadeDurationMilliseconds,
                  0
                ),
                1
              )
            : 0;

        audio.volume = nextVolume;
      }, 50);

    return clearFadeTimer;
  }, [
    status,
    secondsRemaining,
    crossfadeSeconds,
    clearFadeTimer,
  ]);

  /*
   * Keep clip duration synchronized when the duration
   * setting changes while playback is stopped.
   */

  useEffect(() => {
    if (
      status === "idle" ||
      status === "ready"
    ) {
      setSecondsRemaining(clipLength);
    }
  }, [clipLength, status]);

  /*
   * Track loading
   */

  const loadTracks = useCallback(
    (newTracks: PlaybackTrack[]) => {
      clearCountdownTimer();
      clearFadeTimer();
      resetAudio();

      setTracks(newTracks);
      setCurrentIndex(0);
      setSecondsRemaining(clipLength);
      setRevealed(false);
      setPlaybackError(null);

      setStatus(
        newTracks.length > 0
          ? "ready"
          : "idle"
      );
    },
    [
      clipLength,
      clearCountdownTimer,
      clearFadeTimer,
      resetAudio,
    ]
  );

  /*
   * Playback controls
   */

  const start = useCallback(async () => {
    if (!currentTrack) {
      return;
    }

    clearCountdownTimer();
    clearFadeTimer();

    setPlaybackError(null);
    setRevealed(false);

    if (
      secondsRemaining <= 0
    ) {
      setSecondsRemaining(clipLength);
    }

    const audio = audioRef.current;

    if (
      currentTrack.audioUrl &&
      audio
    ) {
      try {
        audio.volume = 1;

        if (
          secondsRemaining <= 0 ||
          audio.ended
        ) {
          audio.currentTime = 0;
        }

        await audio.play();
        setStatus("playing");
        return;
      } catch (error) {
        console.error(
          "Audio playback failed:",
          error
        );

        setPlaybackError(
          "The browser could not start this audio."
        );
      }
    }

    setStatus("countdown");
  }, [
    currentTrack,
    secondsRemaining,
    clipLength,
    clearCountdownTimer,
    clearFadeTimer,
  ]);

  const pause = useCallback(() => {
    clearCountdownTimer();
    clearFadeTimer();
    pauseAudio();

    setStatus("paused");
  }, [
    clearCountdownTimer,
    clearFadeTimer,
    pauseAudio,
  ]);

  const resume = useCallback(async () => {
    if (
      !currentTrack ||
      secondsRemaining <= 0
    ) {
      return;
    }

    setPlaybackError(null);
    setRevealed(false);

    const audio = audioRef.current;

    if (
      currentTrack.audioUrl &&
      audio
    ) {
      try {
        await audio.play();
        setStatus("playing");
        return;
      } catch (error) {
        console.error(
          "Audio resume failed:",
          error
        );

        setPlaybackError(
          "The browser could not resume this audio."
        );
      }
    }

    setStatus("countdown");
  }, [
    currentTrack,
    secondsRemaining,
  ]);

  const restart = useCallback(() => {
    clearCountdownTimer();
    clearFadeTimer();
    resetAudio();

    setSecondsRemaining(clipLength);
    setStatus(
      currentTrack ? "ready" : "idle"
    );
    setRevealed(false);
    setPlaybackError(null);
  }, [
    clipLength,
    currentTrack,
    clearCountdownTimer,
    clearFadeTimer,
    resetAudio,
  ]);

  const stop = useCallback(() => {
    clearCountdownTimer();
    clearFadeTimer();
    resetAudio();

    setSecondsRemaining(clipLength);
    setStatus(
      currentTrack ? "ready" : "idle"
    );
    setRevealed(false);
    setPlaybackError(null);
  }, [
    clipLength,
    currentTrack,
    clearCountdownTimer,
    clearFadeTimer,
    resetAudio,
  ]);

  const reveal = useCallback(() => {
    clearCountdownTimer();
    clearFadeTimer();
    pauseAudio();

    if (audioRef.current) {
      audioRef.current.volume = 1;
    }

    setStatus("revealed");
    setRevealed(true);
  }, [
    clearCountdownTimer,
    clearFadeTimer,
    pauseAudio,
  ]);

  const hide = useCallback(() => {
    clearCountdownTimer();
    clearFadeTimer();

    setStatus(
      currentTrack ? "ready" : "idle"
    );
    setRevealed(false);
  }, [
    currentTrack,
    clearCountdownTimer,
    clearFadeTimer,
  ]);

  const goToTrack = useCallback(
    (newIndex: number) => {
      clearCountdownTimer();
      clearFadeTimer();
      resetAudio();

      const safeIndex = Math.min(
        Math.max(newIndex, 0),
        Math.max(tracks.length - 1, 0)
      );

      setCurrentIndex(safeIndex);
      setSecondsRemaining(clipLength);
      setRevealed(false);
      setPlaybackError(null);

      setStatus(
        tracks.length > 0
          ? "ready"
          : "idle"
      );
    },
    [
      tracks.length,
      clipLength,
      clearCountdownTimer,
      clearFadeTimer,
      resetAudio,
    ]
  );

  const next = useCallback(() => {
    if (currentIndex >= tracks.length - 1) {
      clearCountdownTimer();
      clearFadeTimer();
      resetAudio();

      setStatus("finished");
      setRevealed(true);
      return;
    }

    goToTrack(currentIndex + 1);
  }, [
    currentIndex,
    tracks.length,
    goToTrack,
    clearCountdownTimer,
    clearFadeTimer,
    resetAudio,
  ]);

  const previous = useCallback(() => {
    goToTrack(currentIndex - 1);
  }, [
    currentIndex,
    goToTrack,
  ]);

  /*
   * Final cleanup when leaving the page.
   */

  useEffect(() => {
    return () => {
      clearCountdownTimer();
      clearFadeTimer();

      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [
    clearCountdownTimer,
    clearFadeTimer,
  ]);

  return useMemo(
    () => ({
      audioRef,

      tracks,
      currentTrack,
      currentIndex,

      status,
      revealed,

      secondsRemaining,

      crossfadeSeconds,
      setCrossfadeSeconds,

      playbackError,
      hasPlayableAudio,

      loadTracks,

      start,
      pause,
      resume,
      restart,
      stop,

      reveal,
      hide,

      next,
      previous,
      goToTrack,
    }),
    [
      tracks,
      currentTrack,
      currentIndex,
      status,
      revealed,
      secondsRemaining,
      crossfadeSeconds,
      playbackError,
      hasPlayableAudio,
      loadTracks,
      start,
      pause,
      resume,
      restart,
      stop,
      reveal,
      hide,
      next,
      previous,
      goToTrack,
    ]
  );
}

