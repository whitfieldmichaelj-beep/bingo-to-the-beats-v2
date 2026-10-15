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
      Buffer,
      process,
    }
  );
  return exports;
}

let snapshotDeletes = 0;
let sessionUpdates = 0;
let session = {
  id: "session-record",
  clerkId: "host",
  deviceId: "device",
  tokenHash: "",
  isActive: true,
  lastHeartbeatAt: new Date(
    Date.now() - 120_000
  ),
};

const prisma = {
  companionSession: {
    findUnique: async ({ where }) =>
      where.tokenHash === session.tokenHash
        ? { ...session }
        : null,
    updateMany: async () => {
      sessionUpdates += 1;
      session = {
        ...session,
        isActive: false,
      };
      return { count: 1 };
    },
  },
  companionLibrarySnapshot: {
    deleteMany: async () => {
      snapshotDeletes += 1;
      return { count: 1 };
    },
  },
  $transaction: async operations =>
    Promise.all(operations),
};

const module = load(
  "lib/companion/session.ts",
  {
    "node:crypto": await import("node:crypto"),
    "@/lib/prisma": { prisma },
  }
);

const token = "resume-token";
session.tokenHash =
  module.hashCompanionToken(token);

const resumed =
  await module.verifyCompanionToken(token);

assert.equal(
  resumed?.deviceId,
  "device",
  "a paired DJ computer may resume after a heartbeat timeout"
);
assert.equal(
  snapshotDeletes,
  1,
  "stale cloud snapshot is removed before the computer resumes"
);
assert.equal(
  sessionUpdates,
  0,
  "heartbeat timeout must not permanently revoke an otherwise paired device"
);

const revokedCount =
  await module.revokeCompanionSessions(
    "host"
  );

assert.equal(revokedCount, 1);
assert.equal(
  session.isActive,
  false,
  "logout permanently revokes the paired credential"
);
assert.equal(
  await module.verifyCompanionToken(token),
  null,
  "a logged-out pairing cannot silently reconnect"
);

console.log(
  "PASS Companion sleep/restart resumes safely while BTTB logout revokes the pairing"
);
