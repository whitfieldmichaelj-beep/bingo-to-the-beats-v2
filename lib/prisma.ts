import { randomUUID } from "node:crypto";

import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type PrismaGlobals = {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

const globalForPrisma =
  globalThis as unknown as PrismaGlobals;

const connectionString =
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not defined."
  );
}

/*
 * BTTB_PRISMA_PREPARED_STATEMENT_FIX_V2
 *
 * Reuse BOTH PrismaClient and the pg Pool during Next.js hot reload.
 *
 * The local Prisma Postgres TCP bridge has shown two incompatible
 * prepared-statement failure modes in this project:
 *
 *   08P01 - unnamed statement parameter mismatch
 *   42P05 - deterministic named statement already exists
 *
 * Give every query execution its own unique statement name instead
 * of sharing the unnamed slot or trying to reuse a deterministic
 * server-side prepared statement name.
 */
const pool =
  globalForPrisma.prismaPool ??
  new Pool({
    connectionString,

    // BTTB_LOCAL_PRISMA_CONCURRENCY_FIX_V1
  max:
    process.env.NODE_ENV ===
    "production"
      ? 10
      : 1,

    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis:
    process.env.NODE_ENV ===
    "production"
      ? 5_000
      : 0,

    /*
     * Periodically recycle physical pg clients.
     * This bounds the lifetime of uniquely named prepared statements
     * on a client and also gives dev hot-reload sessions a clean slate.
     */
    maxUses:
      process.env.NODE_ENV ===
      "production"
        ? 5_000
        : 250,

    maxLifetimeSeconds:
      process.env.NODE_ENV ===
      "production"
        ? 30 * 60
        : 10 * 60,
  });

if (
  process.env.NODE_ENV !==
  "production"
) {
  globalForPrisma.prismaPool =
    pool;
}

const processStatementPrefix =
  `bttb_${process.pid.toString(36)}_`;

let statementCounter = 0;

const adapter =
  new PrismaPg(
    pool,
    {
      /*
       * BTTB_PRISMA_UNIQUE_STATEMENT_NAMES_V1
       *
       * Do NOT generate deterministic names here.
       * A process id + counter + UUID keeps every statement name
       * distinct, preventing both unnamed-slot collisions and
       * "already exists" collisions from deterministic names.
       */
      statementNameGenerator:
        () => {
          statementCounter += 1;

          return [
            processStatementPrefix,
            statementCounter.toString(36),
            "_",
            randomUUID()
              .replaceAll("-", "")
              .slice(0, 16),
          ].join("");
        },
    }
  );

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (
  process.env.NODE_ENV !==
  "production"
) {
  globalForPrisma.prisma =
    prisma;
}
