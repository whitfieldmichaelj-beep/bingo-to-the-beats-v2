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
  bpm?: number | null;
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

type PlaybackOptions = {
  continuous?: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function disposeAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;

  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}


// BTTB_ONE_MINUTE_BEAT_ALIGNED_START_V3
const DEFAULT_MUSICAL_START_SECONDS = 60;

function getBeatAlignedStartSeconds(
  track: PlaybackTrack,
  duration: number,
  playtimeSeconds: number
) {
  const bpm =
    typeof track.bpm === "number" &&
    Number.isFinite(track.bpm) &&
    track.bpm >= 40 &&
    track.bpm <= 240
      ? track.bpm
      : null;

  // Assume common 4/4 and move 1:00 forward to the next estimated bar.
  const secondsPerBar =
    bpm
      ? 240 / bpm
      : null;

  let startSeconds =
    secondsPerBar
      ? Math.ceil(
          DEFAULT_MUSICAL_START_SECONDS /
            secondsPerBar
        ) * secondsPerBar
      : DEFAULT_MUSICAL_START_SECONDS;

  // BTTB_ONE_MINUTE_AUDIO_FALLBACK_V1
  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    /*
     * Some VBR/older MP3 files briefly report NaN/Infinity
     * while the browser is resolving seek information.
     * Starting at zero is safer than seeking blindly to 60s.
     */
    return 0;
  }

  const requiredTail =
    Math.max(
      playtimeSeconds,
      10
    ) + 2;

  if (
    duration <=
    DEFAULT_MUSICAL_START_SECONDS +
      requiredTail
  ) {
    return 0;
  }

  startSeconds =
    Math.min(
      startSeconds,
      Math.max(
        0,
        duration -
          requiredTail
      )
    );

  return Math.max(
    0,
    startSeconds
  );
}

async function waitForAudioMetadata(
  audio: HTMLAudioElement
) {
  if (
    audio.readyState >= 1 &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0
  ) {
    return;
  }

  await new Promise<void>(
    (resolve) => {
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;

        audio.removeEventListener(
          "loadedmetadata",
          finish
        );
        audio.removeEventListener(
          "durationchange",
          finish
        );
        audio.removeEventListener(
          "error",
          finish
        );

        window.clearTimeout(timeout);
        resolve();
      };

      const timeout =
        window.setTimeout(
          finish,
          3000
        );

      audio.addEventListener(
        "loadedmetadata",
        finish,
        { once: true }
      );

      audio.addEventListener(
        "durationchange",
        finish,
        { once: true }
      );

      audio.addEventListener(
        "error",
        finish,
        { once: true }
      );
    }
  );
}

async function seekAudioToBeatAlignedStart(
  audio: HTMLAudioElement,
  track: PlaybackTrack,
  playtimeSeconds: number
) {
  await waitForAudioMetadata(
    audio
  );

  const startSeconds =
    getBeatAlignedStartSeconds(
      track,
      audio.duration,
      playtimeSeconds
    );

  try {
    audio.currentTime =
      startSeconds;
  } catch {
    // Playback still works if a stream temporarily rejects seeking.
  }

  return startSeconds;
}

async function waitForSeekToSettle(
  audio: HTMLAudioElement
) {
  if (
    !audio.seeking &&
    audio.readyState >= 2
  ) {
    return;
  }

  await new Promise<void>(
    (resolve) => {
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;

        audio.removeEventListener(
          "seeked",
          finish
        );
        audio.removeEventListener(
          "canplay",
          finish
        );
        audio.removeEventListener(
          "error",
          finish
        );

        window.clearTimeout(
          timeout
        );

        resolve();
      };

      const timeout =
        window.setTimeout(
          finish,
          1800
        );

      audio.addEventListener(
        "seeked",
        finish,
        { once: true }
      );

      audio.addEventListener(
        "canplay",
        finish,
        { once: true }
      );

      audio.addEventListener(
        "error",
        finish,
        { once: true }
      );
    }
  );
}

