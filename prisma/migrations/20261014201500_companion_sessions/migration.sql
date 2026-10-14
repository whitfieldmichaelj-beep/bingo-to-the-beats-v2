CREATE TABLE "CompanionSession" (
  "id" TEXT NOT NULL,
  "clerkId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceName" TEXT,
  "tokenHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanionSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanionSession_tokenHash_key" ON "CompanionSession"("tokenHash");
CREATE UNIQUE INDEX "CompanionSession_clerkId_deviceId_key" ON "CompanionSession"("clerkId", "deviceId");
CREATE INDEX "CompanionSession_clerkId_isActive_idx" ON "CompanionSession"("clerkId", "isActive");
CREATE INDEX "CompanionSession_lastHeartbeatAt_idx" ON "CompanionSession"("lastHeartbeatAt");