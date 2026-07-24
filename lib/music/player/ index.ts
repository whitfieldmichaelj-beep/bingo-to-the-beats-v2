// lib/music/player/index.ts

export {
  MusicPlayer,
  musicPlayer,
} from "./MusicPlayer";

export { PlaybackController } from "./PlaybackController";

export {
  PlayerEventBus,
  type PlaybackStatus,
  type PlayerEventMap,
  type PlayerEventName,
  type PlayerEventListener,
} from "./EventBus";

export {
  ClipTimer,
  type ClipTimerOptions,
  type ClipTimerProgress,
} from "./ClipTimer";