import { createRequire } from "node:module";
import { SignJWT } from "jose";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const { prisma } = await import("../../lib/prisma");

  const playerId =
    "mixed-qty-1786496145442-a8f113da";

  const expectedPurchase =
    "9e053a77-bfb9-46dd-a591-4d4320010b7b";

  const secret =
    (process.env.BTTB_PLAYER_SESSION_SECRET ?? "").trim();

  if (secret.length < 32) {
    throw new Error("Session secret missing");
  }

  const key = new TextEncoder().encode(secret);

  const expiredToken = await new SignJWT({})
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(playerId)
    .setIssuer("bingo-to-the-beats")
    .setAudience("bttb-player")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(key);

  const wrongIssuerToken = await new SignJWT({})
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(playerId)
    .setIssuer("fake-issuer")
    .setAudience("bttb-player")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);

  const wrongAudienceToken = await new SignJWT({})
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(playerId)
    .setIssuer("bingo-to-the-beats")
    .setAudience("fake-audience")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);

  const base =
    process.env.BASE_URL ||
    "http://127.0.0.1:3000";

  async function testToken(
    label: string,
    token: string
  ) {
    const response = await fetch(
      base + "/api/game/join",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie:
            `bttb-player-session=${token}`,
        },
        body: JSON.stringify({
          joinCode: "6XWEGB",
          playerName: label,
          cardQuantity: 3,
        }),
      }
    );

    return {
      label,
      status: response.status,
      body: await response.json(),
    };
  }

  const results = [];

  results.push(
    await testToken(
      "Expired Token Test",
      expiredToken
    )
  );

  results.push(
    await testToken(
      "Wrong Issuer Test",
      wrongIssuerToken
    )
  );

  results.push(
    await testToken(
      "Wrong Audience Test",
      wrongAudienceToken
    )
  );

  console.log(
    "\n=== INVALID SESSION SECURITY TEST ==="
  );

  for (const r of results) {
    console.log(`\n${r.label}`);
    console.log("HTTP:", r.status);
    console.log("ok:", r.body?.ok);
    console.log(
      "message:",
      r.body?.message ??
        r.body?.error ??
        null
    );
    console.log(
      "player returned:",
      r.body?.player ?? null
    );
  }

  const game =
    await prisma.game.findFirst({
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

  const targetPurchases =
    await prisma.purchase.findMany({
      where: {
        gameId: game.id,
        playerKey: playerId,
      },
      include: {
        cards: {
          select: {
            id: true,
          },
        },
      },
    });

  const badNamePurchases =
    await prisma.purchase.count({
      where: {
        gameId: game.id,
        playerName: {
          in: [
            "Expired Token Test",
            "Wrong Issuer Test",
            "Wrong Audience Test",
          ],
        },
      },
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

  const allRejected =
    results.every(
      (r) =>
        r.status === 409 &&
        r.body?.ok !== true &&
        !r.body?.player
    );

  const databasePass =
    targetPurchases.length === 1 &&
    targetPurchases[0]?.id ===
      expectedPurchase &&
    targetPurchases[0]?.cards.length === 1 &&
    badNamePurchases === 0 &&
    available === 2;

  console.log(
    "\n=== DATABASE CHECK ==="
  );
  console.log(
    "Original purchase rows:",
    targetPurchases.length
  );
  console.log(
    "Invalid-token purchases:",
    badNamePurchases
  );
  console.log(
    "Available cards:",
    available
  );

  console.log(
    "\nAll invalid tokens rejected:",
    allRejected
  );
  console.log(
    "Database unchanged:",
    databasePass
  );

  console.log(
    "\nRESULT:",
    allRejected && databasePass
      ? "PASS ✅"
      : "FAIL ❌"
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
