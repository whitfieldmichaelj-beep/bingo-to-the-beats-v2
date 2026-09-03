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

const JOIN_CODE = (
  process.env.JOIN_CODE || ""
)
  .trim()
  .toUpperCase();

const secret =
  process.env.BTTB_PLAYER_SESSION_SECRET?.trim();

const databaseUrl =
  process.env.DATABASE_URL?.trim();

if (!JOIN_CODE) {
  throw new Error(
    "JOIN_CODE is required. Example: JOIN_CODE=NU3C9E npm run test:purchase-disputes"
  );
}

if (!secret || secret.length < 32) {
  throw new Error(
    "BTTB_PLAYER_SESSION_SECRET is missing or too short."
  );
}

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing."
  );
}

/*
 * Safety guard:
 * this regression test deliberately creates and removes
 * temporary purchase/dispute data.
 */
const parsedDatabaseUrl =
  new URL(databaseUrl);

const localDatabase =
  parsedDatabaseUrl.hostname === "localhost" ||
  parsedDatabaseUrl.hostname === "127.0.0.1" ||
  parsedDatabaseUrl.hostname === "::1";

if (
  !localDatabase &&
  process.env.ALLOW_NONLOCAL_TEST_DB !== "1"
) {
  throw new Error(
    "Refusing to run dispute regression test against a non-local database."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
});

let testPlayerId = null;
let testPurchaseId = null;
let testDisputeId = null;

function pass(message) {
  console.log(`PASS  ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
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
    .sign(
      new TextEncoder().encode(secret)
    );
}

async function requestJoin({
  token,
  playerName,
}) {
  const response = await fetch(
    `${BASE_URL}/api/game/join`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Cookie:
          `bttb-player-session=${token}`,
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

  return {
    status: response.status,
    body,
  };
}

async function requestHeartbeat({
  token,
  gameId,
  playerId,
}) {
  const response = await fetch(
    `${BASE_URL}/api/game/player/heartbeat`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Cookie:
          `bttb-player-session=${token}`,
      },
      body: JSON.stringify({
        gameId,
        playerId,
        connected: true,
      }),
    }
  );

  const text = await response.text();

  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Heartbeat returned non-JSON response (${response.status}): ${text}`
    );
  }

  return {
    status: response.status,
    body,
  };
}

async function getSession({
  gameId,
  playerId,
}) {
  const result = await pool.query(
    `
      SELECT "connected"
      FROM "GameSession"
      WHERE "gameId" = $1
        AND "sessionKey" = $2
    `,
    [gameId, playerId]
  );

  return result.rows[0] || null;
}

async function updateDispute({
  status,
  fundsWithdrawn,
}) {
  await pool.query(
    `
      UPDATE "PurchaseDispute"
      SET
        "status" = $1,
        "fundsWithdrawn" = $2,
        "updatedAt" = NOW()
      WHERE "stripeDisputeId" = $3
    `,
    [
      status,
      fundsWithdrawn,
      testDisputeId,
    ]
  );
}

