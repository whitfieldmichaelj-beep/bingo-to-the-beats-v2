import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createPlayerGateway } from './lib/remote-player-gateway.mjs';

const game = { id: randomUUID(), joinCode: 'TEST12' };
async function setup(t, options = {}) {
  const requests = [];
  const upstream = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    requests.push({ url: req.url, headers: req.headers, body: text && JSON.parse(text) });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/game/join-options')) return res.end(JSON.stringify({ isPractice: options.practice !== false, entry: options.entry }));
    res.setHeader('Set-Cookie', ['bttb-player-session=signed.token.value; HttpOnly', '__session=host.secret']);
    res.end(JSON.stringify({ ok: true }));
  }).listen(0, '127.0.0.1'); await once(upstream, 'listening');
  let origin;
  const invite = randomBytes(32).toString('hex');
  const gateway = createPlayerGateway({ game, invite, assets: '.bttb-remote/dist',
    upstream: `http://127.0.0.1:${upstream.address().port}`, getOrigin: () => origin, ...options,
  }).listen(0, '127.0.0.1'); await once(gateway, 'listening');
  origin = `http://127.0.0.1:${gateway.address().port}`;
  t.after(() => { gateway.closeAllConnections(); upstream.closeAllConnections(); gateway.close(); upstream.close(); });
  const access = await fetch(`${origin}/access`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ invite }) });
  const cookie = access.headers.get('set-cookie')?.split(';')[0] || '';
  const call = (url, method = 'GET', body, custom = {}) => fetch(`${origin}${url}`, {
    method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', ...custom }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { requests, call, origin, cookie, invite, gateway };
}

test('invitation gate, host and origin validation, cookie isolation', async t => {
  const h = await setup(t);
  assert.equal((await fetch(`${h.origin}/api/game/join-options?code=${game.joinCode}`)).status, 401);
  assert.equal((await h.call('/access', 'POST', { invite: 'wrong' })).status, 403);
  assert.equal((await h.call('/access', 'POST', { invite: h.invite }, { Origin: 'https://other.example' })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const request = http.get(`${h.origin}/join`, { headers: { Host: 'other.example', Cookie: h.cookie } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(wrongHost, 403);
  const response = await h.call('/api/game/join', 'POST', { joinCode: game.joinCode, playerName: 'Tester', cardQuantity: 1 }, {
    Cookie: `${h.cookie}; bttb-player-session=player.signed.token; __session=host.cookie`, Authorization: 'Bearer host-token', 'Next-Action': 'secret', 'X-Forwarded-Host': 'elsewhere.example',
  });
  assert.equal(response.status, 200);
  const forwarded = h.requests.at(-1);
  assert.equal(forwarded.headers.cookie, 'bttb-player-session=player.signed.token');
  for (const key of ['authorization', 'next-action', 'x-forwarded-host']) assert.equal(forwarded.headers[key], undefined);
  assert.match(response.headers.get('set-cookie'), /^bttb-player-session=signed.token.value;/);
  assert.doesNotMatch(response.headers.get('set-cookie'), /host.secret/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
});

test('all host, payment, library, dev, other-game and host-claim routes are blocked', async t => {
  const h = await setup(t);
  const forbidden = ['/dashboard', '/dj-console', '/api/game/create', '/api/dj-widget', '/api/serato/library', '/api/dj/virtualdj/now-playing', '/api/checkout', '/api/beta/health', '/.env', '/_next/static/chunks/app/dj-console/page.js', '/__nextjs_original-stack-frames', '/api/game/join-options?code=HE294R', `/api/game/${randomUUID()}/called-tracks`, `/api/game/${game.id}/bingo`, '/game/results?gameId=other'];
  for (const route of forbidden) assert.equal((await h.call(route)).status, 404, route);
  for (const route of [`/api/game/${game.id}/called-tracks`, `/api/game/${game.id}/status`]) assert.equal((await h.call(route, 'POST', {})).status, 404);
  assert.equal((await h.call(`/api/game/${game.id}/bingo`, 'PATCH')).status, 404);
  assert.equal((await h.call('/api/game/join', 'POST', { joinCode: 'HE294R', cardQuantity: 1, playerName: 'Test' })).status, 404);
  assert.equal((await h.call('/api/game/player/marks', 'PUT', { gameId: 'other', marks: [] })).status, 404);
  assert.equal((await h.call('/api/game/player/heartbeat', 'POST', { gameId: 'other' })).status, 404);
  assert.equal((await h.call(`/api/game/player/marks?gameId=${game.id}&gameId=other`)).status, 404);
  assert.equal((await h.call('/api/%64j-widget')).status, 404);
  assert.equal(h.requests.length, 0, 'Blocked requests never reached BTTB');
});

test('existing player APIs remain available for the selected game only', async t => {
  const h = await setup(t);
  const allowed = [
    [`/api/game/join-options?code=${game.joinCode}`],
    [`/api/game/${game.id}/called-tracks`],
    [`/api/game/player/marks?gameId=${game.id}`],
    ['/api/game/player/marks', 'PUT', { gameId: game.id, marks: [{ cardId: 'mine', position: 0 }] }],
    ['/api/game/player/heartbeat', 'POST', { gameId: game.id, playerId: 'mine', connected: true }],
    [`/api/game/${game.id}/bingo?cardId=mine&playerId=mine`],
    [`/api/game/${game.id}/bingo`, 'POST', { cardId: 'mine', playerId: 'mine' }],
  ];
  for (const args of allowed) assert.equal((await h.call(...args)).status, 200, args[0]);
});

test('reject paid games, oversized requests, expired access, and join flooding', async t => {
  const h = await setup(t, { practice: false });
  const join = { joinCode: game.joinCode, playerName: 'Tester', cardQuantity: 1 };
  assert.equal((await h.call('/api/game/join', 'POST', join)).status, 409);
  assert.equal(h.requests.some(r => r.url === '/api/game/join'), false);
  assert.equal((await h.call('/api/game/join', 'POST', { ...join, cardQuantity: 11 })).status, 404);
  assert.equal((await h.call('/api/game/join', 'POST', { ...join, playerName: 'a'.repeat(66000) })).status, 413);
  for (let i = 0; i < 20; i++) await h.call('/access', 'POST', { invite: 'bad' });
  assert.equal((await h.call('/access', 'POST', { invite: h.invite })).status, 429);
  const expired = await setup(t, { expiresAt: Date.now() - 1 });
  assert.equal((await expired.call('/invite')).status, 410);
});

test('ten-player free events accept current join payload and force free entry', async t => {
 const h = await setup(t, { practice: false, entry: { mode: 'free', maxCardsPerPlayer: 1 } });
 assert.equal((await h.call('/api/game/join', 'POST', { joinCode: game.joinCode, playerName: 'Tester', cardQuantity: 1, expectedEntryMode: 'free' })).status, 200);
 assert.equal(h.requests.at(-1).body.expectedEntryMode, 'free');
 assert.equal((await h.call('/api/game/join', 'POST', { joinCode: game.joinCode, playerName: 'Tester', cardQuantity: 1, expectedEntryMode: 'paid' })).status, 404);
});

test('remote player ships the shared five-column card layout', async t => {
  const h = await setup(t);
  const response = await h.call('/player.css');
  assert.equal(response.status, 200);
  const css = await response.text();
  assert.match(css, /\.player-song-grid\s*\{[^}]*display:\s*grid/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.player-card-legend\s*\{/);
  assert.match(css, /\.player-song-artist\s*\{/);
  assert.match(css, /\.game-prize-display\s*\{/);
});


test('remote multi-card quantities and marks stay bounded', async t => {
 const h = await setup(t, {practice:false,entry:{mode:'free',maxCardsPerPlayer:10}});
 for (const cardQuantity of [1,4,6,7,8,9,10]) assert.equal((await h.call('/api/game/join','POST',{joinCode:game.joinCode,playerName:'Multi',cardQuantity})).status,200);
 for (const cardQuantity of [0,11,1.5,'10']) assert.equal((await h.call('/api/game/join','POST',{joinCode:game.joinCode,playerName:'Multi',cardQuantity})).status,404);
 assert.equal((await h.call('/api/game/player/marks','PUT',{gameId:game.id,marks:Array.from({length:250},(_,i)=>({cardId:`card-${Math.floor(i/25)}`,position:i%25}))})).status,200);
 assert.equal((await h.call('/api/game/player/marks','PUT',{gameId:game.id,marks:Array(251).fill({cardId:'x',position:0})})).status,404);
});
