/*
  Warnings:

  - You are about to drop the column `cardId` on the `Purchase` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gameId,playerKey]` on the table `BingoCard` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `signature` to the `BingoCard` table without a default value. This is not possible if the table is not empty.
  - Added the required column `column` to the `CardSquare` table without a default value. This is not possible if the table is not empty.
  - Added the required column `row` to the `CardSquare` table without a default value. This is not possible if the table is not empty.
  - Added the required column `playlistName` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `playlistTrackCount` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `Purchase` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_cardId_fkey";

-- DropIndex
DROP INDEX "BingoCard_playerKey_key";

-- DropIndex
DROP INDEX "Purchase_cardId_key";

-- AlterTable
ALTER TABLE "BingoCard" ADD COLUMN     "columns" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "rows" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "signature" TEXT NOT NULL,
ADD COLUMN     "squareCount" INTEGER NOT NULL DEFAULT 25;

-- AlterTable
ALTER TABLE "CardSquare" ADD COLUMN     "column" INTEGER NOT NULL,
ADD COLUMN     "row" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "currentTrackId" TEXT,
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "playlistName" TEXT NOT NULL,
ADD COLUMN     "playlistTrackCount" INTEGER NOT NULL,
ADD COLUMN     "requestedCardCount" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "songsPerCard" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "sourcePlaylistId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'READY',
ALTER COLUMN "winningRule" SET DEFAULT 'single-line';

-- AlterTable
ALTER TABLE "GameTrack" ADD COLUMN     "called" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "calledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Purchase" DROP COLUMN "cardId",
ADD COLUMN     "playerKey" TEXT,
ADD COLUMN     "playerName" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "bpm" DOUBLE PRECISION,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "filePath" TEXT;

-- CreateIndex
CREATE INDEX "BingoCard_purchaseId_idx" ON "BingoCard"("purchaseId");

-- CreateIndex
CREATE INDEX "BingoCard_playerKey_idx" ON "BingoCard"("playerKey");

-- CreateIndex
CREATE UNIQUE INDEX "BingoCard_gameId_playerKey_key" ON "BingoCard"("gameId", "playerKey");

-- CreateIndex
CREATE INDEX "Purchase_playerKey_idx" ON "Purchase"("playerKey");

-- AddForeignKey
ALTER TABLE "BingoCard" ADD CONSTRAINT "BingoCard_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