async function cleanup() {
  if (!testPlayerId) {
    return;
  }

  const client =
    await pool.connect();

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
        WHERE "playerKey" = $1
      `,
      [testPlayerId]
    );

    await client.query(
      `
        DELETE FROM "GameSession"
        WHERE "sessionKey" = $1
      `,
      [testPlayerId]
    );

    await client.query(
      `
        DELETE FROM "Purchase"
        WHERE "playerKey" = $1
      `,
      [testPlayerId]
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
  console.log(
    "PURCHASE DISPUTE REGRESSION TEST"
  );
  console.log(
    "--------------------------------"
  );
  console.log(
    `Game code: ${JOIN_CODE}`
  );
  console.log();

  await pool.query("SELECT 1");
  pass("database connection");

  const tableCheck =
    await pool.query(`
      SELECT
        to_regclass('"PurchaseDispute"')
          AS table_name
    `);

  assert(
    tableCheck.rows[0]?.table_name,
    "PurchaseDispute table does not exist"
  );

  pass("PurchaseDispute table exists");

  const appCheck =
    await fetch(`${BASE_URL}/join`);

  assert(
    appCheck.ok,
    `local app is not reachable at ${BASE_URL}`
  );

  pass("local app reachable");

  /*
   * Create a fresh trusted test player.
   */
  testPlayerId =
    `auto-dispute-${randomUUID()}`;

  const playerName =
    "Automated Dispute Test";

  const token =
    await createToken(testPlayerId);

  const firstJoin =
    await requestJoin({
      token,
      playerName,
    });

  assert(
    firstJoin.status === 200 &&
      firstJoin.body.ok === true,
    `initial join failed: ${JSON.stringify(firstJoin.body)}`
  );

  assert(
    firstJoin.body.rejoined === false,
    "initial join should create a new enrollment"
  );

  const gameId =
    firstJoin.body.player.gameId;

  testPurchaseId =
    firstJoin.body.player.purchaseId;

  const originalCardIds =
    firstJoin.body.player.cardIds;

  pass("normal player join");

  /*
   * Create an active dispute.
   */
  testDisputeId =
    `dp_auto_${randomUUID()
      .replaceAll("-", "")}`;

  await pool.query(
    `
      INSERT INTO "PurchaseDispute" (
        "stripeDisputeId",
        "purchaseId",
        "amount",
        "currency",
        "status",
        "reason",
        "fundsWithdrawn",
        "lastStatusEventCreated",
        "lastFundsEventCreated",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        5.00,
        'USD',
        'needs_response',
        'general',
        false,
        1,
        0,
        NOW()
      )
    `,
    [
      testDisputeId,
      testPurchaseId,
    ]
  );

  pass("active dispute created");

  /*
   * Active dispute must block rejoin.
   */
  const blockedJoin =
    await requestJoin({
      token,
      playerName,
    });

  assert(
    blockedJoin.status === 409,
    `expected disputed rejoin HTTP 409, got ${blockedJoin.status}`
  );

  assert(
    blockedJoin.body.code ===
      "PURCHASE_DISPUTED",
    `expected PURCHASE_DISPUTED, got ${JSON.stringify(blockedJoin.body)}`
  );

  pass("active dispute blocks rejoin");

  /*
   * Active dispute must also block heartbeat
   * and mark the session disconnected.
   */
  const blockedHeartbeat =
    await requestHeartbeat({
      token,
      gameId,
      playerId: testPlayerId,
    });

  assert(
    blockedHeartbeat.status === 403,
    `expected disputed heartbeat HTTP 403, got ${blockedHeartbeat.status}`
  );

  assert(
    blockedHeartbeat.body.code ===
      "PURCHASE_DISPUTED",
    `expected heartbeat PURCHASE_DISPUTED, got ${JSON.stringify(blockedHeartbeat.body)}`
  );

  assert(
    blockedHeartbeat.body.connected ===
      false,
    "disputed heartbeat should report connected=false"
  );

  const disconnectedSession =
    await getSession({
      gameId,
      playerId: testPlayerId,
    });

  assert(
    disconnectedSession?.connected ===
      false,
    "database session should be disconnected"
  );

  pass(
    "active dispute disconnects player heartbeat"
  );

  /*
   * Even a WON dispute must remain blocked
   * while Stripe still has funds withdrawn.
   */
  await updateDispute({
    status: "won",
    fundsWithdrawn: true,
  });

  const wonFundsHeldJoin =
    await requestJoin({
      token,
      playerName,
    });

  assert(
    wonFundsHeldJoin.status === 409 &&
      wonFundsHeldJoin.body.code ===
        "PURCHASE_DISPUTED",
    "won dispute with withdrawn funds should remain blocked"
  );

  pass(
    "won dispute remains blocked while funds are withdrawn"
  );

  /*
   * Once the dispute is WON and funds are
   * reinstated, access should return.
   */
  await updateDispute({
    status: "won",
    fundsWithdrawn: false,
  });

  const restoredJoin =
    await requestJoin({
      token,
      playerName,
    });

  assert(
    restoredJoin.status === 200 &&
      restoredJoin.body.ok === true,
    `restored rejoin failed: ${JSON.stringify(restoredJoin.body)}`
  );

  assert(
    restoredJoin.body.rejoined === true,
    "restored access should reuse the existing enrollment"
  );

  assert(
    restoredJoin.body.player.purchaseId ===
      testPurchaseId,
    "restored access returned a different purchase"
  );

  assert(
    JSON.stringify(
      [...restoredJoin.body.player.cardIds].sort()
    ) ===
      JSON.stringify(
        [...originalCardIds].sort()
      ),
    "restored access returned different cards"
  );

  pass(
    "funds reinstated restores original purchase/cards"
  );

  const restoredHeartbeat =
    await requestHeartbeat({
      token,
      gameId,
      playerId: testPlayerId,
    });

  assert(
    restoredHeartbeat.status === 200 &&
      restoredHeartbeat.body.ok === true,
    `restored heartbeat failed: ${JSON.stringify(restoredHeartbeat.body)}`
  );

  assert(
    restoredHeartbeat.body.connected ===
      true,
    "restored heartbeat should reconnect player"
  );

  const restoredSession =
    await getSession({
      gameId,
      playerId: testPlayerId,
    });

  assert(
    restoredSession?.connected === true,
    "database session should be connected after restoration"
  );

  pass(
    "heartbeat reconnects after dispute resolution"
  );

  const disputeCount =
    await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "PurchaseDispute"
        WHERE "purchaseId" = $1
      `,
      [testPurchaseId]
    );

  assert(
    disputeCount.rows[0].count === 1,
    `expected one dispute record, found ${disputeCount.rows[0].count}`
  );

  pass("dispute database record verified");

  console.log();
  console.log(
    "======================================"
  );
  console.log(
    "ALL PURCHASE DISPUTE TESTS PASSED"
  );
  console.log(
    "======================================"
  );
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
    pass(
      "automated dispute test data cleaned up"
    );
  } catch (cleanupError) {
    testFailed = true;

    console.error(
      "FAIL: automated dispute cleanup failed:",
      cleanupError
    );
  }

  await pool.end();
}

if (testFailed) {
  process.exitCode = 1;
}
