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
    `mixed-qty-${Date.now()}-${randomUUID().slice(0, 8)}`;

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

  const quantities = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3];

  async function join(quantity: number) {
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
          playerName: "Mixed Quantity Race",
          cardQuantity: quantity,
        }),
      }
    );

    return {
      requestedQuantity: quantity,
      status: response.status,
      body: await response.json(),
    };
  }

  const results = await Promise.all(
    quantities.map((quantity) => join(quantity))
  );

  console.log("\n=== MIXED-QUANTITY SAME-PLAYER RACE ===");
  console.log("Player:", playerId);

  results.forEach((r, index) => {
    console.log(
      `Request ${index + 1}:`,
      "asked", r.requestedQuantity,
      "| HTTP", r.status,
      "| returned", r.body?.player?.cardQuantity ?? null,
      "| rejoined", r.body?.rejoined
    );
  });

  const allOk =
    results.every(
      (r) =>
        r.status === 200 &&
        r.body?.ok === true
    );

  const bodies = results.map((r) => r.body);

  const firstPurchase =
    bodies[0]?.player?.purchaseId;

  const samePurchase =
    bodies.every(
      (b) =>
        b.player?.purchaseId === firstPurchase
    );

  const winningQuantity =
    bodies[0]?.player?.cardQuantity;

  const sameQuantity =
    bodies.every(
      (b) =>
        b.player?.cardQuantity === winningQuantity
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

  console.log("\n=== DATABASE ===");
  console.log("Winning quantity:", winningQuantity);
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

  console.log("\n=== CONSISTENCY ===");
  console.log("All HTTP 200 / OK:", allOk);
  console.log("Same purchase:", samePurchase);
  console.log("Same returned quantity:", sameQuantity);
  console.log("Same cards:", sameCards);
  console.log("Original joins:", originalJoins);
  console.log("Rejoins:", rejoins);

  const validWinningQuantity =
    winningQuantity === 1 ||
    winningQuantity === 3;

  const correctRemaining =
    winningQuantity === 1
      ? available === 2
      : available === 0;

  const pass =
    allOk &&
    samePurchase &&
    sameQuantity &&
    sameCards &&
    validWinningQuantity &&
    originalJoins === 1 &&
    rejoins === 9 &&
    purchases.length === 1 &&
    purchases[0]?.quantity === winningQuantity &&
    purchases[0]?.cards.length === winningQuantity &&
    sessions === 1 &&
    correctRemaining;

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
