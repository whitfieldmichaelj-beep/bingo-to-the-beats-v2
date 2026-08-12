-- DropIndex
DROP INDEX "BingoCard_gameId_playerKey_key";

-- CreateIndex
CREATE INDEX "BingoCard_gameId_playerKey_idx" ON "BingoCard"("gameId", "playerKey");
