CREATE TABLE "GamePlayerSeat" (
  "gameId" TEXT NOT NULL,
  "playerKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GamePlayerSeat_pkey" PRIMARY KEY ("gameId", "playerKey"),
  CONSTRAINT "GamePlayerSeat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "GamePlayerSeat" ("gameId", "playerKey")
SELECT DISTINCT p."gameId", p."playerKey" FROM "Purchase" p JOIN "Game" g ON g.id=p."gameId"
WHERE g."hostBillingRequired"=true AND p."playerKey" IS NOT NULL
ON CONFLICT DO NOTHING;
