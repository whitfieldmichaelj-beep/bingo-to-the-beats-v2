import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const playerKey = process.env.TEST_PLAYER_ID;
  const joinCode = process.env.JOIN_CODE;

  const game = await prisma.game.findFirst({
    where: { joinCode },
    select: { id: true, joinCode: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      gameId: game.id,
      playerKey,
    },
    include: {
      cards: {
        select: {
          id: true,
          cardNumber: true,
        },
        orderBy: {
          cardNumber: "asc",
        },
      },
    },
  });

  console.log("\n=== DATABASE PURCHASE CHECK ===");
  console.log("Player:", playerKey);
  console.log("Game:", game.joinCode);
  console.log("Purchase rows:", purchases.length);

  const p = purchases[0];

  if (p) {
    console.log("Purchase ID:", p.id);
    console.log("Status:", p.status);
    console.log("Quantity:", p.quantity);
    console.log("Amount:", Number(p.amount));
    console.log("Card count:", p.cards.length);
    console.log("Cards:", p.cards);
  }

  const pass =
    purchases.length === 1 &&
    p?.id === "6375f888-d317-49bf-813f-1079d6b675a6" &&
    p?.quantity === 3 &&
    Number(p?.amount) === 12 &&
    p?.cards.length === 3;

  console.log("\n=== DATABASE TEST ===");
  console.log("Exactly one purchase:", purchases.length === 1);
  console.log(
    "Correct purchase ID:",
    p?.id === "6375f888-d317-49bf-813f-1079d6b675a6"
  );
  console.log("Quantity is 3:", p?.quantity === 3);
  console.log("Amount is $12:", Number(p?.amount) === 12);
  console.log("Exactly 3 assigned cards:", p?.cards.length === 3);

  console.log("\nRESULT:", pass ? "PASS ✅" : "FAIL ❌");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
