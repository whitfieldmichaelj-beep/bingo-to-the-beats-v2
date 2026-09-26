import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Executes the production queue, not a copied implementation. Most tests use
// controlled timers; the last test uses native fetch and a real loopback HTTP
// server with the unmodified 10-second deadline. No user DB, game, credentials,
// Stripe connection, or external network is used by this test file.
const sourcePath = process.env.BTTB_QUEUE_TEST_SOURCE || "lib/game/called-track-queue.ts";
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function store() {
  const records = new Map();
  return {
    records,
    get length() { return records.size; },
    key: i => [...records.keys()][i] ?? null,
    getItem: k => records.get(k) ?? null,
    setItem: (k, v) => { records.set(k, v); },
    removeItem: k => { records.delete(k); },
  };
}
const success = () => ({ ok: true, json: async () => ({ ok: true, matched: 1 }) });
function load(fetcher, schedule = setTimeout, cancel = clearTimeout) {
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports, AbortController, fetch: fetcher, setTimeout: schedule, clearTimeout: cancel,
  });
  return exports;
}
function harness(t, storage = store(), gameId = "game-a") {
  const timers = new Map();
  const requests = [];
  let handle = 0, behavior = success;
  const loaded = load((url, options) => {
    const request = { url, ...options, payload: JSON.parse(options.body) };
    requests.push(request);
    return behavior(request);
  }, (fn, ms) => {
    assert.equal(ms, 10_000, "Production deadline stays at ten seconds");
    timers.set(++handle, fn); return handle;
  }, id => timers.delete(id));
  const queue = loaded.createCalledTrackQueue(gameId, storage);
  t.after(() => queue.dispose());
  return {
    queue, storage, requests, timers,
    use: fn => { behavior = fn; },
    timeout() {
      assert.ok(timers.size > 0, "An in-flight save must have a deadline");
      const batch = [...timers.entries()];
      for (const [id, fn] of batch) { timers.delete(id); fn(); }
    },
  };
}
const check = (name, fn) => test(name, { timeout: 2500 }, fn);

check("successful save persists before sending, then acknowledges and cleans up its deadline", async t => {
  const h = harness(t);
  h.use(request => {
    assert.equal(h.storage.records.size, 1);
    assert.equal(request.payload.gameTrackIds[0], "db-a");
    return success();
  });
  h.queue.enqueue({ id: "a", gameTrackId: "db-a" });
  await settle();
  assert.equal(h.storage.records.size, 0);
  assert.equal(h.timers.size, 0);
  h.queue.enqueue({ id: "a", gameTrackId: "db-a" }); await h.queue.flush();
  assert.equal(h.requests.length, 1, "Acknowledged songs are not posted twice");
});

check("a hanging request times out, preserves the song, and lets the later song save", async t => {
  const h = harness(t), hanging = deferred();
  h.use(request => request.payload.providerTrackIds[0] === "a" ? hanging.promise : success());
  h.queue.enqueue({ id: "a" }); h.queue.enqueue({ id: "b" });
  await h.queue.flush();
  assert.equal(h.requests.length, 1, "Flushes do not overlap");
  h.timeout(); await settle();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests.length, 2, "The next song can now be attempted");
  assert.equal(h.requests[1].payload.providerTrackIds[0], "b");
  assert.equal(h.storage.records.size, 1, "Only the unacknowledged song remains");
  h.use(success); await h.queue.flush();
  assert.equal(h.storage.records.size, 0, "A new attempt can recover the first song");
  assert.equal(h.timers.size, 0);
});

check("a stalled JSON body has the same deadline as a stalled connection", async t => {
  const h = harness(t), body = deferred();
  h.use(() => ({ ok: true, json: () => body.promise }));
  h.queue.enqueue({ id: "a" }); await settle();
  h.timeout(); await settle();
  assert.equal(h.storage.records.size, 1);
  assert.equal(h.requests[0].signal.aborted, true);
  h.use(success); await h.queue.flush();
  assert.equal(h.storage.records.size, 0);
});

check("a late success after timeout cannot erase an unacknowledged retry record", async t => {
  const h = harness(t), late = deferred();
  h.use(() => late.promise); h.queue.enqueue({ id: "a" });
  h.timeout(); await settle();
  late.resolve(success()); await settle();
  assert.equal(h.storage.records.size, 1);
  h.use(success); await h.queue.flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.storage.records.size, 0);
});

check("a late rejection after timeout is observed and does not poison the queue", async t => {
  const h = harness(t), late = deferred();
  h.use(() => late.promise); h.queue.enqueue({ id: "a" });
  h.timeout(); await settle(); late.reject(new Error("late failure")); await settle();
  h.use(success); await h.queue.flush();
  assert.equal(h.storage.records.size, 0);
});

for (const status of [401, 409, 500]) {
  check(`HTTP ${status} keeps the pending record instead of falsely acknowledging it`, async t => {
    const h = harness(t);
    h.use(() => ({ ok: false, status, json: () => { throw new Error("Do not parse error as success"); } }));
    h.queue.enqueue({ id: "a" }); await settle();
    assert.equal(h.storage.records.size, 1); assert.equal(h.timers.size, 0);
    h.use(success); await h.queue.flush(); assert.equal(h.storage.records.size, 0);
  });
}

for (const payload of [null, { ok: true, matched: 0 }, { ok: false, matched: 1 }, { ok: true, matched: "1" }]) {
  check(`invalid or unmatched acknowledgment remains retryable: ${JSON.stringify(payload)}`, async t => {
    const h = harness(t);
    h.use(() => ({ ok: true, json: async () => payload }));
    h.queue.enqueue({ id: "a" }); await settle();
    assert.equal(h.storage.records.size, 1);
    h.use(success); await h.queue.flush(); assert.equal(h.storage.records.size, 0);
  });
}

