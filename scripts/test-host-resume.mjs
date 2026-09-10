import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

function load(file, mocks) {
  const output = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => mocks[name] ?? require(name), console, URL });
  return exports;
}
let userId = null;
let ownershipQuery;
let loadedId;
const games = [{ id: 'saved-paid-game', joinCode: 'PAID01', title: 'Paid test game', playlistName: 'Test playlist', status: 'PAUSED', playlistTrackCount: 25, createdAt: new Date(), _count: { cards: 25 }, hostId: 'host-one' }, { id: 'other-host-game', hostId: 'host-two' }];
const auth = async () => ({ userId, isAuthenticated: Boolean(userId) });
const prisma = { game: {
  async findFirst(query) {
    ownershipQuery = query;
    return games.find(game => game.id === query.where.id && game.hostId === query.where.host.clerkId) ?? null;
  },
  async findMany(query) {
    assert.equal(query.where.host.clerkId, userId);
    return games.filter(game => game.hostId === query.where.host.clerkId);
  },
} };
const mocks = {
  '@clerk/nextjs/server': { auth },
  '@/lib/prisma': { prisma },
  '@/lib/game/repository': { findGameById: async id => { loadedId = id; return games.find(game => game.id === id); } },
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
  'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
  'next/link': { __esModule: true, default: ({ href, children, style }) => React.createElement('a', { href, style }, children) },
};
const { GET } = load('app/api/game/restore/route.ts', mocks);
const request = query => ({ nextUrl: new URL(`http://localhost/api/game/restore?${query}`) });
assert.equal((await GET(request('gameId=saved-paid-game'))).status, 401);
userId = 'host-one';
assert.equal((await GET(request('code=PAID01'))).status, 400);
assert.equal((await GET(request('gameId=other-host-game'))).status, 404);
assert.equal(loadedId, undefined, 'another host’s game must never load');
assert.equal((await GET(request('gameId=missing'))).status, 404);
const result = await GET(request('gameId=saved-paid-game'));
assert.equal(result.status, 200);
assert.equal(result.body.game.id, 'saved-paid-game');
assert.equal(loadedId, 'saved-paid-game');
assert.equal(ownershipQuery.where.host.clerkId, 'host-one');
console.log('PASS host restore rejects unauthenticated, missing, foreign, and join-code-only requests');
console.log('PASS host restore returns the selected owned game by database ID');

const dashboard = load('app/dashboard/page.tsx', mocks).default;
const html = renderToStaticMarkup(await dashboard());
assert.match(html, /\/dj-console\?gameId=saved-paid-game/);
assert.match(html, /Resume Game/);
assert.doesNotMatch(html, /other-host-game/);
console.log('PASS dashboard lists owned database games and links Resume to the selected game');
userId = null;
await assert.rejects(dashboard(), /redirect:\/sign-in/);
const consolePage = load('app/dj-console/page.tsx', { ...mocks, './DjConsole': { __esModule: true, default: () => null } }).default;
await assert.rejects(consolePage({ searchParams: Promise.resolve({}) }), /redirect:\/dashboard/);
const selected = await consolePage({ searchParams: Promise.resolve({ gameId: 'saved-paid-game' }) });
assert.equal(selected.props.gameId, 'saved-paid-game');
assert.equal(selected.key, 'saved-paid-game');
console.log('PASS console requires an explicit game and remounts for each selection');
