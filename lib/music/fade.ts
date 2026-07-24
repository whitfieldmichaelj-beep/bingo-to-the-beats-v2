// lib/music/fade.ts

import { DEFAULT_GAME_SETTINGS } from "@/lib/config/defaults";

export interface FadeControllerOptions {
  getVolume: () => number;
  setVolume: (volume: number) => void;
  defaultDurationSeconds?: number;
}

export interface FadeOptions {
  from?: number;
  to: number;
  durationSeconds?: number;
}

export interface FadeResult {
  completed: boolean;
  cancelled: boolean;
  finalVolume: number;
}

export class FadeController {
  private readonly readVolume: () => number;
  private readonly writeVolume: (
    volume: number
  ) => void;

  private readonly defaultDurationSeconds: number;

  private animationFrameId: number | null =
    null;

  private activeFadeId = 0;

  constructor(options: FadeControllerOptions) {
    this.readVolume = options.getVolume;
    this.writeVolume = options.setVolume;

    this.defaultDurationSeconds = Math.max(
      options.defaultDurationSeconds ??
        DEFAULT_GAME_SETTINGS.fadeDuration,
      0
    );
  }

  async fadeIn(
    durationSeconds =
      this.defaultDurationSeconds,
    targetVolume = 1
  ): Promise<FadeResult> {
    return this.fade({
      from: 0,
      to: targetVolume,
      durationSeconds,
    });
  }

  async fadeOut(
    durationSeconds =
      this.defaultDurationSeconds
  ): Promise<FadeResult> {
    return this.fade({
      from: this.getCurrentVolume(),
      to: 0,
      durationSeconds,
    });
  }

  async fade(
    options: FadeOptions
  ): Promise<FadeResult> {
    this.stop();

    const fadeId = ++this.activeFadeId;

    const fromVolume = this.clampVolume(
      options.from ??
        this.getCurrentVolume()
    );

    const targetVolume = this.clampVolume(
      options.to
    );

    const durationSeconds = Math.max(
      options.durationSeconds ??
        this.defaultDurationSeconds,
      0
    );

    this.writeVolume(fromVolume);

    if (
      durationSeconds === 0 ||
      fromVolume === targetVolume
    ) {
      this.writeVolume(targetVolume);

      return {
        completed: true,
        cancelled: false,
        finalVolume: targetVolume,
      };
    }

    const durationMilliseconds =
      durationSeconds * 1000;

    const startedAt = performance.now();

    return new Promise<FadeResult>(
      (resolve) => {
        const update = (
          currentTime: number
        ) => {
          if (
            fadeId !== this.activeFadeId
          ) {
            resolve({
              completed: false,
              cancelled: true,
              finalVolume:
                this.getCurrentVolume(),
            });

            return;
          }

          const elapsedMilliseconds =
            currentTime - startedAt;

          const progress = Math.min(
            Math.max(
              elapsedMilliseconds /
                durationMilliseconds,
              0
            ),
            1
          );

          const easedProgress =
            this.easeInOut(progress);

          const nextVolume =
            fromVolume +
            (targetVolume -
              fromVolume) *
              easedProgress;

          this.writeVolume(
            this.clampVolume(nextVolume)
          );

          if (progress >= 1) {
            this.animationFrameId = null;
            this.writeVolume(targetVolume);

            resolve({
              completed: true,
              cancelled: false,
              finalVolume: targetVolume,
            });

            return;
          }

          this.animationFrameId =
            requestAnimationFrame(update);
        };

        this.animationFrameId =
          requestAnimationFrame(update);
      }
    );
  }

  stop(): void {
    this.activeFadeId += 1;

    if (
      this.animationFrameId !== null
    ) {
      cancelAnimationFrame(
        this.animationFrameId
      );

      this.animationFrameId = null;
    }
  }

  setImmediateVolume(
    volume: number
  ): void {
    this.stop();

    this.writeVolume(
      this.clampVolume(volume)
    );
  }

  getCurrentVolume(): number {
    return this.clampVolume(
      this.readVolume()
    );
  }

  private clampVolume(
    volume: number
  ): number {
    if (!Number.isFinite(volume)) {
      return 1;
    }

    return Math.min(
      Math.max(volume, 0),
      1
    );
  }

  private easeInOut(
    progress: number
  ): number {
    return progress < 0.5
      ? 2 * progress * progress
      : 1 -
          Math.pow(
            -2 * progress + 2,
            2
          ) /
            2;
  }
}

export function createFadeController(
  options: FadeControllerOptions
): FadeController {
  return new FadeController(options);
}