import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { SignJWT } from "jose";
import Stripe from "stripe";
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

const playerSecret =
  process.env.BTTB_PLAYER_SESSION_SECRET?.trim();

const databaseUrl =
  process.env.DATABASE_URL?.trim();

const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
  "whsec_bttb_local_refund_test";

if (!JOIN_CODE) {
  throw new Error(
    "JOIN_CODE is required. Example: JOIN_CODE=NU3C9E npm run test:purchase-refunds"
  );
}

if (!playerSecret || playerSecret.length < 32) {
  throw new Error(
    "BTTB_PLAYER_SESSION_SECRET is missing or too short."
  );
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing.");
}

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
    "Refusing to run refund regression test against a non-local database."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
});

let testPlayerId = null;
let testPurchaseId = null;

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
      new TextEncoder().encode(
        playerSecret
      )
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

  const body =
    await response.json();

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

  const body =
    await response.json();

  return {
    status: response.status,
    body,
  };
}

async function sendRefundWebhook({
  paymentIntentId,
  amountCents,
  refundedAmountCents,
  fullyRefunded,
}) {
  const now =
    Math.floor(Date.now() / 1000);

  const payload = JSON.stringify({
    id: `evt_auto_${randomUUID()
      .replaceAll("-", "")}`,
    object: "event",
    api_version: "2025-12-15.clover",
    created: now,
    livemode: false,
    pending_webhooks: 1,
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_auto_${randomUUID()
          .replaceAll("-", "")}`,
        object: "charge",
        amount: amountCents,
        amount_refunded:
          refundedAmountCents,
        currency: "usd",
        refunded:
          fullyRefunded,
        payment_intent:
          paymentIntentId,
      },
    },
  });

  const signature =
    Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

  const response = await fetch(
    `${BASE_URL}/api/stripe/webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        "stripe-signature":
          signature,
      },
      body: payload,
    }
  );

  const body =
    await response.json();

  return {
    status: response.status,
    body,
  };
}

async function getPurchase() {
  const result =
    await pool.query(
      `
        SELECT
          "status",
          "refundedAmount"
        FROM "Purchase"
        WHERE "id" = $1
      `,
      [testPurchaseId]
    );

  return result.rows[0] || null;
}

async function getCard(cardId) {
  const result =
    await pool.query(
      `
        SELECT
          "status",
          "purchaseId",
          "playerKey"
        FROM "BingoCard"
        WHERE "id" = $1
      `,
      [cardId]
    );

  return result.rows[0] || null;
}

