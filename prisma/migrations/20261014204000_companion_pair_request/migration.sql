CREATE TABLE "CompanionPairRequest" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceName" TEXT,
  "clerkId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanionPairRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanionPairRequest_code_key" ON "CompanionPairRequest"("code");
CREATE UNIQUE INDEX "CompanionPairRequest_secretHash_key" ON "CompanionPairRequest"("secretHash");
CREATE UNIQUE INDEX "CompanionPairRequest_tokenHash_key" ON "CompanionPairRequest"("tokenHash");
CREATE INDEX "CompanionPairRequest_expiresAt_idx" ON "CompanionPairRequest"("expiresAt");
CREATE INDEX "CompanionPairRequest_deviceId_idx" ON "CompanionPairRequest"("deviceId");