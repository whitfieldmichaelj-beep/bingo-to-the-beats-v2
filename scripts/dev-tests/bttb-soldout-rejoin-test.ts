import { createRequire } from "node:module";
import { SignJWT } from "jose";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

async function main() {
  loadEnvConfig(process.cwd(), true);

  const playerId =
    "last10-1-1786494469082-5609c07f";

  const expectedPurchase =
    "7ff5451b-9ce4-4822-a9f3-1ecd15bd1b75";

  const expectedCard =
    "a894ef02-3a95-43b4-be30-ecb4e611c794";

  const secret =
    (process.env.BTTB_PLAYER_SESSION_SECRET ?? "").trim();

  if (secret.length < 32) {
    throw new Error("Session secret missing");
  }

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
        playerName: "Sold Out Rejoin Test",
        cardQuantity: 10,
      }),
    }
  );

  const body = await response.json();

  console.log("\n=== SOLD-OUT EXISTING PLAYER REJOIN ===");
  console.log("HTTP:", response.status);
  console.log("ok:", body.ok);
  console.log("rejoined:", body.rejoined);
  console.log("playerId:", body.player?.playerId);
  console.log("purchaseId:", body.player?.purchaseId);
  console.log("quantity:", body.player?.cardQuantity);
  console.log("cardIds:", body.player?.cardIds);
  console.log(
    "remaining cards:",
    body.availability?.remainingCards
  );

  const pass =
    response.status === 200 &&
    body.ok === true &&
    body.rejoined === true &&
    body.player?.playerId === playerId &&
    body.player?.purchaseId === expectedPurchase &&
    body.player?.cardQuantity === 1 &&
    body.player?.cardIds?.length === 1 &&
    body.player?.cardIds?.[0] === expectedCard &&
    body.availability?.remainingCards === 0;

  console.log(
    "\nRESULT:",
    pass ? "PASS ✅" : "FAIL ❌"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
