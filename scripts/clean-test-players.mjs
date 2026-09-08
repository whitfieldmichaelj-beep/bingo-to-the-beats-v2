import { createRequire } from "node:module";
import readline from "node:readline/promises";
import process from "node:process";
import pg from "pg";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { Pool } = pg;

loadEnvConfig(process.cwd(), true);

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing.");
}

const parsedUrl = new URL(databaseUrl);

const localHosts = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

if (!localHosts.has(parsedUrl.hostname)) {
  throw new Error(
    `REFUSING TO RUN: cleanup is LOCAL ONLY. Database host is "${parsedUrl.hostname}".`
  );
}

const gameCode =
  (process.env.JOIN_CODE || "NU3C9E")
    .trim()
    .toUpperCase();

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
});

async function counts(client, gameId) {
  const result = await client.query(
    `
      SELECT
        (SELECT COUNT(*)::int
         FROM "GameSession"
         WHERE "gameId" = $1) AS sessions,

        (SELECT COUNT(*)::int
         FROM "Purchase"
         WHERE "gameId" = $1) AS purchases,

        (SELECT COUNT(*)::int
         FROM "BingoCard"
         WHERE "gameId" = $1
           AND (
             "playerKey" IS NOT NULL
             OR "playerName" IS NOT NULL
             OR "purchaseId" IS NOT NULL
           )) AS cards
    `,
    [gameId]
  );

  return result.rows[0];
}

async function main() {
  const client = await pool.connect();

  try {
    const gameResult = await client.query(
      `
        SELECT id, title, "joinCode", status
        FROM "Game"
        WHERE UPPER("joinCode") = $1
        LIMIT 1
      `,
      [gameCode]
    );

    if (gameResult.rowCount !== 1) {
      throw new Error(
        `No local game found with join code ${gameCode}.`
      );
    }

    const game = gameResult.rows[0];
    const before = await counts(client, game.id);

    console.log("");
    console.log("======================================");
    console.log("BINGO TO THE BEATS");
    console.log("LOCAL TEST PLAYER CLEANUP");
    console.log("======================================");
    console.log(`Game: ${game.title}`);
    console.log(`Game code: ${game.joinCode}`);
    console.log(`Status: ${game.status}`);
    console.log("");
    console.log(`Player sessions: ${before.sessions}`);
    console.log(`Purchases:       ${before.purchases}`);
    console.log(`Assigned cards:  ${before.cards}`);
    console.log("");

    if (
      before.sessions === 0 &&
      before.purchases === 0 &&
      before.cards === 0
    ) {
      console.log("Nothing to clean.");
      return;
    }

    console.log("This WILL:");
    console.log("- remove old local player sessions");
    console.log("- remove local test purchases");
    console.log("- release assigned bingo cards");
    console.log("- clear marks from those cards");
    console.log("- remove winner records tied to those cards");
    console.log("");
    console.log("This WILL NOT:");
    console.log("- delete the game");
    console.log("- delete the playlist or tracks");
    console.log("- delete the bingo card inventory");
    console.log("- touch Stripe Sandbox payment history");
    console.log("");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const expected = `CLEAN ${game.joinCode}`;

    const answer = await rl.question(
      `Type "${expected}" to continue: `
    );

    rl.close();

    if (answer.trim().toUpperCase() !== expected) {
      console.log("");
      console.log("Cleanup cancelled. Nothing changed.");
      return;
    }

    await client.query("BEGIN");

    try {
      const cardResult = await client.query(
        `
          SELECT id
          FROM "BingoCard"
          WHERE "gameId" = $1
            AND (
              "playerKey" IS NOT NULL
              OR "playerName" IS NOT NULL
              OR "purchaseId" IS NOT NULL
            )
        `,
        [game.id]
      );

      const cardIds = cardResult.rows.map(
        (row) => row.id
      );

      if (cardIds.length > 0) {
        await client.query(
          `
            DELETE FROM "Winner"
            WHERE "gameId" = $1
              AND "cardId" = ANY($2::text[])
          `,
          [game.id, cardIds]
        );

        await client.query(
          `
            UPDATE "CardSquare"
            SET
              marked = FALSE,
              "markedAt" = NULL
            WHERE "cardId" = ANY($1::text[])
          `,
          [cardIds]
        );

        await client.query(
          `
            UPDATE "BingoCard"
            SET
              "playerName" = NULL,
              "playerKey" = NULL,
              "purchaseId" = NULL,
              status = 'AVAILABLE',
              "updatedAt" = NOW()
            WHERE id = ANY($1::text[])
          `,
          [cardIds]
        );
      }

      await client.query(
        `
          DELETE FROM "GameSession"
          WHERE "gameId" = $1
        `,
        [game.id]
      );

      await client.query(
        `
          DELETE FROM "Purchase"
          WHERE "gameId" = $1
        `,
        [game.id]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const after = await counts(client, game.id);

    console.log("");
    console.log("======================================");
    console.log("CLEANUP COMPLETE");
    console.log("======================================");
    console.log(`Player sessions: ${after.sessions}`);
    console.log(`Purchases:       ${after.purchases}`);
    console.log(`Assigned cards:  ${after.cards}`);
    console.log("");
    console.log(
      `Game ${game.joinCode} is ready for fresh players.`
    );
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
