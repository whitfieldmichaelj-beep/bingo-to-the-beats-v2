CREATE TABLE "CompanionLibrarySnapshot" (
  "id" TEXT NOT NULL,
  "clerkId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'serato',
  "deviceName" TEXT,
  "libraryLabels" JSONB,
  "playlists" JSONB NOT NULL,
  "currentTrack" JSONB,
  "lastLibrarySyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastTrackSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanionLibrarySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanionLibrarySnapshot_clerkId_deviceId_provider_key"
ON "CompanionLibrarySnapshot"("clerkId", "deviceId", "provider");

CREATE INDEX "CompanionLibrarySnapshot_clerkId_provider_updatedAt_idx"
ON "CompanionLibrarySnapshot"("clerkId", "provider", "updatedAt");