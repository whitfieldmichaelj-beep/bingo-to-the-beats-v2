import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const playerKey =
    "last10-1-1786492848483-187b0a5e";

  const purchaseId =
    "4d8f7d08-6ab4-491a-85e6-4ff0f00691df";

  const cardId =
    "a894ef02-3a95-43b4-be30-ecb4e611c794";

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

  const available =
    await prisma.bingoCard.count({
      where: {
        gameId: game.id,
        status: "AVAILABLE",
        playerKey: null,
        purchaseId: null,
      },
    });

  const assigned =
    await prisma.bingoCard.count({
      where: {
        gameId: game.id,
        status: "ASSIGNED",
      },
    });

  console.log("\n=== FINAL-CARD RESET ===");
  console.log("Available cards:", available);
  console.log("Assigned cards:", assigned);

  console.log(
    "\nRESULT:",
    available === 1 && assigned === 24
      ? "PASS ✅"
      : "FAIL ❌"
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
