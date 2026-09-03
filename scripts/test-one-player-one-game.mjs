import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { SignJWT } from "jose";
import pg from "pg";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { Pool } = pg;

loadEnvConfig(process.cwd(), true);

const BASE_URL = (
  process.env.BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");

const JOIN_CODE = (process.env.JOIN_CODE || "")
  .trim()
  .toUpperCase();

const secret =
  process.env.BTTB_PLAYER_SESSION_SECRET?.trim();

const databaseUrl =
  process.env.DATABASE_URL?.trim();

if (!JOIN_CODE) {
  throw new Error(
    "JOIN_CODE is required. Example: JOIN_CODE=NU3C9E npm run test:player-enrollment"
  );
}

if (!secret || secret.length < 32) {
  throw new Error(
    "BTTB_PLAYER_SESSION_SECRET is missing or too short."
  );
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
});

const testPlayerIds = [];

function pass(message) {
  console.log(`PASS  ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function sameIds(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }

  return (
    JSON.stringify([...left].sort()) ===
    JSON.stringify([...right].sort())
  );
}

async function createToken(playerId) {
  return new SignJWT({})
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
}

async function joinGame({
  playerId,
  token,
  playerName,
}) {
  const response = await fetch(
    `${BASE_URL}/api/game/join`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `bttb-player-session=${token}`,
      },
      body: JSON.stringify({
        joinCode: JOIN_CODE,
        playerName,
        cardQuantity: 1,
      }),
    }
  );

  const text = await response.text();

  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Join returned non-JSON response (${response.status}): ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Join failed (${response.status}): ${JSON.stringify(body)}`
    );
  }

  assert(body.ok === true, "join response did not return ok=true");

  assert(
    body.player?.playerId === playerId,
    "server returned a different trusted player ID"
  );

  return body;
}

async function verifyDatabase({
  playerId,
  gameId,
  purchaseId,
  expectedCards,
}) {
  const purchaseResult = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM "Purchase"
      WHERE "gameId" = $1
        AND "playerKey" = $2
    `,
    [gameId, playerId]
  );

  assert(
    purchaseResult.rows[0].count === 1,
    `expected exactly 1 Purchase row, found ${purchaseResult.rows[0].count}`
  );

  const cardResult = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM "BingoCard"
      WHERE "purchaseId" = $1
    `,
    [purchaseId]
  );

  assert(
    cardResult.rows[0].count === expectedCards,
    `expected ${expectedCards} assigned card(s), found ${cardResult.rows[0].count}`
  );

  const sessionResult = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM "GameSession"
      WHERE "gameId" = $1
        AND "sessionKey" = $2
    `,
    [gameId, playerId]
  );

  assert(
    sessionResult.rows[0].count === 1,
    `expected exactly 1 GameSession, found ${sessionResult.rows[0].count}`
  );
}

async function cleanup() {
  if (testPlayerIds.length === 0) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        UPDATE "BingoCard"
        SET
          "playerKey" = NULL,
          "playerName" = NULL,
          "purchaseId" = NULL,
          "status" = 'AVAILABLE',
          "updatedAt" = NOW()
        WHERE "playerKey" = ANY($1::text[])
      `,
      [testPlayerIds]
    );

    await client.query(
      `
        DELETE FROM "GameSession"
        WHERE "sessionKey" = ANY($1::text[])
      `,
      [testPlayerIds]
    );

    await client.query(
      `
        DELETE FROM "Purchase"
        WHERE "playerKey" = ANY($1::text[])
      `,
      [testPlayerIds]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  console.log();
  console.log("BINGO TO THE BEATS");
  console.log("ONE PLAYER / ONE GAME REGRESSION TEST");
  console.log("--------------------------------------");
  console.log(`Game code: ${JOIN_CODE}`);
  console.log();

  await pool.query("SELECT 1");
  pass("database connection");

  const joinPage = await fetch(`${BASE_URL}/join`);

  assert(
    joinPage.ok,
    `local app is not reachable at ${BASE_URL}`
  );

  pass("local app reachable");

  /*
   * TEST 1
   * Normal join followed by same-player rejoin.
   */
  const sequentialPlayer =
    `auto-sequential-${randomUUID()}`;

  testPlayerIds.push(sequentialPlayer);

  const sequentialToken =
    await createToken(sequentialPlayer);

  const first = await joinGame({
    playerId: sequentialPlayer,
    token: sequentialToken,
    playerName: "Automated Sequential Test",
  });

  assert(
    first.rejoined === false,
    "first join should be a new enrollment"
  );

  assert(
    first.player.cardQuantity === 1,
    "first join should contain exactly 1 card"
  );

  assert(
    first.player.amountCents === 500,
    "one-card package should be $5.00"
  );

  pass("new player join");

  const second = await joinGame({
    playerId: sequentialPlayer,
    token: sequentialToken,
    playerName: "Automated Sequential Test",
  });

  assert(
    second.rejoined === true,
    "second join should be recognized as a rejoin"
  );

  assert(
    second.player.purchaseId ===
      first.player.purchaseId,
    "rejoin created or returned a different purchase"
  );

  assert(
    sameIds(
      second.player.cardIds,
      first.player.cardIds
    ),
    "rejoin returned different cards"
  );

  pass("same player reuses existing purchase/cards");

  await verifyDatabase({
    playerId: sequentialPlayer,
    gameId: first.player.gameId,
    purchaseId: first.player.purchaseId,
    expectedCards: 1,
  });

  pass("database has one purchase, one card, one session");

  /*
   * TEST 2
   * Two simultaneous requests for a brand-new player.
   */
  const racePlayer =
    `auto-race-${randomUUID()}`;

  testPlayerIds.push(racePlayer);

  const raceToken =
    await createToken(racePlayer);

  const [raceOne, raceTwo] =
    await Promise.all([
      joinGame({
        playerId: racePlayer,
        token: raceToken,
        playerName: "Automated Race Test",
      }),
      joinGame({
        playerId: racePlayer,
        token: raceToken,
        playerName: "Automated Race Test",
      }),
    ]);

  assert(
    raceOne.player.purchaseId ===
      raceTwo.player.purchaseId,
    "simultaneous joins returned different purchases"
  );

  assert(
    sameIds(
      raceOne.player.cardIds,
      raceTwo.player.cardIds
    ),
    "simultaneous joins returned different cards"
  );

  const newEnrollmentCount =
    [raceOne, raceTwo].filter(
      (result) => result.rejoined === false
    ).length;

  assert(
    newEnrollmentCount === 1,
    `expected exactly one new enrollment, found ${newEnrollmentCount}`
  );

  pass("simultaneous duplicate join protection");

  await verifyDatabase({
    playerId: racePlayer,
    gameId: raceOne.player.gameId,
    purchaseId: raceOne.player.purchaseId,
    expectedCards: 1,
  });

  pass("race created only one purchase/card/session");

  console.log();
  console.log("======================================");
  console.log("ALL PLAYER ENROLLMENT TESTS PASSED");
  console.log("======================================");
}

let testFailed = false;

try {
  await main();
} catch (error) {
  testFailed = true;
  console.error();
  console.error(
    error instanceof Error
      ? error.message
      : error
  );
} finally {
  try {
    await cleanup();
    pass("automated test data cleaned up");
  } catch (cleanupError) {
    testFailed = true;
    console.error(
      "FAIL: automated test cleanup failed:",
      cleanupError
    );
  }

  await pool.end();
}

if (testFailed) {
  process.exitCode = 1;
}
