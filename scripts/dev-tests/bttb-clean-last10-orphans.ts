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

  const purchases = await prisma.purchase.findMany({
    where: {
      gameId: game.id,
      playerKey: {
        startsWith: "last10-",
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

  console.log("\n=== FAILED LAST10 RECORDS ===");
  console.log("Purchase rows found:", purchases.length);

  for (const p of purchases) {
    console.log(
      p.id,
      "|",
      p.playerKey,
      "| cards:",
      p.cards.length
    );
  }

  if (purchases.length === 0) {
    throw new Error(
      "No last10 test purchases found. No changes made."
    );
  }

  const purchaseIds = purchases.map((p) => p.id);
  const playerKeys = purchases
    .map((p) => p.playerKey)
    .filter((v): v is string => Boolean(v));

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

  const remainingLast10 =
    await prisma.purchase.count({
      where: {
        gameId: game.id,
        playerKey: {
          startsWith: "last10-",
        },
      },
    });

  console.log("\n=== CLEANUP RESULT ===");
  console.log("Available cards:", available);
  console.log("Assigned cards:", assigned);
  console.log(
    "Remaining last10 purchases:",
    remainingLast10
  );

  const pass =
    available === 1 &&
    assigned === 24 &&
    remainingLast10 === 0;

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
