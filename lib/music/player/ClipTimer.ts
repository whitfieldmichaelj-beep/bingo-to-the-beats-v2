// lib/music/player/ClipTimer.ts

export interface ClipTimerProgress {
  elapsedSeconds: number;
  remainingSeconds: number;
  percentage: number;
}

export interface ClipTimerOptions {
  clipLengthSeconds: number;
  fadeDurationSeconds: number;
  updateIntervalMilliseconds?: number;
  onProgress?: (
    progress: ClipTimerProgress
  ) => void;
  onFadeStart?: () => void;
  onComplete?: () => void;
}

export class ClipTimer {
  private clipLengthSeconds: number;
  private fadeDurationSeconds: number;
  private updateIntervalMilliseconds: number;

  private onProgress?: (
    progress: ClipTimerProgress
  ) => void;

  private onFadeStart?: () => void;
  private onComplete?: () => void;

  private intervalId: ReturnType<
    typeof setInterval
  > | null = null;

  private startedAtMilliseconds = 0;
  private elapsedBeforePauseMilliseconds = 0;
  private fadeStarted = false;
  private running = false;

  constructor(options: ClipTimerOptions) {
    this.clipLengthSeconds = Math.max(
      options.clipLengthSeconds,
      1
    );

    this.fadeDurationSeconds = Math.max(
      Math.min(
        options.fadeDurationSeconds,
        this.clipLengthSeconds
      ),
      0
    );

    this.updateIntervalMilliseconds =
      options.updateIntervalMilliseconds ?? 100;

    this.onProgress = options.onProgress;
    this.onFadeStart = options.onFadeStart;
    this.onComplete = options.onComplete;
  }

  start(): void {
    this.stop();

    this.elapsedBeforePauseMilliseconds = 0;
    this.fadeStarted = false;
    this.running = true;
    this.startedAtMilliseconds = performance.now();

    this.emitProgress();
    this.startInterval();
  }

  pause(): void {
    if (!this.running) {
      return;
    }

    this.elapsedBeforePauseMilliseconds =
      this.getElapsedMilliseconds();

    this.running = false;
    this.clearInterval();
  }

  resume(): void {
    if (this.running) {
      return;
    }

    const clipLengthMilliseconds =
      this.clipLengthSeconds * 1000;

    if (
      this.elapsedBeforePauseMilliseconds >=
      clipLengthMilliseconds
    ) {
      return;
    }

    this.running = true;
    this.startedAtMilliseconds = performance.now();

    this.startInterval();
  }

  reset(): void {
    this.stop();

    this.elapsedBeforePauseMilliseconds = 0;
    this.fadeStarted = false;

    this.onProgress?.({
      elapsedSeconds: 0,
      remainingSeconds: this.clipLengthSeconds,
      percentage: 0,
    });
  }

  stop(): void {
    this.clearInterval();
    this.running = false;
  }

  updateDurations(
    clipLengthSeconds: number,
    fadeDurationSeconds: number
  ): void {
    this.clipLengthSeconds = Math.max(
      clipLengthSeconds,
      1
    );

    this.fadeDurationSeconds = Math.max(
      Math.min(
        fadeDurationSeconds,
        this.clipLengthSeconds
      ),
      0
    );
  }

  getElapsedSeconds(): number {
    return this.getElapsedMilliseconds() / 1000;
  }

  getRemainingSeconds(): number {
    return Math.max(
      this.clipLengthSeconds -
        this.getElapsedSeconds(),
      0
    );
  }

  isRunning(): boolean {
    return this.running;
  }

  private startInterval(): void {
    this.clearInterval();

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.updateIntervalMilliseconds);
  }

  private tick(): void {
    const elapsedSeconds =
      this.getElapsedSeconds();

    const remainingSeconds = Math.max(
      this.clipLengthSeconds - elapsedSeconds,
      0
    );

    if (
      !this.fadeStarted &&
      this.fadeDurationSeconds > 0 &&
      remainingSeconds <=
        this.fadeDurationSeconds
    ) {
      this.fadeStarted = true;
      this.onFadeStart?.();
    }

    this.emitProgress();

    if (
      elapsedSeconds >=
      this.clipLengthSeconds
    ) {
      this.elapsedBeforePauseMilliseconds =
        this.clipLengthSeconds * 1000;

      this.stop();
      this.onComplete?.();
    }
  }

  private emitProgress(): void {
    const elapsedSeconds = Math.min(
      this.getElapsedSeconds(),
      this.clipLengthSeconds
    );

    const remainingSeconds = Math.max(
      this.clipLengthSeconds -
        elapsedSeconds,
      0
    );

    const percentage = Math.min(
      Math.max(
        (elapsedSeconds /
          this.clipLengthSeconds) *
          100,
        0
      ),
      100
    );

    this.onProgress?.({
      elapsedSeconds,
      remainingSeconds,
      percentage,
    });
  }

  private getElapsedMilliseconds(): number {
    if (!this.running) {
      return this.elapsedBeforePauseMilliseconds;
    }

    return (
      this.elapsedBeforePauseMilliseconds +
      (performance.now() -
        this.startedAtMilliseconds)
    );
  }

  private clearInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}