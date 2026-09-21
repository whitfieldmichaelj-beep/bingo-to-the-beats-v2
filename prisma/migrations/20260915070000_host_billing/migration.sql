CREATE TABLE "HostBilling" (
  "clerkId" TEXT NOT NULL PRIMARY KEY,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "checkoutSessionId" TEXT,
  "checkoutAttempt" TEXT,
  "planId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'none',
  "accessUntil" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "activeGameId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "HostBilling_stripeCustomerId_key" ON "HostBilling"("stripeCustomerId");
CREATE UNIQUE INDEX "HostBilling_stripeSubscriptionId_key" ON "HostBilling"("stripeSubscriptionId");
CREATE UNIQUE INDEX "HostBilling_checkoutSessionId_key" ON "HostBilling"("checkoutSessionId");

ALTER TABLE "Game" ADD COLUMN "hostBillingRequired" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
