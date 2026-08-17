import { createRequire } from "node:module";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const secret =
    (process.env.BTTB_PLAYER_SESSION_SECRET ?? "").trim();

  if (secret.length < 32) {
    throw new Error("Session secret missing");
  }

  const playerId =
    `atomic-multi-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(playerId)
    .setIssuer("bingo-to-the-beats")
    .setAudience("bttb-player")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(secret));

  const base =
    process.env.BASE_URL || "http://127.0.0.1:3000";

  async function join() {
    const response = await fetch(
      base + "/api/game/join",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `bttb-player-session=${token}`,
        },
        body: JSON.stringify({
          joinCode: "6XWEGB",
          playerName: "Atomic Multi Card",
          cardQuantity: 3,
        }),
      }
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  }

  const results = await Promise.all(
    Array.from({ length: 10 }, () => join())
  );

  const bodies = results.map((r) => r.body);

  const allOk =
    results.every(
      (r) =>
        r.status === 200 &&
        r.body?.ok === true
    );

  const samePlayer =
    bodies.every(
      (b) => b.player?.playerId === playerId
    );

  const firstPurchase =
    bodies[0]?.player?.purchaseId;

  const samePurchase =
    bodies.every(
      (b) => b.player?.purchaseId === firstPurchase
    );

  const firstCards =
    JSON.stringify(
      bodies[0]?.player?.cardIds ?? []
    );

  const sameCards =
    bodies.every(
      (b) =>
        JSON.stringify(
          b.player?.cardIds ?? []
        ) === firstCards
    );

  const exactlyThree =
    bodies.every(
      (b) =>
        b.player?.cardQuantity === 3 &&
        b.player?.cardIds?.length === 3 &&
        b.player?.amountCents === 1200
    );

  const originalJoins =
    bodies.filter(
      (b) => b.rejoined === false
    ).length;

  const rejoins =
    bodies.filter(
      (b) => b.rejoined === true
    ).length;

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const purchases =
    await prisma.purchase.findMany({
      where: {
        gameId: game.id,
        playerKey: playerId,
      },
      include: {
        cards: {
          select: {
            id: true,
            cardNumber: true,
          },
        },
      },
    });

  const sessions =
    await prisma.gameSession.count({
      where: {
        gameId: game.id,
        sessionKey: playerId,
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

  console.log("\n=== ATOMIC MULTI-CARD SAME-PLAYER RACE ===");
  console.log("Player:", playerId);
  console.log("Requests:", results.length);
  console.log("All HTTP 200 / OK:", allOk);
  console.log("Same player:", samePlayer);
  console.log("Same purchase:", samePurchase);
  console.log("Same 3 cards:", sameCards);
  console.log("3 cards / $12 preserved:", exactlyThree);
  console.log("Original joins:", originalJoins);
  console.log("Rejoins:", rejoins);

  console.log("\n=== DATABASE ===");
  console.log("Purchase rows:", purchases.length);
  console.log(
    "Purchase quantity:",
    purchases[0]?.quantity ?? null
  );
  console.log(
    "Cards on purchase:",
    purchases[0]?.cards.length ?? 0
  );
  console.log("GameSession rows:", sessions);
  console.log("Available cards:", available);

  if (purchases[0]) {
    console.log(
      "Purchase ID:",
      purchases[0].id
    );
    console.log(
      "Cards:",
      purchases[0].cards
    );
  }

  const pass =
    allOk &&
    samePlayer &&
    samePurchase &&
    sameCards &&
    exactlyThree &&
    originalJoins === 1 &&
    rejoins === 9 &&
    purchases.length === 1 &&
    purchases[0]?.quantity === 3 &&
    purchases[0]?.cards.length === 3 &&
    sessions === 1 &&
    available === 0;

  console.log(
    "\nRESULT:",
    pass ? "PASS ✅" : "FAIL ❌"
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
