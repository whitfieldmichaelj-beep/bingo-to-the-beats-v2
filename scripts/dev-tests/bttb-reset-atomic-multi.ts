import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const playerKey =
    "atomic-multi-1786495050521-b4f5bded";

  const purchaseId =
    "bcc1d63d-c45e-4a87-a20f-21480a2d9e8a";

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const cards = await prisma.bingoCard.findMany({
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

  console.log("Cards found:", cards);

  if (cards.length !== 3) {
    throw new Error(
      `Expected 3 cards, found ${cards.length}. No changes made.`
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
        gameId: game.id,
        id: purchaseId,
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

  console.log("\n=== ATOMIC PARTIAL-RACE RESET ===");
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
