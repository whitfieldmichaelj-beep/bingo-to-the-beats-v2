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
    `soldout-race-${Date.now()}-${randomUUID().slice(0, 8)}`;

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

  const request = async () => {
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
          playerName: "Sold Out Race Test",
          cardQuantity: 1,
        }),
      }
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => request())
  );

  console.log("\n=== 10-WAY SOLD-OUT RACE ===");
  console.log("Player:", playerId);
  console.log("Requests:", results.length);

  const statuses = results.map((r) => r.status);

  console.log("HTTP statuses:", statuses);

  console.log("\n=== INDIVIDUAL RESPONSES ===");
  results.forEach((r, i) => {
    console.log(
      `Request ${i + 1}:`,
      "HTTP", r.status,
      "| error:", r.body?.error ?? r.body?.message ?? "(none)"
    );
  });

  const all409 =
    results.every((r) => r.status === 409);

  const allRejected =
    results.every((r) => r.body?.ok !== true);

  const allSoldOut =
    results.every(
      (r) =>
        String(
          r.body?.error ?? r.body?.message ?? ""
        ).toLowerCase().includes("sold out")
    );

  console.log("All HTTP 409:", all409);
  console.log("All rejected:", allRejected);
  console.log("All reported sold out:", allSoldOut);

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const purchases =
    await prisma.purchase.count({
      where: {
        gameId: game.id,
        playerKey: playerId,
      },
    });

  const sessions =
    await prisma.gameSession.count({
      where: {
        gameId: game.id,
        sessionKey: playerId,
      },
    });

  console.log("\n=== DATABASE AFTER RACE ===");
  console.log("Purchase rows:", purchases);
  console.log("GameSession rows:", sessions);
  console.log(
    "No purchase created:",
    purchases === 0
  );
  console.log(
    "No session created:",
    sessions === 0
  );

  const pass =
    all409 &&
    allRejected &&
    allSoldOut &&
    purchases === 0 &&
    sessions === 0;

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
