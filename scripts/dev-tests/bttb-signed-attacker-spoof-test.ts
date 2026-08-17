import { createRequire } from "node:module";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const victimPlayerId =
    "mixed-qty-1786496145442-a8f113da";

  const victimPurchaseId =
    "9e053a77-bfb9-46dd-a591-4d4320010b7b";

  const attackerPlayerId =
    `signed-attacker-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const secret =
    (process.env.BTTB_PLAYER_SESSION_SECRET ?? "").trim();

  if (secret.length < 32) {
    throw new Error("Session secret missing");
  }

  const attackerToken = await new SignJWT({})
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(attackerPlayerId)
    .setIssuer("bingo-to-the-beats")
    .setAudience("bttb-player")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(secret));

  const base =
    process.env.BASE_URL ||
    "http://127.0.0.1:3000";

  const response = await fetch(
    base + "/api/game/join",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie:
          `bttb-player-session=${attackerToken}`,
      },
      body: JSON.stringify({
        joinCode: "6XWEGB",
        playerName: "Signed Attacker Test",

        // Deliberately try to claim victim identity.
        playerId: victimPlayerId,
        purchaseId: victimPurchaseId,

        cardQuantity: 3,
      }),
    }
  );

  const body = await response.json();

  console.log(
    "\n=== SIGNED ATTACKER BODY-SPOOF TEST ==="
  );
  console.log(
    "Attacker JWT subject:",
    attackerPlayerId
  );
  console.log("HTTP:", response.status);
  console.log("ok:", body?.ok);
  console.log("rejoined:", body?.rejoined);
  console.log(
    "player returned:",
    body?.player ?? null
  );
  console.log(
    "message:",
    body?.message ??
      body?.error ??
      null
  );

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const victimPurchases =
    await prisma.purchase.findMany({
      where: {
        gameId: game.id,
        playerKey: victimPlayerId,
      },
      include: {
        cards: {
          select: { id: true },
        },
      },
    });

  const attackerPurchases =
    await prisma.purchase.count({
      where: {
        gameId: game.id,
        playerKey: attackerPlayerId,
      },
    });

  const attackerSessions =
    await prisma.gameSession.count({
      where: {
        gameId: game.id,
        sessionKey: attackerPlayerId,
      },
    });

  const available =
    await prisma.bingoCard.count({
      where: {
        gameId: game.id,
        status: "AVAILABLE",
        playerKey: null,
        purchaseId: null,
      },
    });

  console.log("\n=== DATABASE CHECK ===");
  console.log(
    "Victim purchase rows:",
    victimPurchases.length
  );
  console.log(
    "Victim purchase ID:",
    victimPurchases[0]?.id ?? null
  );
  console.log(
    "Victim cards:",
    victimPurchases[0]?.cards.length ?? 0
  );
  console.log(
    "Attacker purchases:",
    attackerPurchases
  );
  console.log(
    "Attacker sessions:",
    attackerSessions
  );
  console.log(
    "Available cards:",
    available
  );

  const requestPass =
    response.status === 409 &&
    body?.ok !== true &&
    body?.rejoined !== true &&
    !body?.player;

  const databasePass =
    victimPurchases.length === 1 &&
    victimPurchases[0]?.id ===
      victimPurchaseId &&
    victimPurchases[0]?.cards.length === 1 &&
    attackerPurchases === 0 &&
    attackerSessions === 0 &&
    available === 2;

  console.log(
    "\nSigned JWT subject enforced:",
    requestPass
  );
  console.log(
    "Victim protected:",
    databasePass
  );

  console.log(
    "\nRESULT:",
    requestPass && databasePass
      ? "PASS ✅"
      : "FAIL ❌"
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
