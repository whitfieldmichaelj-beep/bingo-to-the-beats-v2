import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const playerKeys = [
    "atomic-same-1786494977792-b7604376",
    "partial-B-1786492803992-a812292a",
  ];

  const purchases = await prisma.purchase.findMany({
    where: {
      gameId: game.id,
      playerKey: {
        in: playerKeys,
      },
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

  const cardCount = purchases.reduce(
    (sum, purchase) => sum + purchase.cards.length,
    0
  );

  console.log("\n=== TEST RECORDS FOUND ===");

  for (const purchase of purchases) {
    console.log(
      purchase.playerKey,
      "| purchase:",
      purchase.id,
      "| cards:",
      purchase.cards.length
    );
  }

  console.log("Total cards to release:", cardCount);

  if (purchases.length !== 2 || cardCount !== 3) {
    throw new Error(
      `Expected 2 purchases with exactly 3 cards total. Found ${purchases.length} purchases and ${cardCount} cards. No changes made.`
    );
  }

  const purchaseIds = purchases.map(
    (purchase) => purchase.id
  );

  await prisma.$transaction(async (tx) => {
    await tx.bingoCard.updateMany({
      where: {
        gameId: game.id,
        purchaseId: {
          in: purchaseIds,
        },
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
        sessionKey: {
          in: playerKeys,
        },
      },
    });

    await tx.purchase.deleteMany({
      where: {
        gameId: game.id,
        id: {
          in: purchaseIds,
        },
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

  console.log("\n=== THREE-CARD RESET ===");
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
