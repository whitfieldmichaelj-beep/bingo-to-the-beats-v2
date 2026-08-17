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

  const players = [];

  for (let i = 1; i <= 10; i += 1) {
    const playerId =
      `last10-${i}-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(playerId)
      .setIssuer("bingo-to-the-beats")
      .setAudience("bttb-player")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(secret));

    players.push({
      playerId,
      token,
    });
  }

  const base =
    process.env.BASE_URL || "http://127.0.0.1:3000";

  async function join(player: {
    playerId: string;
    token: string;
  }) {
    const response = await fetch(
      base + "/api/game/join",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `bttb-player-session=${player.token}`,
        },
        body: JSON.stringify({
          joinCode: "6XWEGB",
          playerName: player.playerId,
          cardQuantity: 1,
        }),
      }
    );

    return {
      playerId: player.playerId,
      status: response.status,
      body: await response.json(),
    };
  }

  const results = await Promise.all(
    players.map((player) => join(player))
  );

  console.log("\n=== 10-PLAYER FINAL-CARD RACE ===");

  results.forEach((r, index) => {
    console.log(
      `Player ${index + 1}:`,
      "HTTP", r.status,
      "|",
      r.body?.message ??
        r.body?.error ??
        "JOINED"
    );
  });

  const winners = results.filter(
    (r) =>
      r.status === 200 &&
      r.body?.ok === true &&
      r.body?.player?.cardIds?.length === 1
  );

  const losers = results.filter(
    (r) =>
      r.status === 409 &&
      r.body?.ok !== true
  );

  const serverErrors = results.filter(
    (r) => r.status >= 500
  );

  const allLosersSoldOut =
    losers.every((r) =>
      String(
        r.body?.message ??
          r.body?.error ??
          ""
      )
        .toLowerCase()
        .includes("sold out")
    );

  const game = await prisma.game.findFirst({
    where: {
      joinCode: "6XWEGB",
    },
    select: {
      id: true,
    },
  });

  if (!game) {
    throw new Error("Game not found");
  }

  const playerIds =
    players.map((p) => p.playerId);

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
          in: playerIds,
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
    await prisma.gameSession.findMany({
      where: {
        gameId: game.id,
        sessionKey: {
          in: playerIds,
        },
      },
    });

  console.log("\n=== DATABASE AFTER 10-PLAYER RACE ===");
  console.log("Winners:", winners.length);
  console.log("409 losers:", losers.length);
  console.log("500 errors:", serverErrors.length);
  console.log(
    "All losers reported sold out:",
    allLosersSoldOut
  );
  console.log("Available cards:", available);
  console.log("Purchase rows:", purchases.length);
  console.log("GameSession rows:", sessions.length);

  if (winners[0]) {
    console.log(
      "Winning player:",
      winners[0].playerId
    );

    console.log(
      "Winning purchase:",
      winners[0].body?.player?.purchaseId
    );

    console.log(
      "Winning card:",
      winners[0].body?.player?.cardIds?.[0]
    );
  }

  const pass =
    winners.length === 1 &&
    losers.length === 9 &&
    serverErrors.length === 0 &&
    allLosersSoldOut &&
    available === 0 &&
    purchases.length === 1 &&
    purchases[0]?.cards.length === 1 &&
    sessions.length === 1;

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
