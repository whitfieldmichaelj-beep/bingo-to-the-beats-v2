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

  const makePlayer = async (label: string) => {
    const playerId =
      `last-card-${label}-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(playerId)
      .setIssuer("bingo-to-the-beats")
      .setAudience("bttb-player")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(secret));

    return { playerId, token };
  };

  const playerA = await makePlayer("A");
  const playerB = await makePlayer("B");

  const base =
    process.env.BASE_URL || "http://127.0.0.1:3000";

  const join = async (
    playerId: string,
    token: string
  ) => {
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
          playerName: playerId,
          cardQuantity: 1,
        }),
      }
    );

    return {
      playerId,
      status: response.status,
      body: await response.json(),
    };
  };

  const results = await Promise.all([
    join(playerA.playerId, playerA.token),
    join(playerB.playerId, playerB.token),
  ]);

  console.log("\n=== LAST-CARD RACE ===");

  results.forEach((r, index) => {
    console.log(`\nPlayer ${index + 1}:`, r.playerId);
    console.log("HTTP:", r.status);
    console.log("ok:", r.body?.ok);
    console.log("rejoined:", r.body?.rejoined);
    console.log(
      "purchaseId:",
      r.body?.player?.purchaseId ?? null
    );
    console.log(
      "cardIds:",
      r.body?.player?.cardIds ?? null
    );
    console.log(
      "message:",
      r.body?.message ?? r.body?.error ?? null
    );
  });

  const winners =
    results.filter(
      (r) =>
        r.status === 200 &&
        r.body?.ok === true
    );

  const losers =
    results.filter(
      (r) =>
        r.status === 409 &&
        r.body?.ok !== true
    );

  const soldOutLosers =
    losers.every((r) =>
      String(
        r.body?.message ?? r.body?.error ?? ""
      )
        .toLowerCase()
        .includes("sold out")
    );

  const game = await prisma.game.findFirst({
    where: { joinCode: "6XWEGB" },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const available =
    await prisma.bingoCard.count({
      where: {
        gameId: game.id,
        status: "AVAILABLE",
        playerKey: null,
        purchaseId: null,
      },
    });

  const purchases =
    await prisma.purchase.findMany({
      where: {
        gameId: game.id,
        playerKey: {
          in: [
            playerA.playerId,
            playerB.playerId,
          ],
        },
      },
      include: {
        cards: {
          select: {
            id: true,
          },
        },
      },
    });

  const sessions =
    await prisma.gameSession.count({
      where: {
        gameId: game.id,
        sessionKey: {
          in: [
            playerA.playerId,
            playerB.playerId,
          ],
        },
      },
    });

  console.log("\n=== DATABASE AFTER LAST-CARD RACE ===");
  console.log("Winners:", winners.length);
  console.log("409 losers:", losers.length);
  console.log(
    "Loser reported sold out:",
    soldOutLosers
  );
  console.log("Available cards:", available);
  console.log(
    "Purchase rows for both players:",
    purchases.length
  );
  console.log(
    "GameSession rows for both players:",
    sessions
  );

  for (const p of purchases) {
    console.log(
      "Winning purchase:",
      p.id,
      "| player:",
      p.playerKey,
      "| cards:",
      p.cards.length
    );
  }

  const pass =
    winners.length === 1 &&
    losers.length === 1 &&
    soldOutLosers &&
    available === 0 &&
    purchases.length === 1 &&
    purchases[0]?.cards.length === 1 &&
    sessions === 1;

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
