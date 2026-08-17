import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const playerKey =
    "race-multicard-1786491119-29997";

  const purchaseId =
    "6375f888-d317-49bf-813f-1079d6b675a6";

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const ownedCards = await prisma.bingoCard.findMany({
    where: {
      gameId: game.id,
      purchaseId,
      playerKey,
    },
    select: {
      id: true,
      cardNumber: true,
    },
  });

  console.log("Test cards found:", ownedCards);

  if (ownedCards.length !== 3) {
    throw new Error(
      `Expected exactly 3 test cards, found ${ownedCards.length}. No changes made.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.bingoCard.updateMany({
      where: {
        gameId: game.id,
        purchaseId,
        playerKey,
      },
      data: {
        playerKey: null,
        playerName: null,
        purchaseId: null,
        status: "AVAILABLE",
      },
    });

    await tx.gameSession.deleteMany({
      where: {
        gameId: game.id,
        sessionKey: playerKey,
      },
    });

    await tx.purchase.deleteMany({
      where: {
        id: purchaseId,
        gameId: game.id,
        playerKey,
      },
    });
  });

  const available = await prisma.bingoCard.count({
    where: {
      gameId: game.id,
      status: "AVAILABLE",
      playerKey: null,
      purchaseId: null,
    },
  });

  const assigned = await prisma.bingoCard.count({
    where: {
      gameId: game.id,
      status: "ASSIGNED",
    },
  });

  console.log("\n=== PARTIAL-CAPACITY SETUP ===");
  console.log("Available cards:", available);
  console.log("Assigned cards:", assigned);

  console.log(
    "\nRESULT:",
    available === 3 && assigned === 22
      ? "PASS ✅"
      : "FAIL ❌"
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
