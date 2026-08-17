import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const playerKey =
    "soldout-test-1786491882863-58601763";

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
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
  });

  const sessions = await prisma.gameSession.findMany({
    where: {
      gameId: game.id,
      sessionKey: playerKey,
    },
  });

  console.log("\n=== SOLD-OUT DATABASE CHECK ===");
  console.log("Player:", playerKey);
  console.log("Purchase rows:", purchases.length);
  console.log("GameSession rows:", sessions.length);

  const pass =
    purchases.length === 0 &&
    sessions.length === 0;

  console.log("No purchase created:", purchases.length === 0);
  console.log("No player session created:", sessions.length === 0);

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
