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

  const purchase = await prisma.purchase.findFirst({
    where: {
      gameId: game.id,
      playerKey: {
        startsWith: "mixed-qty-",
      },
    },
    orderBy: {
      createdAt: "desc",
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

  const available = await prisma.bingoCard.count({
    where: {
      gameId: game.id,
      status: "AVAILABLE",
      playerKey: null,
      purchaseId: null,
    },
  });

  console.log("\n=== SECURITY TEST INFO ===");

  if (!purchase) {
    console.log("Mixed-quantity purchase: NOT FOUND");
  } else {
    console.log("Player:", purchase.playerKey);
    console.log("Purchase:", purchase.id);
    console.log("Quantity:", purchase.quantity);
    console.log("Cards:", purchase.cards);
  }

  console.log("Available cards:", available);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
