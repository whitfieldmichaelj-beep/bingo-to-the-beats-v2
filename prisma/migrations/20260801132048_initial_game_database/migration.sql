-- CreateEnum
CREATE TYPE "MusicProvider" AS ENUM ('SPOTIFY', 'APPLE_MUSIC', 'TIDAL', 'SERATO', 'LOCAL_UPLOAD');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'ACTIVE', 'WINNER', 'VOID');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicAccount" (
    "id" TEXT NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "userId" TEXT NOT NULL,
    "providerUserId" TEXT,
    "displayName" TEXT,
    "email" TEXT,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "providerListId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "artworkUrl" TEXT,
    "ownerName" TEXT,
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotId" TEXT,
    "userId" TEXT NOT NULL,
    "musicAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "provider" "MusicProvider" NOT NULL,
    "providerTrackId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "artworkUrl" TEXT,
    "previewUrl" TEXT,
    "durationMs" INTEGER,
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "uri" TEXT,
    "isrc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("playlistId","trackId")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "playlistId" TEXT,
    "title" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'DRAFT',
    "cardPrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxPlayers" INTEGER NOT NULL DEFAULT 200,
    "winningRule" TEXT NOT NULL DEFAULT 'LINE',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTrack" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3),

    CONSTRAINT "GameTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoCard" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "cardNumber" INTEGER NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "playerName" TEXT,
    "playerKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BingoCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardSquare" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "marked" BOOLEAN NOT NULL DEFAULT false,
    "markedAt" TIMESTAMP(3),

    CONSTRAINT "CardSquare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "playerName" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT,
    "cardId" TEXT,
    "stripePaymentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Winner" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "winningType" TEXT NOT NULL,
    "prizeAmount" DECIMAL(10,2),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Winner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MusicAccount_userId_idx" ON "MusicAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicAccount_userId_provider_key" ON "MusicAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");

-- CreateIndex
CREATE INDEX "Playlist_musicAccountId_idx" ON "Playlist"("musicAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_userId_provider_providerListId_key" ON "Playlist"("userId", "provider", "providerListId");

-- CreateIndex
CREATE INDEX "Track_title_idx" ON "Track"("title");

-- CreateIndex
CREATE INDEX "Track_artist_idx" ON "Track"("artist");

-- CreateIndex
CREATE UNIQUE INDEX "Track_provider_providerTrackId_key" ON "Track"("provider", "providerTrackId");

-- CreateIndex
CREATE INDEX "PlaylistTrack_trackId_idx" ON "PlaylistTrack"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_playlistId_position_key" ON "PlaylistTrack"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Game_joinCode_key" ON "Game"("joinCode");

-- CreateIndex
CREATE INDEX "Game_hostId_idx" ON "Game"("hostId");

-- CreateIndex
CREATE INDEX "Game_playlistId_idx" ON "Game"("playlistId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "GameTrack_trackId_idx" ON "GameTrack"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "GameTrack_gameId_trackId_key" ON "GameTrack"("gameId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "GameTrack_gameId_position_key" ON "GameTrack"("gameId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "BingoCard_playerKey_key" ON "BingoCard"("playerKey");

-- CreateIndex
CREATE INDEX "BingoCard_gameId_idx" ON "BingoCard"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "BingoCard_gameId_cardNumber_key" ON "BingoCard"("gameId", "cardNumber");

-- CreateIndex
CREATE INDEX "CardSquare_trackId_idx" ON "CardSquare"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "CardSquare_cardId_position_key" ON "CardSquare"("cardId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CardSquare_cardId_trackId_key" ON "CardSquare"("cardId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_sessionKey_key" ON "GameSession"("sessionKey");

-- CreateIndex
CREATE INDEX "GameSession_gameId_idx" ON "GameSession"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_cardId_key" ON "Purchase"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_stripePaymentId_key" ON "Purchase"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Purchase_gameId_idx" ON "Purchase"("gameId");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_cardId_key" ON "Winner"("cardId");

-- CreateIndex
CREATE INDEX "Winner_gameId_idx" ON "Winner"("gameId");

-- AddForeignKey
ALTER TABLE "MusicAccount" ADD CONSTRAINT "MusicAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_musicAccountId_fkey" FOREIGN KEY ("musicAccountId") REFERENCES "MusicAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTrack" ADD CONSTRAINT "GameTrack_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTrack" ADD CONSTRAINT "GameTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoCard" ADD CONSTRAINT "BingoCard_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSquare" ADD CONSTRAINT "CardSquare_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BingoCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSquare" ADD CONSTRAINT "CardSquare_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BingoCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BingoCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
