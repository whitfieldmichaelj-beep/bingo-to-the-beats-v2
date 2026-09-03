-- CreateTable
CREATE TABLE "PurchaseDispute" (
    "stripeDisputeId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "fundsWithdrawn" BOOLEAN NOT NULL DEFAULT false,
    "lastStatusEventCreated" BIGINT NOT NULL DEFAULT 0,
    "lastFundsEventCreated" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseDispute_pkey" PRIMARY KEY ("stripeDisputeId")
);

-- CreateIndex
CREATE INDEX "PurchaseDispute_purchaseId_idx" ON "PurchaseDispute"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseDispute_status_idx" ON "PurchaseDispute"("status");

-- AddForeignKey
ALTER TABLE "PurchaseDispute" ADD CONSTRAINT "PurchaseDispute_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
