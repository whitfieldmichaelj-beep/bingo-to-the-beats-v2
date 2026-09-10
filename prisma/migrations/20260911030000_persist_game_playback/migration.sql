-- Preserve provider-specific playback details without changing existing games/cards.
ALTER TABLE "Game" ADD COLUMN "playbackConfig" JSONB;