async function getSession({
  gameId,
  playerId,
}) {
  const result =
    await pool.query(
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
           OR "purchaseId" = $2
      `,
      [
        testPlayerId,
        testPurchaseId,
      ]
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
        WHERE "id" = $1
      `,
      [testPurchaseId]
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
    "PURCHASE REFUND REGRESSION TEST"
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

  const appCheck =
    await fetch(`${BASE_URL}/join`);

  assert(
    appCheck.ok,
    `local app is not reachable at ${BASE_URL}`
  );

  pass("local app reachable");

  testPlayerId =
    `auto-refund-${randomUUID()}`;

  const playerName =
    "Automated Refund Test";

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

  const gameId =
    firstJoin.body.player.gameId;

  testPurchaseId =
    firstJoin.body.player.purchaseId;

  const cardId =
    firstJoin.body.player.cardIds[0];

  pass("normal player join");

  const paymentIntentId =
    `pi_auto_${randomUUID()
      .replaceAll("-", "")}`;

  await pool.query(
    `
      UPDATE "Purchase"
      SET
        "status" = 'PAID',
        "stripePaymentId" = $1,
        "updatedAt" = NOW()
      WHERE "id" = $2
    `,
    [
      paymentIntentId,
      testPurchaseId,
    ]
  );

  pass(
    "temporary purchase marked paid"
  );

  /*
   * PARTIAL REFUND
   */
  const partialWebhook =
    await sendRefundWebhook({
      paymentIntentId,
      amountCents: 500,
      refundedAmountCents: 200,
      fullyRefunded: false,
    });

  assert(
    partialWebhook.status === 200 &&
      partialWebhook.body.received ===
        true,
    `partial refund webhook failed: ${JSON.stringify(partialWebhook.body)}`
  );

  const partialPurchase =
    await getPurchase();

  assert(
    partialPurchase?.status === "PAID",
    `partial refund changed purchase status to ${partialPurchase?.status}`
  );

  assert(
    Number(
      partialPurchase.refundedAmount
    ) === 2,
    `expected refundedAmount 2.00, got ${partialPurchase.refundedAmount}`
  );

  const partialCard =
    await getCard(cardId);

  assert(
    partialCard &&
      partialCard.status !== "VOID",
    "partial refund should not void card"
  );

  pass(
    "partial refund keeps purchase and card active"
  );

  /*
   * FULL REFUND
   */
  const fullWebhook =
    await sendRefundWebhook({
      paymentIntentId,
      amountCents: 500,
      refundedAmountCents: 500,
      fullyRefunded: true,
    });

  assert(
    fullWebhook.status === 200 &&
      fullWebhook.body.received ===
        true,
    `full refund webhook failed: ${JSON.stringify(fullWebhook.body)}`
  );

  const fullPurchase =
    await getPurchase();

  assert(
    fullPurchase?.status ===
      "REFUNDED",
    `expected REFUNDED, got ${fullPurchase?.status}`
  );

  assert(
    Number(
      fullPurchase.refundedAmount
    ) === 5,
    `expected refundedAmount 5.00, got ${fullPurchase.refundedAmount}`
  );

  const fullCard =
    await getCard(cardId);

  assert(
    fullCard?.status === "VOID",
    `expected card VOID, got ${fullCard?.status}`
  );

  const disconnectedSession =
    await getSession({
      gameId,
      playerId: testPlayerId,
    });

  assert(
    disconnectedSession?.connected ===
      false,
    "full refund should disconnect player"
  );

  pass(
    "full refund voids card and disconnects player"
  );

  /*
   * REFUNDED REJOIN
   */
  const refundedJoin =
    await requestJoin({
      token,
      playerName,
    });

  assert(
    refundedJoin.status === 409,
    `expected refunded rejoin HTTP 409, got ${refundedJoin.status}`
  );

  assert(
    refundedJoin.body.code ===
      "PURCHASE_REFUNDED",
    `expected PURCHASE_REFUNDED, got ${JSON.stringify(refundedJoin.body)}`
  );

  pass(
    "full refund blocks player rejoin"
  );

  /*
   * REFUNDED HEARTBEAT
   */
  const refundedHeartbeat =
    await requestHeartbeat({
      token,
      gameId,
      playerId: testPlayerId,
    });

  assert(
    refundedHeartbeat.status === 403,
    `expected refunded heartbeat HTTP 403, got ${refundedHeartbeat.status}`
  );

  assert(
    refundedHeartbeat.body.code ===
      "PURCHASE_REFUNDED",
    `expected heartbeat PURCHASE_REFUNDED, got ${JSON.stringify(refundedHeartbeat.body)}`
  );

  pass(
    "full refund blocks player heartbeat"
  );

  /*
   * STALE PARTIAL EVENT
   *
   * A later/replayed partial refund must never
   * reduce a completed full refund.
   */
  const stalePartialWebhook =
    await sendRefundWebhook({
      paymentIntentId,
      amountCents: 500,
      refundedAmountCents: 200,
      fullyRefunded: false,
    });

  assert(
    stalePartialWebhook.status === 200 &&
      stalePartialWebhook.body.received ===
        true,
    "stale partial refund webhook failed"
  );

  const afterStale =
    await getPurchase();

  assert(
    afterStale?.status ===
      "REFUNDED",
    "stale partial event changed REFUNDED status"
  );

  assert(
    Number(
      afterStale.refundedAmount
    ) === 5,
    `stale partial reduced refundedAmount to ${afterStale.refundedAmount}`
  );

  pass(
    "stale partial refund cannot undo full refund"
  );

  console.log();
  console.log(
    "======================================"
  );
  console.log(
    "ALL PURCHASE REFUND TESTS PASSED"
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
      "automated refund test data cleaned up"
    );
  } catch (cleanupError) {
    testFailed = true;

    console.error(
      "FAIL: automated refund cleanup failed:",
      cleanupError
    );
  }

  await pool.end();
}

if (testFailed) {
  process.exitCode = 1;
}
