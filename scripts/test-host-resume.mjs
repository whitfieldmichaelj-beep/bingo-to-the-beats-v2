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
const games = [{ id: 'saved-paid-game', joinCode: 'PAID01', title: 'Paid test game', playlistName: 'Test playlist', status: 'PAUSED', playlistTrackCount: 25, createdAt: new Date(), _count: { cards: 25 }, winners: [], cards: [], tracks: [], hostId: 'host-one' }, { id: 'other-host-game', hostId: 'host-two' }];
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
let accessDenied = false;
class HostAccessError extends Error { status = 402; }
const mocks = {
  '@/lib/game/entry': load('lib/game/entry.ts', {}),
  '@/lib/game/prize': load('lib/game/prize.ts', {}),
  '@/lib/game/expiration': { expireGames: async () => {} },
  '@/lib/billing/access': { HostAccessError, requireGameHostAccess: async () => { if (accessDenied) throw new HostAccessError('Subscription needs renewal.'); } },
  '@clerk/nextjs/server': { auth },
  '@/lib/prisma': { prisma },
  '@/lib/game/repository': { findGameById: async id => { loadedId = id; return games.find(game => game.id === id); } },
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
  'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error('not-found'); } },
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
accessDenied = true;
assert.equal((await GET(request('gameId=saved-paid-game'))).status, 402);
games[0].status = 'COMPLETED';
assert.equal((await GET(request('gameId=saved-paid-game'))).status, 200, 'owned completed history survives a new active game or expired billing');
games[0].status = 'CANCELLED';
assert.equal((await GET(request('gameId=saved-paid-game'))).status, 200, 'cancelled history remains readable without active-game billing');
games[0].status = 'PAUSED';
accessDenied = false;
console.log('PASS host restore enforces active-game access and preserves completed history access');

const dashboard = load('app/dashboard/page.tsx', { ...mocks, './SavedGames': load('app/dashboard/SavedGames.tsx', mocks) }).default;
const html = renderToStaticMarkup(await dashboard());
assert.match(html, /\/dj-console\?gameId=saved-paid-game/);
assert.match(html, /Resume Game/);
assert.doesNotMatch(html, /other-host-game/);
console.log('PASS dashboard lists owned database games and links Resume to the selected game');
for (const status of ['DRAFT', 'READY']) {
  games[0].status = status;
  const setupList = renderToStaticMarkup(await dashboard());
  assert.match(setupList, /href="\/game\/setup\?gameId=saved-paid-game"/);
  assert.match(setupList, /Entry &amp; Prize Setup/);
  assert.doesNotMatch(setupList, /Resume Game/);
}
games[0].status = 'LIVE';
assert.match(renderToStaticMarkup(await dashboard()), /href="\/dj-console\?gameId=saved-paid-game"/);
games[0].status = 'PAUSED';
console.log('PASS unstarted games open entry/prize setup; live and paused games retain console resume');

const history = load('app/dashboard/games/[gameId]/page.tsx', mocks).default;
const historyRequest = id => ({params:Promise.resolve({gameId:id})});
await assert.rejects(history(historyRequest('other-host-game')), /not-found/);
for (const status of ['COMPLETED','CANCELLED']) {
  games[0].status=status;
  games[0].winners=status==='COMPLETED'?[{id:'winner',card:{playerName:'Kiesha',cardNumber:2}}]:[];
  const list=renderToStaticMarkup(await dashboard());
  assert.match(list,/\/dashboard\/games\/saved-paid-game/);
  assert.doesNotMatch(list,/Resume Game/);
  const detail=renderToStaticMarkup(await history(historyRequest('saved-paid-game')));
  assert.match(detail,/VIEW ONLY/);
  assert.match(detail,/cannot restart, accept players/);
  assert.doesNotMatch(detail,/Resume Game|Players Join/);
  assert.match(list,status==='COMPLETED'?/Winner: Kiesha/:/No confirmed winner/);
  assert.match(detail,status==='COMPLETED'?/Kiesha/:/No confirmed winner/);
}
console.log('PASS completed and cancelled games stay visible, show confirmed winners, and open owned read-only history without join or resume controls');
userId = null;
await assert.rejects(dashboard(), /redirect:\/sign-in/);
await assert.rejects(history(historyRequest('saved-paid-game')), /redirect:\/sign-in/);
const consolePage = load('app/dj-console/page.tsx', { ...mocks, './DjConsole': { __esModule: true, default: () => null } }).default;
await assert.rejects(consolePage({ searchParams: Promise.resolve({}) }), /redirect:\/dashboard/);
userId='host-one';
await assert.rejects(consolePage({ searchParams: Promise.resolve({gameId:'saved-paid-game'}) }), /redirect:\/dashboard\/games\/saved-paid-game/);
games[0].status='PAUSED';
const selected = await consolePage({ searchParams: Promise.resolve({ gameId: 'saved-paid-game' }) });
assert.equal(selected.props.gameId, 'saved-paid-game');
assert.equal(selected.key, 'saved-paid-game');
console.log('PASS console requires an explicit game and remounts for each selection');

const setupPage=load('app/game/setup/page.tsx',{...mocks,'./GameSetup':{__esModule:true,default:({gameId,editable})=>React.createElement('div',{'data-game':gameId,'data-editable':String(editable)})}}).default;
const setupRequest=gameId=>({searchParams:Promise.resolve({gameId})});
userId=null;await assert.rejects(setupPage(setupRequest('saved-paid-game')),/redirect:\/sign-in/);
userId='host-one';await assert.rejects(setupPage(setupRequest('other-host-game')),/redirect:\/dashboard/);
await assert.rejects(setupPage(setupRequest(undefined)),/redirect:\/dashboard/);
for(const status of ['COMPLETED','CANCELLED']){games[0].status=status;await assert.rejects(setupPage(setupRequest('saved-paid-game')),/redirect:\/dashboard\/games\/saved-paid-game/);}
games[0].status='READY';games[0].startedAt=null;games[0]._count.purchases=0;
assert.match(renderToStaticMarkup(await setupPage(setupRequest('saved-paid-game'))),/data-editable="true"/);
games[0].startedAt=new Date();assert.match(renderToStaticMarkup(await setupPage(setupRequest('saved-paid-game'))),/data-editable="false"/);
console.log('PASS separate setup requires host ownership, protects closed history and locks choices after start');
