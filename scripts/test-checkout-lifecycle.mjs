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
    "JOIN_CODE is required. Example: JOIN_CODE=NU3C9E npm run test:checkout-lifecycle"
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

const parsedDatabaseUrl = new URL(databaseUrl);

const localDatabase =
  parsedDatabaseUrl.hostname === "localhost" ||
  parsedDatabaseUrl.hostname === "127.0.0.1" ||
  parsedDatabaseUrl.hostname === "::1";

if (
  !localDatabase &&
  process.env.ALLOW_NONLOCAL_TEST_DB !== "1"
) {
  throw new Error(
    "Refusing to run checkout regression test against a non-local database."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
});

const testPlayerIds = [];
const testPurchaseIds = [];
const testGameIds = [];

function pass(message) {
  console.log(`PASS  ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function makeId(prefix) {
  return `${prefix}_${randomUUID()
    .replaceAll("-", "")}`;
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

  const body = await response.json();

  return {
    status: response.status,
    body,
  };
}

async function sendWebhook({
  type,
  object,
  created =
    Math.floor(Date.now() / 1000),
}) {
  const payload = JSON.stringify({
    id: makeId("evt_auto"),
    object: "event",
    api_version: "2025-12-15.clover",
    created,
    livemode: false,
    pending_webhooks: 1,
    type,
    data: {
      object,
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

  const body = await response.json();

  return {
    status: response.status,
    body,
  };
}

async function getPurchase(purchaseId) {
  const result = await pool.query(
    `
      SELECT
        "status",
        "stripeCheckoutSessionId",
        "stripePaymentId",
        "playerKey"
      FROM "Purchase"
      WHERE "id" = $1
    `,
    [purchaseId]
  );

  return result.rows[0] || null;
}

async function getCard(cardId) {
  const result = await pool.query(
    `
      SELECT
        "status",
        "purchaseId",
        "playerKey",
        "playerName"
      FROM "BingoCard"
      WHERE "id" = $1
    `,
    [cardId]
  );

  return result.rows[0] || null;
}

async function createTestEnrollment(name) {
  const playerId =
    `auto-checkout-${randomUUID()}`;

  testPlayerIds.push(playerId);

  const token =
    await createToken(playerId);

  const join =
    await requestJoin({
      token,
      playerName: name,
    });

  assert(
    join.status === 200 &&
      join.body.ok === true,
    `join failed: ${JSON.stringify(join.body)}`
  );

  const purchaseId =
    join.body.player.purchaseId;

  testPurchaseIds.push(purchaseId);

  /*
   * Pending purchases intentionally do not expose card IDs
   * through the public join response. Read the temporary
   * reservation directly from the local test database.
   */
  const reservedCard =
    await pool.query(
      `
        SELECT "id"
        FROM "BingoCard"
        WHERE "purchaseId" = $1
        ORDER BY "cardNumber" ASC
        LIMIT 1
      `,
      [purchaseId]
    );

  assert(
    reservedCard.rows.length === 1,
    "temporary purchase has no reserved card"
  );

  return {
    playerId,
    token,
    gameId:
      join.body.player.gameId,
    purchaseId,
    cardId:
      reservedCard.rows[0].id,
    amountCents:
      join.body.player.amountCents,
  };
}

async function cleanup() {
  if (
    testPlayerIds.length === 0 &&
    testPurchaseIds.length === 0 &&
    testGameIds.length === 0
  ) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (testPurchaseIds.length > 0) {
      await client.query(
        `
          UPDATE "BingoCard"
          SET
            "playerKey" = NULL,
            "playerName" = NULL,
            "purchaseId" = NULL,
            "status" = 'AVAILABLE',
            "updatedAt" = NOW()
          WHERE "purchaseId" = ANY($1::text[])
        `,
        [testPurchaseIds]
      );
    }

    if (testPlayerIds.length > 0) {
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
    }

    if (testPurchaseIds.length > 0) {
      await client.query(
        `
          DELETE FROM "Purchase"
          WHERE "id" = ANY($1::text[])
        `,
        [testPurchaseIds]
      );
    }

    if (testGameIds.length > 0) {
      await client.query(
        `
          DELETE FROM "Game"
          WHERE "id" = ANY($1::text[])
        `,
        [testGameIds]
      );
    }

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
    "CHECKOUT LIFECYCLE REGRESSION TEST"
  );
  console.log(
    "----------------------------------"
  );
  console.log(`Game code: ${JOIN_CODE}`);
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

  /*
   * TEST 1:
   * Successful payment completion.
   */
  const paid =
    await createTestEnrollment(
      "Automated Paid Checkout"
    );

  pass("paid test player joined");

  const paidSessionId =
    makeId("cs_test_paid");

  const paymentIntentId =
    makeId("pi_test_paid");

  await pool.query(
    `
      UPDATE "Purchase"
      SET
        "stripeCheckoutSessionId" = $1,
        "updatedAt" = NOW()
      WHERE "id" = $2
    `,
    [
      paidSessionId,
      paid.purchaseId,
    ]
  );

  const paidSession = {
    id: paidSessionId,
    object: "checkout.session",
    payment_status: "paid",
    client_reference_id:
      paid.purchaseId,
    metadata: {
      purchaseId:
        paid.purchaseId,
      gameId:
        paid.gameId,
      playerId:
        paid.playerId,
    },
    amount_total:
      paid.amountCents,
    currency: "usd",
    payment_intent:
      paymentIntentId,
  };

  const completed =
    await sendWebhook({
      type:
        "checkout.session.completed",
      object: paidSession,
    });

  assert(
    completed.status === 200 &&
      completed.body.received === true,
    `payment webhook failed: ${JSON.stringify(completed.body)}`
  );

  const paidPurchase =
    await getPurchase(
      paid.purchaseId
    );

  assert(
    paidPurchase?.status === "PAID",
    `expected PAID, got ${paidPurchase?.status}`
  );

  assert(
    paidPurchase
      .stripeCheckoutSessionId ===
      paidSessionId,
    "paid purchase has wrong Checkout Session ID"
  );

  assert(
    paidPurchase.stripePaymentId ===
      paymentIntentId,
    "paid purchase has wrong PaymentIntent ID"
  );

  const paidCard =
    await getCard(paid.cardId);

  assert(
    paidCard?.purchaseId ===
      paid.purchaseId &&
      paidCard?.playerKey ===
        paid.playerId &&
      paidCard?.status !== "VOID" &&
      paidCard?.status !== "AVAILABLE",
    "successful payment should preserve assigned card"
  );

  pass(
    "successful checkout marks purchase paid"
  );

  /*
   * Replay the payment event.
   */
  const replayed =
    await sendWebhook({
      type:
        "checkout.session.completed",
      object: paidSession,
    });

  assert(
    replayed.status === 200 &&
      replayed.body.received === true,
    "replayed payment webhook failed"
  );

  const afterReplay =
    await getPurchase(
      paid.purchaseId
    );

  assert(
    afterReplay?.status === "PAID" &&
      afterReplay.stripePaymentId ===
        paymentIntentId,
    "replayed payment changed purchase incorrectly"
  );

  pass(
    "replayed payment completion is safe"
  );

  /*
   * An expiration event cannot cancel
   * an already-paid purchase.
   */
  const paidExpiration =
    await sendWebhook({
      type:
        "checkout.session.expired",
      object: {
        id: paidSessionId,
        object:
          "checkout.session",
        client_reference_id:
          paid.purchaseId,
        metadata: {
          purchaseId:
            paid.purchaseId,
        },
      },
    });

  assert(
    paidExpiration.status === 200 &&
      paidExpiration.body.received ===
        true,
    "paid expiration webhook failed"
  );

  const afterPaidExpiration =
    await getPurchase(
      paid.purchaseId
    );

  assert(
    afterPaidExpiration?.status ===
      "PAID",
    "expiration event cancelled a paid purchase"
  );

  pass(
    "expired event cannot cancel paid purchase"
  );

  /*
   * TEST 2:
   * Pending checkout expiration.
   */
  const expiring =
    await createTestEnrollment(
      "Automated Expired Checkout"
    );

  pass("expiration test player joined");

  const expiringAfterJoin =
    await getPurchase(
      expiring.purchaseId
    );

  assert(
    expiringAfterJoin?.status === "PENDING",
    `expiration test purchase started as ${expiringAfterJoin?.status}`
  );

  pass(
    "expiration test purchase starts pending"
  );

  const currentSessionId =
    makeId("cs_test_current");

  const staleSessionId =
    makeId("cs_test_stale");

  await pool.query(
    `
      UPDATE "Purchase"
      SET
        "stripeCheckoutSessionId" = $1,
        "updatedAt" = NOW()
      WHERE "id" = $2
    `,
    [
      currentSessionId,
      expiring.purchaseId,
    ]
  );

  const expiringAfterSession =
    await getPurchase(
      expiring.purchaseId
    );

  assert(
    expiringAfterSession?.status === "PENDING",
    `setting checkout session changed purchase to ${expiringAfterSession?.status}`
  );

  pass(
    "setting checkout session keeps purchase pending"
  );

  /*
   * Expiration from an older Stripe session
   * must be ignored.
   */
  const staleExpiration =
    await sendWebhook({
      type:
        "checkout.session.expired",
      object: {
        id: staleSessionId,
        object:
          "checkout.session",
        client_reference_id:
          expiring.purchaseId,
        metadata: {
          purchaseId:
            expiring.purchaseId,
        },
      },
    });

  assert(
    staleExpiration.status === 200 &&
      staleExpiration.body.received ===
        true,
    "stale expiration webhook failed"
  );

  const afterStale =
    await getPurchase(
      expiring.purchaseId
    );

  const cardAfterStale =
    await getCard(expiring.cardId);

  assert(
    afterStale?.status === "PENDING",
    `stale expiration changed purchase to ${afterStale?.status}`
  );

  assert(
    afterStale.playerKey ===
      expiring.playerId,
    "stale expiration released player enrollment"
  );

  assert(
    cardAfterStale?.purchaseId ===
      expiring.purchaseId &&
      cardAfterStale?.playerKey ===
        expiring.playerId,
    "stale expiration released card"
  );

  pass(
    "stale checkout expiration is ignored"
  );

  /*
   * Current expiration should cancel and
   * release the reservation while game is open.
   */
  const currentExpiration =
    await sendWebhook({
      type:
        "checkout.session.expired",
      object: {
        id: currentSessionId,
        object:
          "checkout.session",
        client_reference_id:
          expiring.purchaseId,
        metadata: {
          purchaseId:
            expiring.purchaseId,
        },
      },
    });

  assert(
    currentExpiration.status === 200 &&
      currentExpiration.body.received ===
        true,
    `current expiration webhook failed: ${JSON.stringify(currentExpiration.body)}`
  );

  const expiredPurchase =
    await getPurchase(
      expiring.purchaseId
    );

  const releasedCard =
    await getCard(expiring.cardId);

  assert(
    expiredPurchase?.status ===
      "CANCELLED",
    `expected CANCELLED, got ${expiredPurchase?.status}`
  );

  assert(
    expiredPurchase.playerKey ===
      null,
    "expired purchase did not release player enrollment"
  );

  assert(
    releasedCard?.status ===
      "AVAILABLE",
    `expected card AVAILABLE, got ${releasedCard?.status}`
  );

  assert(
    releasedCard.purchaseId === null &&
      releasedCard.playerKey === null &&
      releasedCard.playerName === null,
    "expired checkout did not fully release card"
  );

  pass(
    "current checkout expiration releases reservation"
  );

  /*
   * TEST 3:
   * A Stripe payment occurring in the exact same
   * second as game completion must be treated as a
   * legitimate payment and restore the voided card.
   *
   * Stripe event.created has whole-second precision,
   * while completedAt has millisecond precision.
   */
  const sameSecondGameId =
    randomUUID();

  const sameSecondJoinCode =
    `AUTO${randomUUID()
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase()}`;

  const completionSecond =
    Math.floor(Date.now() / 1000);

  const gameInsert =
    await pool.query(
      `
        INSERT INTO "Game" (
          "id",
          "hostId",
          "playlistId",
          "sourcePlaylistId",
          "playlistName",
          "playlistTrackCount",
          "title",
          "joinCode",
          "status",
          "locked",
          "winningRule",
          "requestedCardCount",
          "songsPerCard",
          "currentTrackId",
          "cardPrice",
          "currency",
          "maxPlayers",
          "startedAt",
          "completedAt",
          "createdAt",
          "updatedAt"
        )
        SELECT
          $1,
          "hostId",
          "playlistId",
          "sourcePlaylistId",
          "playlistName",
          "playlistTrackCount",
          'Automated Same Second Checkout',
          $2,
          'COMPLETED',
          TRUE,
          "winningRule",
          1,
          "songsPerCard",
          NULL,
          "cardPrice",
          "currency",
          "maxPlayers",
          "startedAt",
          (
            to_timestamp($3)
              AT TIME ZONE 'UTC'
          ) +
            INTERVAL '500 milliseconds',
          NOW(),
          NOW()
        FROM "Game"
        WHERE "joinCode" = $4
      `,
      [
        sameSecondGameId,
        sameSecondJoinCode,
        completionSecond,
        JOIN_CODE,
      ]
    );

  assert(
    gameInsert.rowCount === 1,
    "unable to create temporary completed game"
  );

  testGameIds.push(
    sameSecondGameId
  );

  const sameSecondPlayerId =
    `auto-same-second-${randomUUID()}`;

  const sameSecondPurchaseId =
    randomUUID();

  const sameSecondCardId =
    randomUUID();

  const sameSecondSessionId =
    makeId("cs_test_same_second");

  const sameSecondPaymentIntentId =
    makeId("pi_test_same_second");

  testPlayerIds.push(
    sameSecondPlayerId
  );

  testPurchaseIds.push(
    sameSecondPurchaseId
  );

  await pool.query(
    `
      INSERT INTO "Purchase" (
        "id",
        "gameId",
        "playerKey",
        "playerName",
        "stripeCheckoutSessionId",
        "quantity",
        "amount",
        "currency",
        "status",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        $3,
        'Automated Same Second Player',
        $4,
        1,
        1.00,
        'USD',
        'CANCELLED',
        NOW(),
        NOW()
      )
    `,
    [
      sameSecondPurchaseId,
      sameSecondGameId,
      sameSecondPlayerId,
      sameSecondSessionId,
    ]
  );

  await pool.query(
    `
      INSERT INTO "BingoCard" (
        "id",
        "gameId",
        "cardNumber",
        "status",
        "signature",
        "playerName",
        "playerKey",
        "purchaseId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        1,
        'VOID',
        'auto-same-second-signature',
        'Automated Same Second Player',
        $3,
        $4,
        NOW(),
        NOW()
      )
    `,
    [
      sameSecondCardId,
      sameSecondGameId,
      sameSecondPlayerId,
      sameSecondPurchaseId,
    ]
  );

  pass(
    "same-second completed-game fixture created"
  );

  const sameSecondWebhook =
    await sendWebhook({
      type:
        "checkout.session.completed",
      created:
        completionSecond,
      object: {
        id:
          sameSecondSessionId,
        object:
          "checkout.session",
        payment_status: "paid",
        client_reference_id:
          sameSecondPurchaseId,
        metadata: {
          purchaseId:
            sameSecondPurchaseId,
          gameId:
            sameSecondGameId,
          playerId:
            sameSecondPlayerId,
        },
        amount_total: 100,
        currency: "usd",
        payment_intent:
          sameSecondPaymentIntentId,
      },
    });

  assert(
    sameSecondWebhook.status === 200 &&
      sameSecondWebhook.body.received ===
        true,
    `same-second payment webhook failed: ${JSON.stringify(sameSecondWebhook.body)}`
  );

  const sameSecondPurchase =
    await getPurchase(
      sameSecondPurchaseId
    );

  const sameSecondCard =
    await getCard(
      sameSecondCardId
    );

  assert(
    sameSecondPurchase?.status ===
      "PAID",
    `same-second purchase expected PAID, got ${sameSecondPurchase?.status}`
  );

  assert(
    sameSecondCard?.status ===
      "ASSIGNED",
    `same-second payment should restore card to ASSIGNED, got ${sameSecondCard?.status}`
  );

  pass(
    "same-second completion payment restores card"
  );

  console.log();
  console.log(
    "======================================"
  );
  console.log(
    "ALL CHECKOUT LIFECYCLE TESTS PASSED"
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
      "automated checkout test data cleaned up"
    );
  } catch (cleanupError) {
    testFailed = true;

    console.error(
      "FAIL: automated checkout cleanup failed:",
      cleanupError
    );
  }

  await pool.end();
}

if (testFailed) {
  process.exitCode = 1;
}