check("malformed JSON and immediate fetch exceptions release the queue", async t => {
  const h = harness(t);
  h.use(() => ({ ok: true, json: async () => { throw new SyntaxError("invalid JSON"); } }));
  h.queue.enqueue({ id: "a" }); await settle();
  assert.equal(h.timers.size, 0); assert.equal(h.storage.records.size, 1);
  h.use(() => { throw new Error("offline"); }); await h.queue.flush();
  assert.equal(h.timers.size, 0); assert.equal(h.storage.records.size, 1);
  h.use(success); await h.queue.flush(); assert.equal(h.storage.records.size, 0);
});

check("dispose aborts the request, retains browser records, and forbids later sends", async t => {
  const h = harness(t), hanging = deferred();
  h.use(() => hanging.promise); h.queue.enqueue({ id: "a" });
  h.queue.dispose(); await settle();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.timers.size, 0); assert.equal(h.storage.records.size, 1);
  hanging.resolve(success()); await settle();
  h.queue.enqueue({ id: "b" }); await h.queue.flush();
  assert.equal(h.requests.length, 1); assert.equal(h.storage.records.size, 1);
});

check("after timeout and reload only the same game's saved songs are retried", async t => {
  const shared = store(), first = harness(t, shared, "game-a");
  first.use(() => new Promise(() => {})); first.queue.enqueue({ id: "a", gameTrackId: "db-a" });
  first.timeout(); await settle(); first.queue.dispose();
  const unrelated = harness(t, shared, "game-b"); await unrelated.queue.flush();
  assert.equal(unrelated.requests.length, 0);
  const restored = harness(t, shared, "game-a"); await restored.queue.flush();
  assert.equal(restored.requests.length, 1);
  assert.equal(restored.requests[0].payload.gameTrackIds[0], "db-a");
  assert.equal(shared.records.size, 0);
});

check("two tabs cannot clear each other's pending songs during timeout recovery", async t => {
  const shared = store(), a = harness(t, shared), b = harness(t, shared);
  a.use(() => new Promise(() => {})); b.use(() => new Promise(() => {}));
  a.queue.enqueue({ id: "a" }); b.queue.enqueue({ id: "b" });
  a.timeout(); b.timeout(); await settle();
  a.use(success); await a.queue.flush();
  assert.equal(shared.records.size, 1);
  assert.equal(JSON.parse([...shared.records.values()][0]).id, "b");
  b.use(success); await b.queue.flush(); assert.equal(shared.records.size, 0);
});

check("blocked storage still permits in-memory timeout recovery", async t => {
  const blocked = {
    get length() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); },
  };
  const h = harness(t, blocked);
  h.use(() => new Promise(() => {})); h.queue.enqueue({ id: "a" });
  h.timeout(); await settle(); h.use(success); await h.queue.flush();
  assert.equal(h.requests.length, 2);
  h.queue.enqueue({ id: "a" }); await h.queue.flush(); assert.equal(h.requests.length, 2);
});

check("repeated recovery does not retain timers or duplicate acknowledged songs", async t => {
  const h = harness(t); const acknowledged = new Set(); let fail = true;
  h.use(request => {
    if (fail) return new Promise(() => {});
    const id = request.payload.providerTrackIds[0];
    assert.equal(acknowledged.has(id), false); acknowledged.add(id); return success();
  });
  for (let i = 0; i < 100; i++) {
    fail = true; h.queue.enqueue({ id: `track-${i}` });
    h.timeout(); await settle();
    fail = false; await h.queue.flush();
    assert.equal(h.timers.size, 0); assert.equal(h.storage.records.size, 0);
  }
  assert.equal(acknowledged.size, 100); assert.equal(h.requests.length, 200);
});

async function waitUntil(condition, milliseconds = 3000) {
  const deadline = Date.now() + milliseconds;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Condition did not settle before test deadline");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("native HTTP: a ten-second stalled body is aborted; later and retried songs succeed", { timeout: 17_000 }, async t => {
  const sockets = new Set(), received = [], persisted = store();
  let first = true, firstResponse;
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const body = JSON.parse(text); received.push(body.providerTrackIds[0]);
    response.writeHead(200, { "Content-Type": "application/json" });
    if (first) {
      first = false; firstResponse = response;
      // Valid headers arrive, but the JSON body never completes.
      response.write('{"ok":'); return;
    }
    response.end(JSON.stringify({ ok: true, matched: 1 }));
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch;
  const loaded = load((url, options) => nativeFetch(new URL(url, origin), options));
  const queue = loaded.createCalledTrackQueue("transport-test", persisted);
  t.after(() => queue.dispose());
  assert.equal(loaded.CALLED_TRACK_SAVE_TIMEOUT_MS, 10_000);
  const started = performance.now();
  queue.enqueue({ id: "first" }); queue.enqueue({ id: "second" });
  await waitUntil(() => received.length === 2 && persisted.records.size === 1, 14_000);
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 9_000 && elapsed < 14_000, `Expected a bounded ten-second wait, received ${elapsed}ms`);
  await waitUntil(() => firstResponse.destroyed);
  assert.deepEqual(received, ["first", "second"]);
  await queue.flush();
  assert.deepEqual(received, ["first", "second", "first"]);
  assert.equal(persisted.records.size, 0);
});
