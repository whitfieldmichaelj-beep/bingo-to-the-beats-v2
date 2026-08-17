import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const playerKey =
    "race-10way-1786491765543-e6f8a1bb";

  const purchaseId =
    "5a67c015-7af0-421c-9bde-ec4bb3559e58";

  const cardId =
    "48ee5984-a738-49f0-bc67-ada0ea918cb3";

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.bingoCard.update({
      where: { id: cardId },
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

  const total = await prisma.bingoCard.count({
    where: { gameId: game.id },
  });

  const assigned = await prisma.bingoCard.count({
    where: {
      gameId: game.id,
      status: "ASSIGNED",
    },
  });

  const available = await prisma.bingoCard.count({
    where: {
      gameId: game.id,
      status: "AVAILABLE",
      playerKey: null,
      purchaseId: null,
    },
  });

  console.log("\n=== LAST-CARD TEST SETUP ===");
  console.log("Total cards:", total);
  console.log("Assigned cards:", assigned);
  console.log("Available cards:", available);

  console.log(
    "\nRESULT:",
    total === 25 &&
    assigned === 24 &&
    available === 1
      ? "PASS ✅"
      : "FAIL ❌"
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
