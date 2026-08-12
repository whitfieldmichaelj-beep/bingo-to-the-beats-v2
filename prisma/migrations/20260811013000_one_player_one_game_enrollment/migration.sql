-- BTTB_ONE_PLAYER_ONE_GAME_ENROLLMENT_V1
-- A non-null trusted player identity may have only one purchase per game.
CREATE UNIQUE INDEX "Purchase_gameId_playerKey_key"
ON "Purchase"("gameId", "playerKey");
