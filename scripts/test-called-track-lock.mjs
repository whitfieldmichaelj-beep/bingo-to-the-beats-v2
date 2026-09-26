import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Executes the real Next route with controlled database/auth dependencies.
// The mutex models the Game row lock used by the existing marks/winner routes.
// These are deterministic handler tests, not a PostgreSQL load-test result.
const source = readFileSync("app/api/game/[gameId]/called-tracks/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);

function harness(options = {}) {
  let game = { id: "game-a", hostId: "owner", status: options.status ?? "LIVE", winner: null };
  const tracks = [
    { id: "a", gameId: "game-a", trackId: "db-a", track: { providerTrackId: "song-a" }, called: false, calledAt: null },
    { id: "b", gameId: "game-a", trackId: "db-b", track: { providerTrackId: "song-b" }, called: false, calledAt: null },
    { id: "foreign", gameId: "game-b", trackId: "db-foreign", track: { providerTrackId: "song-foreign" }, called: false, calledAt: null },
  ];
  const events = [];
  const inputs = [];
  let accessCalls = 0, transactionCalls = 0, queries = 0;
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  }
  async function finish(status = "COMPLETED") {
    const release = await acquire();
    try {
      events.push("finish");
      game.status = status;
      game.winner = status === "COMPLETED" ? "winner-a" : null;
    } finally { release(); }
  }
  function gameDelegate() {
    return {
      async findFirst({ where }) {
        queries++;
        if (options.missing || where.id !== game.id || where.host.clerkId !== game.hostId) return null;
        return { id: game.id, status: game.status };
      },
      async findUnique() { return { status: game.status, winners: [] }; },
    };
  }
  function trackDelegate(transactional) {
    return {
      async findMany({ where }) {
        queries++;
        inputs.push(where);
        return tracks.filter(t => t.gameId === where.gameId
          && (!where.id || where.id.in.includes(t.id))
          && (!where.track || where.track.providerTrackId.in.includes(t.track.providerTrackId))
          && (where.called === undefined || t.called === where.called)).map(t => ({ ...t }));
      },
      async updateMany({ where, data }) {
        queries++;
        events.push(transactional ? "update-in-transaction" : "update-outside-transaction");
        if (options.beforeUpdate) await options.beforeUpdate();
        const matches = tracks.filter(t => t.gameId === where.gameId && where.id.in.includes(t.id) && !t.called);
        for (const track of matches) Object.assign(track, data);
        if (options.failUpdate) throw new Error("simulated update failure");
        return { count: matches.length };
      },
    };
  }
  class HostAccessError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
  const prisma = {
    game: gameDelegate(),
    gameTrack: trackDelegate(false),
    async $transaction(callback) {
      transactionCalls++;
      let release = null, snapshot = null;
      const tx = {
        game: gameDelegate(),
        gameTrack: trackDelegate(true),
        async $queryRaw(strings, ...values) {
          assert.equal(strings.join("?").replace(/\s+/g, " ").trim(), 'SELECT "id" FROM "Game" WHERE "id" = ? FOR UPDATE');
          assert.deepEqual(Array.from(values), ["game-a"]);
          release = await acquire();
          snapshot = { game: { ...game }, tracks: tracks.map(t => ({ ...t })) };
          events.push("lock");
          return [{ id: game.id }];
        },
      };
      try { return await callback(tx); }
      catch (error) {
        if (snapshot) {
          game = snapshot.game;
          tracks.splice(0, tracks.length, ...snapshot.tracks);
        }
        events.push("rollback");
        throw error;
      } finally {
        events.push("transaction-end");
        if (release) release();
      }
    },
  };
  const modules = {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    "@clerk/nextjs/server": { auth: async () => ({ isAuthenticated: options.authenticated !== false, userId: options.userId ?? "owner" }) },
    "@/lib/prisma": { prisma },
    "@/lib/billing/access": {
      HostAccessError,
      async requireGameHostAccess() {
        accessCalls++;
        if (options.denied) throw new HostAccessError("Not entitled", 403);
        if (options.afterAccess) await options.afterAccess({ finish, game });
      },
    },
  };
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: id => { if (!(id in modules)) throw new Error(`Unexpected dependency: ${id}`); return modules[id]; },
    console: { error() {} },
  });
  return {
    post: (body = { gameTrackIds: ["a"] }) => exports.POST({ json: async () => body }, { params: Promise.resolve({ gameId: "game-a" }) }),
    get: () => exports.GET({}, { params: Promise.resolve({ gameId: "game-a" }) }),
    tracks, events, inputs, finish,
    game: () => game,
    counts: () => ({ accessCalls, transactionCalls, queries }),
  };
}

for (const status of ["COMPLETED", "CANCELLED"]) {
  test(`${status} rejects called-song writes without modifying final history`, async () => {
    const h = harness({ status });
    const response = await h.post();
    assert.equal(response.status, 409);
    assert.equal(response.body.ok, false);
    assert.equal(h.tracks.some(t => t.called), false);
  });
  test(`${status} during access check is re-read under the game lock`, async () => {
    const h = harness({ afterAccess: ({ finish }) => finish(status) });
    const response = await h.post();
    assert.equal(response.status, 409);
    assert.equal(h.tracks.some(t => t.called), false);
    assert.equal(h.game().status, status);
    assert.ok(h.events.includes("lock"));
  });
}

