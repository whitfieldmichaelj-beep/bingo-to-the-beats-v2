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

  const expectedCard =
    "23ecf3e2-bd67-434b-add7-8e6ad8966afe";

  const secret =
    (process.env.BTTB_PLAYER_SESSION_SECRET ?? "").trim();

  if (secret.length < 32) {
    throw new Error("Session secret missing");
  }

  const validToken = await new SignJWT({})
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(playerId)
    .setIssuer("bingo-to-the-beats")
    .setAudience("bttb-player")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(secret));

  const parts = validToken.split(".");

  if (parts.length !== 3) {
    throw new Error("Unexpected JWT format");
  }

  const signature = parts[2];

  const replacement =
    signature[0] === "A" ? "B" : "A";

  const tamperedToken = [
    parts[0],
    parts[1],
    replacement + signature.slice(1),
  ].join(".");

  const base =
    process.env.BASE_URL ||
    "http://127.0.0.1:3000";

  async function join(
    token: string,
    name: string
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
          playerName: name,
          cardQuantity: 3,
        }),
      }
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  }

  const valid = await join(
    validToken,
    "Valid Security Test"
  );

  const tampered = await join(
    tamperedToken,
    "Tampered Security Test"
  );

  console.log(
    "\n=== VALID SIGNED SESSION ==="
  );
  console.log("HTTP:", valid.status);
  console.log("ok:", valid.body?.ok);
  console.log(
    "rejoined:",
    valid.body?.rejoined
  );
  console.log(
    "playerId:",
    valid.body?.player?.playerId
  );
  console.log(
    "purchaseId:",
    valid.body?.player?.purchaseId
  );
  console.log(
    "quantity:",
    valid.body?.player?.cardQuantity
  );
  console.log(
    "cardIds:",
    valid.body?.player?.cardIds
  );

  console.log(
    "\n=== TAMPERED SESSION ==="
  );
  console.log("HTTP:", tampered.status);
  console.log("ok:", tampered.body?.ok);
  console.log(
    "message:",
    tampered.body?.message ??
      tampered.body?.error
  );
  console.log(
    "player returned:",
    tampered.body?.player ?? null
  );

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

  const tamperedPurchases =
    await prisma.purchase.count({
      where: {
        gameId: game.id,
        playerName:
          "Tampered Security Test",
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

  console.log(
    "\n=== DATABASE SECURITY CHECK ==="
  );
  console.log(
    "Target purchase rows:",
    targetPurchases.length
  );
  console.log(
    "Target cards:",
    targetPurchases[0]?.cards.length ?? 0
  );
  console.log(
    "Tampered-token purchases:",
    tamperedPurchases
  );
  console.log(
    "Available cards:",
    available
  );

  const validPass =
    valid.status === 200 &&
    valid.body?.ok === true &&
    valid.body?.rejoined === true &&
    valid.body?.player?.playerId ===
      playerId &&
    valid.body?.player?.purchaseId ===
      expectedPurchase &&
    valid.body?.player?.cardQuantity === 1 &&
    valid.body?.player?.cardIds?.length === 1 &&
    valid.body?.player?.cardIds?.[0] ===
      expectedCard;

  const tamperedPass =
    tampered.status === 409 &&
    tampered.body?.ok !== true &&
    !tampered.body?.player;

  const databasePass =
    targetPurchases.length === 1 &&
    targetPurchases[0]?.id ===
      expectedPurchase &&
    targetPurchases[0]?.cards.length === 1 &&
    tamperedPurchases === 0 &&
    available === 2;

  console.log(
    "\nValid token protected:",
    validPass
  );
  console.log(
    "Tampered token rejected:",
    tamperedPass
  );
  console.log(
    "Database unchanged:",
    databasePass
  );

  console.log(
    "\nRESULT:",
    validPass &&
    tamperedPass &&
    databasePass
      ? "PASS ✅"
      : "FAIL ❌"
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