export function usePlaybackEngine(
  initialTracks: PlaybackTrack[] = [],
  playtimeSeconds = 20,
  options: PlaybackOptions = {}
) {
  /*
   * IMPORTANT TIMING RULE
   * ---------------------
   * playtimeSeconds is FULL-VOLUME / NON-FADE play time only.
   * The crossfade is added after that timer reaches zero.
   * Example: 30 seconds playtime + 4 seconds crossfade means
   * 30 seconds at full volume, followed by a 4-second overlap.
   */

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingIndexRef = useRef<number | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const phaseEndRef = useRef<number | null>(null);
  const crossfadeFrameRef = useRef<number | null>(null);
  const transitionInProgressRef = useRef(false);

  const tracksRef = useRef<PlaybackTrack[]>(initialTracks);
  const currentIndexRef = useRef(0);
  const statusRef = useRef<PlaybackStatus>(
    initialTracks.length > 0 ? "ready" : "idle"
  );
  const secondsRemainingRef = useRef(playtimeSeconds);
  const crossfadeSecondsRef = useRef(4);
  const continuousRef = useRef(Boolean(options.continuous));

  const [tracks, setTracks] =
    useState<PlaybackTrack[]>(initialTracks);
  const [currentIndex, setCurrentIndexState] = useState(0);
  const [status, setStatusState] = useState<PlaybackStatus>(
    initialTracks.length > 0 ? "ready" : "idle"
  );
  const [revealed, setRevealed] = useState(false);
  const [secondsRemaining, setSecondsRemainingState] =
    useState(playtimeSeconds);
  const [crossfadeSeconds, setCrossfadeSecondsState] =
    useState(4);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [playbackError, setPlaybackError] =
    useState<string | null>(null);

  useEffect(() => {
    continuousRef.current = Boolean(options.continuous);
  }, [options.continuous]);

  const currentTrack = tracks[currentIndex] ?? null;
  const hasPlayableAudio = Boolean(currentTrack?.audioUrl);

  const setCurrentIndex = useCallback((value: number) => {
    currentIndexRef.current = value;
    setCurrentIndexState(value);
  }, []);

  const setStatus = useCallback((value: PlaybackStatus) => {
    statusRef.current = value;
    setStatusState(value);
  }, []);

  const setSecondsRemaining = useCallback((value: number) => {
    const safeValue = Math.max(0, value);
    secondsRemainingRef.current = safeValue;
    setSecondsRemainingState(safeValue);
  }, []);

  const clearPlayTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    phaseEndRef.current = null;
  }, []);

  const clearCrossfade = useCallback(() => {
    if (crossfadeFrameRef.current !== null) {
      window.cancelAnimationFrame(crossfadeFrameRef.current);
      crossfadeFrameRef.current = null;
    }
  }, []);

  const clearIncomingAudio = useCallback(() => {
    disposeAudio(incomingAudioRef.current);
    incomingAudioRef.current = null;
    incomingIndexRef.current = null;
  }, []);

  const stopAllAudio = useCallback(() => {
    clearPlayTimer();
    clearCrossfade();

    disposeAudio(audioRef.current);
    disposeAudio(incomingAudioRef.current);

    audioRef.current = null;
    incomingAudioRef.current = null;
    incomingIndexRef.current = null;
    activeTrackIdRef.current = null;
    transitionInProgressRef.current = false;
    setIsCrossfading(false);
  }, [clearCrossfade, clearPlayTimer]);

  const prepareIncoming = useCallback((index: number) => {
    const nextTrack = tracksRef.current[index];

    if (!nextTrack?.audioUrl) {
      disposeAudio(incomingAudioRef.current);
      incomingAudioRef.current = null;
      incomingIndexRef.current = null;
      return null;
    }

    if (
      incomingAudioRef.current &&
      incomingIndexRef.current === index
    ) {
      return incomingAudioRef.current;
    }

    disposeAudio(incomingAudioRef.current);

    const audio = new window.Audio(nextTrack.audioUrl);
    audio.preload = "auto";
    audio.volume = 0;
    audio.load();

    incomingAudioRef.current = audio;
    incomingIndexRef.current = index;

    return audio;
  }, []);

  const prepareActiveAudio = useCallback(
    (index: number) => {
      const track = tracksRef.current[index];

      if (!track?.audioUrl) {
        disposeAudio(audioRef.current);
        audioRef.current = null;
        activeTrackIdRef.current = null;
        prepareIncoming(index + 1);
        return null;
      }

      if (
        audioRef.current &&
        activeTrackIdRef.current === track.id
      ) {
        prepareIncoming(index + 1);
        return audioRef.current;
      }

      disposeAudio(audioRef.current);

      let audio: HTMLAudioElement;

      if (
        incomingAudioRef.current &&
        incomingIndexRef.current === index
      ) {
        audio = incomingAudioRef.current;
        incomingAudioRef.current = null;
        incomingIndexRef.current = null;
      } else {
        audio = new window.Audio(track.audioUrl);
      }

      audio.preload = "auto";
      audio.volume = 1;
      audio.currentTime = 0;
      audio.load();

      audioRef.current = audio;
      activeTrackIdRef.current = track.id;
      prepareIncoming(index + 1);

      return audio;
    },
    [prepareIncoming]
  );

  const finishAndReveal = useCallback(() => {
    clearPlayTimer();
    clearCrossfade();
    clearIncomingAudio();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.volume = 1;
    }

    transitionInProgressRef.current = false;
    setIsCrossfading(false);
    setSecondsRemaining(0);
    setStatus("revealed");
    setRevealed(true);
  }, [
    clearCrossfade,
    clearIncomingAudio,
    clearPlayTimer,
    setSecondsRemaining,
    setStatus,
  ]);

  const startNonFadeTimerRef =
    useRef<(remaining: number) => void>(() => undefined);
  const beginCrossfadeRef =
    useRef<() => Promise<void>>(async () => undefined);

  const startNonFadeTimer = useCallback(
    (remaining: number) => {
      clearPlayTimer();

      const safeRemaining = Math.max(0, remaining);
      setSecondsRemaining(safeRemaining);

      if (safeRemaining <= 0) {
        void beginCrossfadeRef.current();
        return;
      }

      phaseEndRef.current = Date.now() + safeRemaining * 1000;

      timerRef.current = window.setInterval(() => {
        const phaseEnd = phaseEndRef.current;

        if (phaseEnd === null) return;

        const nextRemaining = Math.max(
          0,
          Math.ceil((phaseEnd - Date.now()) / 1000)
        );

        if (nextRemaining !== secondsRemainingRef.current) {
          setSecondsRemaining(nextRemaining);
        }

        if (nextRemaining <= 0) {
          clearPlayTimer();
          void beginCrossfadeRef.current();
        }
      }, 100);
    }, [clearPlayTimer, setSecondsRemaining]
  );

  startNonFadeTimerRef.current = startNonFadeTimer;

  const finalizeCrossfade = useCallback(
    (
      outgoing: HTMLAudioElement | null,
      incoming: HTMLAudioElement,
      nextIndex: number,
      nextTrack: PlaybackTrack
    ) => {
      clearCrossfade();

      disposeAudio(outgoing);

      incoming.volume = 1;
      audioRef.current = incoming;
      activeTrackIdRef.current = nextTrack.id;
      incomingAudioRef.current = null;
      incomingIndexRef.current = null;

      transitionInProgressRef.current = false;
      setIsCrossfading(false);
      setRevealed(false);
      setCurrentIndex(nextIndex);
      setSecondsRemaining(playtimeSeconds);
      setStatus("playing");

      prepareIncoming(nextIndex + 1);
      startNonFadeTimerRef.current(playtimeSeconds);
    },
    [
      clearCrossfade,
      playtimeSeconds,
      prepareIncoming,
      setCurrentIndex,
      setSecondsRemaining,
      setStatus,
    ]
  );

  const beginCrossfade = useCallback(async () => {
    if (transitionInProgressRef.current) return;

    const index = currentIndexRef.current;
    const activeTracks = tracksRef.current;
    const nextIndex = index + 1;

    if (
      !continuousRef.current ||
      nextIndex >= activeTracks.length
    ) {
      finishAndReveal();
      return;
    }

    const nextTrack = activeTracks[nextIndex];

    if (!nextTrack) {
      finishAndReveal();
      return;
    }

    transitionInProgressRef.current = true;
    clearPlayTimer();
    setSecondsRemaining(0);
    setRevealed(true);
    setIsCrossfading(true);
    setStatus("playing");

    const outgoing = audioRef.current;
    let incoming = prepareIncoming(nextIndex);

    if (!nextTrack.audioUrl || !incoming) {
      /* Countdown-only fallback: advance immediately with no silence timer. */
      transitionInProgressRef.current = false;
      setIsCrossfading(false);
      setRevealed(false);
      setCurrentIndex(nextIndex);
      setSecondsRemaining(playtimeSeconds);
      setStatus("countdown");
      prepareIncoming(nextIndex + 1);
      startNonFadeTimerRef.current(playtimeSeconds);
      return;
    }

    try {
      await seekAudioToBeatAlignedStart(
        incoming,
        nextTrack,
        playtimeSeconds
      );

      await waitForSeekToSettle(
        incoming
      );

      incoming.volume = 0;

      try {
        await incoming.play();
      } catch (preferredStartError) {
        console.warn(
          "Beat-aligned crossfade start failed; retrying from the beginning.",
          preferredStartError
        );

        incoming.pause();

        try {
          incoming.currentTime = 0;
        } catch {
          // Continue; play() below is still worth trying.
        }

        incoming.volume = 0;

        await incoming.play();
      }
    } catch (error) {
      setPlaybackError(
        error instanceof Error
          ? `The next song could not start: ${error.message}`
          : "The next song could not start."
      );

      /*
       * Do not let the outgoing song continue indefinitely when
       * the next Serato audio file is missing or cannot be played.
       *
       * Advance the game state to the failed track in countdown-only
       * mode. The following transition can then continue normally.
       */
      disposeAudio(outgoing);
      disposeAudio(incoming);

      audioRef.current = null;
      activeTrackIdRef.current = null;
      incomingAudioRef.current = null;
      incomingIndexRef.current = null;

      transitionInProgressRef.current = false;
      setIsCrossfading(false);
      setRevealed(false);
      setCurrentIndex(nextIndex);
      setSecondsRemaining(playtimeSeconds);
      setStatus("countdown");

      prepareIncoming(nextIndex + 1);
      startNonFadeTimerRef.current(playtimeSeconds);
      return;
    }

    const fadeMilliseconds =
      Math.max(1, crossfadeSecondsRef.current) * 1000;

    if (fadeMilliseconds <= 0) {
      finalizeCrossfade(
        outgoing,
        incoming,
        nextIndex,
        nextTrack
      );
      return;
    }

    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = clamp(
        (now - startedAt) / fadeMilliseconds,
        0,
        1
      );

      if (outgoing) {
        outgoing.volume = 1 - progress;
      }

      incoming!.volume = progress;

      if (progress >= 1) {
        finalizeCrossfade(
          outgoing,
          incoming!,
          nextIndex,
          nextTrack
        );
        return;
      }

      crossfadeFrameRef.current =
        window.requestAnimationFrame(step);
    };

    crossfadeFrameRef.current =
      window.requestAnimationFrame(step);
  }, [
    clearPlayTimer,
    finalizeCrossfade,
    finishAndReveal,
    playtimeSeconds,
    prepareIncoming,
    setCurrentIndex,
    setSecondsRemaining,
    setStatus,
  ]);

  beginCrossfadeRef.current = beginCrossfade;

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    if (!tracks[currentIndex]) return;

    if (
      activeTrackIdRef.current !== tracks[currentIndex].id
    ) {
      prepareActiveAudio(currentIndex);
    } else {
      prepareIncoming(currentIndex + 1);
    }
  }, [currentIndex, prepareActiveAudio, prepareIncoming, tracks]);

  useEffect(() => {
    if (
      status === "idle" ||
      status === "ready"
    ) {
      setSecondsRemaining(playtimeSeconds);
    }
  }, [playtimeSeconds, setSecondsRemaining, status]);

  const loadTracks = useCallback(
    (
      newTracks: PlaybackTrack[],
      initialIndex = 0
    ) => {
      stopAllAudio();

      const safeIndex =
        newTracks.length > 0
          ? clamp(
              Number.isFinite(initialIndex)
                ? Math.floor(initialIndex)
                : 0,
              0,
              newTracks.length - 1
            )
          : 0;

      tracksRef.current = newTracks;
      setTracks(newTracks);
      setCurrentIndex(safeIndex);
      setSecondsRemaining(playtimeSeconds);
      setRevealed(false);
      setPlaybackError(null);
      setStatus(newTracks.length > 0 ? "ready" : "idle");
    },
    [
      playtimeSeconds,
      setCurrentIndex,
      setSecondsRemaining,
      setStatus,
      stopAllAudio,
    ]
  );

  // BTTB_PLAYBACK_CHECKPOINT_RESTORE_V1
  const restoreCheckpoint = useCallback(
    async ({
      secondsRemaining:
        restoredSecondsRemaining,
      playbackTime,
      revealed:
        restoredRevealed = false,
    }: {
      secondsRemaining: number;
      playbackTime?: number | null;
      revealed?: boolean;
    }) => {
      const safeRemaining =
        clamp(
          Number.isFinite(
            restoredSecondsRemaining
          )
            ? restoredSecondsRemaining
            : playtimeSeconds,
          0,
          playtimeSeconds
        );

      const shouldReveal =
        restoredRevealed ||
        safeRemaining <= 0;

      setSecondsRemaining(
        safeRemaining
      );
      setRevealed(
        shouldReveal
      );
      setPlaybackError(null);
      setStatus(
        tracksRef.current.length > 0
          ? shouldReveal
            ? "revealed"
            : "paused"
          : "idle"
      );

      const safePlaybackTime =
        typeof playbackTime ===
          "number" &&
        Number.isFinite(
          playbackTime
        ) &&
        playbackTime >= 0
          ? playbackTime
          : null;

      if (
        safePlaybackTime ===
        null
      ) {
        return;
      }

      const track =
        tracksRef.current[
          currentIndexRef.current
        ];

      if (
        !track?.audioUrl
      ) {
        return;
      }

      const audio =
        prepareActiveAudio(
          currentIndexRef.current
        );

      if (!audio) {
        return;
      }

      if (
        audio.readyState < 1
      ) {
        await new Promise<void>(
          (resolve) => {
            let settled = false;

            const finish = () => {
              if (settled) {
                return;
              }

              settled = true;
              resolve();
            };

            audio.addEventListener(
              "loadedmetadata",
              finish,
              {
                once: true,
              }
            );

            window.setTimeout(
              finish,
              1500
            );
          }
        );
      }

      try {
        const maxTime =
          Number.isFinite(
            audio.duration
          ) &&
          audio.duration > 0
            ? Math.max(
                0,
                audio.duration -
                  0.25
              )
            : safePlaybackTime;

        audio.currentTime =
          Math.min(
            safePlaybackTime,
            maxTime
          );
      } catch (error) {
        console.warn(
          "Unable to restore the saved audio playhead:",
          error
        );
      }
    },
    [
      playtimeSeconds,
      prepareActiveAudio,
      setSecondsRemaining,
      setStatus,
    ]
  );

  const start = useCallback(async () => {
    const track = tracksRef.current[currentIndexRef.current];

    if (!track) return;

    clearPlayTimer();
    clearCrossfade();
    setPlaybackError(null);
    setRevealed(false);

    const remaining =
      secondsRemainingRef.current > 0
        ? secondsRemainingRef.current
        : playtimeSeconds;

    setSecondsRemaining(remaining);

    const audio = prepareActiveAudio(currentIndexRef.current);

    if (track.audioUrl && audio) {
      try {
        audio.volume = 1;

        const freshStart =
          audio.ended ||
          audio.currentTime < 1 ||
          remaining >= playtimeSeconds;

        if (freshStart) {
          await seekAudioToBeatAlignedStart(
            audio,
            track,
            playtimeSeconds
          );

          await waitForSeekToSettle(
            audio
          );
        }

        try {
          await audio.play();
        } catch (preferredStartError) {
          /*
           * Some MP3s can stream normally but reject a mid-file
           * seek. Never let that create a silent Bingo song.
           */
          console.warn(
            "Beat-aligned audio start failed; retrying from the beginning.",
            preferredStartError
          );

          audio.pause();

          try {
            audio.currentTime = 0;
          } catch {
            // Continue; play() below is still worth trying.
          }

          audio.volume = 1;

          await audio.play();
        }

        setStatus("playing");
        startNonFadeTimerRef.current(remaining);
        return;
      } catch (error) {
        setPlaybackError(
          error instanceof Error
            ? `Audio playback failed: ${error.message}`
            : "The browser could not start this audio."
        );
      }
    }

    setStatus("countdown");
    startNonFadeTimerRef.current(remaining);
  }, [
    clearCrossfade,
    clearPlayTimer,
    playtimeSeconds,
    prepareActiveAudio,
    setSecondsRemaining,
    setStatus,
  ]);

  const pause = useCallback(() => {
    clearPlayTimer();

    if (transitionInProgressRef.current) {
      /* Finish the overlap immediately, then pause the incoming track. */
      clearCrossfade();

      const outgoing = audioRef.current;
      const incoming = incomingAudioRef.current;
      const nextIndex = currentIndexRef.current + 1;
      const nextTrack = tracksRef.current[nextIndex];

      if (incoming && nextTrack) {
        disposeAudio(outgoing);
        incoming.volume = 1;
        incoming.pause();
        audioRef.current = incoming;
        activeTrackIdRef.current = nextTrack.id;
        incomingAudioRef.current = null;
        incomingIndexRef.current = null;
        setCurrentIndex(nextIndex);
        setSecondsRemaining(playtimeSeconds);
      } else {
        outgoing?.pause();
      }

      transitionInProgressRef.current = false;
      setIsCrossfading(false);
      setRevealed(false);
    } else {
      audioRef.current?.pause();
    }

    setStatus("paused");
  }, [
    clearCrossfade,
    clearPlayTimer,
    playtimeSeconds,
    setCurrentIndex,
    setSecondsRemaining,
    setStatus,
  ]);

  const resume = useCallback(async () => {
    if (secondsRemainingRef.current <= 0) return;

    setPlaybackError(null);
    setRevealed(false);

    const track = tracksRef.current[currentIndexRef.current];
    const audio = prepareActiveAudio(currentIndexRef.current);

    if (track?.audioUrl && audio) {
      try {
        audio.volume = 1;
        await audio.play();
        setStatus("playing");
        startNonFadeTimerRef.current(
          secondsRemainingRef.current
        );
        return;
      } catch (error) {
        setPlaybackError(
          error instanceof Error
            ? `Audio resume failed: ${error.message}`
            : "The browser could not resume this audio."
        );
      }
    }

    setStatus("countdown");
    startNonFadeTimerRef.current(
      secondsRemainingRef.current
    );
  }, [prepareActiveAudio, setStatus]);

  const restart = useCallback(() => {
    clearPlayTimer();
    clearCrossfade();
    clearIncomingAudio();

    const audio = prepareActiveAudio(currentIndexRef.current);

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    }

    transitionInProgressRef.current = false;
    setIsCrossfading(false);
    setSecondsRemaining(playtimeSeconds);
    setStatus(tracksRef.current.length > 0 ? "ready" : "idle");
    setRevealed(false);
    setPlaybackError(null);
  }, [
    clearCrossfade,
    clearIncomingAudio,
    clearPlayTimer,
    playtimeSeconds,
    prepareActiveAudio,
    setSecondsRemaining,
    setStatus,
  ]);

  const stop = restart;

  const reveal = useCallback(() => {
    if (
      continuousRef.current &&
      currentIndexRef.current < tracksRef.current.length - 1 &&
      (statusRef.current === "playing" ||
        statusRef.current === "countdown")
    ) {
      clearPlayTimer();
      setSecondsRemaining(0);
      void beginCrossfadeRef.current();
      return;
    }

    finishAndReveal();
  }, [clearPlayTimer, finishAndReveal, setSecondsRemaining]);

  const hide = useCallback(() => {
    clearPlayTimer();
    setStatus(tracksRef.current.length > 0 ? "ready" : "idle");
    setRevealed(false);
  }, [clearPlayTimer, setStatus]);

  const goToTrack = useCallback(
    (newIndex: number) => {
      clearPlayTimer();
      clearCrossfade();
      clearIncomingAudio();

      audioRef.current?.pause();
      transitionInProgressRef.current = false;
      setIsCrossfading(false);

      const safeIndex = clamp(
        newIndex,
        0,
        Math.max(tracksRef.current.length - 1, 0)
      );

      setCurrentIndex(safeIndex);
      setSecondsRemaining(playtimeSeconds);
      setRevealed(false);
      setPlaybackError(null);
      setStatus(
        tracksRef.current.length > 0 ? "ready" : "idle"
      );
    },
    [
      clearCrossfade,
      clearIncomingAudio,
      clearPlayTimer,
      playtimeSeconds,
      setCurrentIndex,
      setSecondsRemaining,
      setStatus,
    ]
  );

  const next = useCallback(() => {
    if (
      currentIndexRef.current >=
      tracksRef.current.length - 1
    ) {
      stopAllAudio();
      setStatus("finished");
      setRevealed(true);
      return;
    }

    if (
      continuousRef.current &&
      (statusRef.current === "playing" ||
        statusRef.current === "countdown")
    ) {
      clearPlayTimer();
      setSecondsRemaining(0);
      void beginCrossfadeRef.current();
      return;
    }

    goToTrack(currentIndexRef.current + 1);
  }, [
    clearPlayTimer,
    goToTrack,
    setSecondsRemaining,
    setStatus,
    stopAllAudio,
  ]);

  const previous = useCallback(() => {
    goToTrack(currentIndexRef.current - 1);
  }, [goToTrack]);

  const updateCrossfadeSeconds = useCallback((value: number) => {
    const safeValue = clamp(
      Number.isFinite(value) ? value : 4,
      1,
      15
    );

    crossfadeSecondsRef.current = safeValue;
    setCrossfadeSecondsState(safeValue);

    try {
      localStorage.setItem(
        "bttb-v2-crossfade-seconds",
        String(safeValue)
      );
    } catch {
      // Storage is optional; playback still works without it.
    }
  }, []);

  useEffect(() => {
    try {
      const saved = Number(
        localStorage.getItem("bttb-v2-crossfade-seconds")
      );

      if (Number.isFinite(saved)) {
        updateCrossfadeSeconds(saved);
      }
    } catch {
      // Use the default four-second crossfade.
    }
  }, [updateCrossfadeSeconds]);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

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
      setCrossfadeSeconds: updateCrossfadeSeconds,
      isCrossfading,
      playbackError,
      hasPlayableAudio,
      loadTracks,
      restoreCheckpoint,
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
      updateCrossfadeSeconds,
      isCrossfading,
      playbackError,
      hasPlayableAudio,
      loadTracks,
      restoreCheckpoint,
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