test("unauthenticated request is rejected before any database access", async () => {
  const h = harness({ authenticated: false });
  assert.equal((await h.post()).status, 401);
  assert.deepEqual(h.counts(), { accessCalls: 0, transactionCalls: 0, queries: 0 });
});

for (const config of [{ missing: true }, { userId: "another-host" }]) {
  test(`${config.missing ? "missing" : "foreign"} game returns 404 before acquiring a row lock`, async () => {
    const h = harness(config);
    assert.equal((await h.post()).status, 404);
    assert.equal(h.counts().transactionCalls, 0);
    assert.equal(h.counts().accessCalls, 0);
  });
}

test("billing rejection prevents all writes", async () => {
  const h = harness({ denied: true });
  assert.equal((await h.post()).status, 403);
  assert.equal(h.counts().transactionCalls, 0);
  assert.equal(h.tracks.some(t => t.called), false);
});

test("ownership is rechecked if it changes before the lock", async () => {
  const h = harness({ afterAccess: ({ game }) => { game.hostId = "another-host"; } });
  assert.equal((await h.post()).status, 404);
  assert.equal(h.tracks.some(t => t.called), false);
});

test("a valid write locks first and updates only inside the transaction", async () => {
  const h = harness();
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.matched, 1);
  assert.equal(response.body.updated, 1);
  assert.deepEqual(h.events, ["lock", "update-in-transaction", "transaction-end"]);
  assert.equal(h.tracks[0].called, true);
  assert.equal(h.tracks[1].called, false);
});

test("provider IDs and game-track IDs are deduplicated and remain game-scoped", async () => {
  const h = harness();
  const response = await h.post({ gameTrackIds: [" a ", "a", "foreign"], providerTrackIds: ["song-a", "song-b", "song-foreign"] });
  assert.equal(response.status, 200);
  assert.equal(response.body.matched, 2);
  assert.equal(response.body.updated, 2);
  assert.equal(h.tracks[2].called, false);
});

test("replayed song saves do not change the original called timestamp", async () => {
  const h = harness();
  await h.post();
  const timestamp = h.tracks[0].calledAt;
  const response = await h.post();
  assert.equal(response.body.matched, 1);
  assert.equal(response.body.updated, 0);
  assert.equal(h.tracks[0].calledAt, timestamp);
});

test("unknown songs return zero matches without creating or calling another track", async () => {
  const h = harness();
  const response = await h.post({ gameTrackIds: ["absent"] });
  assert.equal(response.body.matched, 0);
  assert.equal(response.body.updated, 0);
  assert.equal(h.tracks.some(t => t.called), false);
});

test("empty ID lists are a harmless no-op", async () => {
  const h = harness();
  const response = await h.post({ gameTrackIds: [], providerTrackIds: [] });
  assert.equal(response.status, 200);
  assert.equal(response.body.updated, 0);
});

test("input normalization retains the 500-ID limit", async () => {
  const h = harness();
  await h.post({ gameTrackIds: [null, " ", 42, ...Array.from({ length: 700 }, (_, i) => `track-${i}`)] });
  assert.equal(h.inputs[0].id.in.length, 500);
});

test("a database failure rolls back the song write", async () => {
  const h = harness({ failUpdate: true });
  assert.equal((await h.post()).status, 500);
  assert.equal(h.tracks.some(t => t.called), false);
  assert.ok(h.events.includes("rollback"));
});

test("completion waits for an earlier called-song transaction to finish", async () => {
  let notify, resume;
  const arrived = new Promise(resolve => { notify = resolve; });
  const proceed = new Promise(resolve => { resume = resolve; });
  const h = harness({ beforeUpdate: async () => { notify(); await proceed; } });
  const writing = h.post();
  await arrived;
  const finishing = h.finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.game().status, "LIVE");
  resume();
  assert.equal((await writing).status, 200);
  await finishing;
  assert.equal(h.game().status, "COMPLETED");
  assert.equal(h.game().winner, "winner-a");
  assert.equal(h.tracks[0].called, true);
  assert.ok(h.events.indexOf("transaction-end") < h.events.indexOf("finish"));
});

test("two simultaneous calls are serialized and update a song only once", async () => {
  const h = harness();
  const results = await Promise.all([h.post(), h.post()]);
  assert.equal(results.reduce((sum, r) => sum + r.body.updated, 0), 1);
  assert.equal(results.every(r => r.status === 200), true);
});

test("the public read response remains compatible after a valid save", async () => {
  const h = harness();
  await h.post();
  const response = await h.get();
  assert.equal(response.status, 200);
  assert.equal(response.body.gameStatus, "LIVE");
  assert.deepEqual(Array.from(response.body.calledGameTrackIds), ["a"]);
  assert.deepEqual(Array.from(response.body.calledTrackIds), ["song-a"]);
});
