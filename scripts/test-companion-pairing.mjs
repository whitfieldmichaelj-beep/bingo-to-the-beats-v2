import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(file, "utf8"),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      }
    ).outputText,
    {
      exports,
      require: id => mocks[id] ?? {},
      console,
      Date,
      Promise,
    }
  );
  return exports;
}

const next = {
  NextResponse: {
    json: (body, options = {}) => ({
      body,
      status: options.status ?? 200,
    }),
  },
};

let userId = "host-one";
let sessionId = "session-one";
let sessionUpserts = 0;

const pair = {
  id: "pair-1",
  code: "ABC123",
  secretHash: "secret",
  tokenHash: "token-hash",
  deviceId: "device-1",
  deviceName: "DJ Laptop",
  clerkId: null,
  initialSessionId: null,
  approvedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
};

function applyPairUpdate(data) {
  Object.assign(pair, data);
  return { ...pair };
}

const tx = {
  companionLibrarySnapshot: {
    deleteMany: async () => ({ count: 0 }),
  },
  companionSession: {
    updateMany: async () => ({ count: 0 }),
    upsert: async () => {
      sessionUpserts += 1;
      return {};
    },
  },
  companionPairRequest: {
    update: async ({ data }) =>
      applyPairUpdate(data),
  },
};

const prisma = {
  companionPairRequest: {
    findUnique: async () => ({ ...pair }),
    update: async ({ data }) =>
      applyPairUpdate(data),
  },
  $transaction: async callback =>
    callback(tx),
};

const route = load(
  "app/api/companion/pair/route.ts",
  {
    "@clerk/nextjs/server": {
      auth: async () => ({
        userId,
        sessionId,
      }),
    },
    "next/server": next,
    "@/lib/prisma": { prisma },
  }
);

const request = {
  json: async () => ({ code: "ABC123" }),
};

const first = await route.POST(request);
assert.equal(first.status, 409);
assert.equal(
  first.body.code,
  "BTTB_COMPANION_RELOGIN_REQUIRED"
);
assert.equal(first.body.requiresRelogin, true);
assert.equal(pair.clerkId, "host-one");
assert.equal(
  pair.initialSessionId,
  "session-one"
);
assert.equal(sessionUpserts, 0);

const sameSession = await route.POST(request);
assert.equal(sameSession.status, 409);
assert.equal(
  sameSession.body.requiresRelogin,
  true
);
assert.equal(sessionUpserts, 0);

sessionId = "session-two";
const reconnected = await route.POST(request);
assert.equal(reconnected.status, 200);
assert.equal(reconnected.body.paired, true);
assert.equal(sessionUpserts, 1);
assert.ok(pair.approvedAt instanceof Date);

pair.approvedAt = null;
pair.clerkId = "host-one";
pair.initialSessionId = "session-one";
userId = "host-two";
sessionId = "other-session";

const takeover = await route.POST(request);
assert.equal(takeover.status, 403);
assert.equal(sessionUpserts, 1);

console.log(
  "PASS Companion pairing requires a new Clerk session and blocks account takeover"
);
