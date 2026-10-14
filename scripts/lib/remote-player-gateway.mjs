import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const gateCookie = 'bttb-rehearsal-access';
const playerCookie = 'bttb-player-session';
const methodsWithBody = new Set(['POST', 'PUT']);
const headers = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
const safeEqual = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function cookie(request, name) {
  const matches = (request.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
function reply(response, status, data) {
  response.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}
async function readBody(request) {
  if (Number(request.headers['content-length']) > 65536) throw new Error('size');
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new Error('size');
    chunks.push(chunk);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString());
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('body');
  return result;
}
const onlyKeys = (object, allowed) => Object.keys(object).every(key => allowed.includes(key));

/** An exact allowlist: no generic reverse proxy, Next routes, or development assets. */
export function allowedPlayerRequest(method, url, body, game) {
  const p = url.pathname;
  const query = Object.fromEntries(url.searchParams);
  if ([...url.searchParams.keys()].length !== Object.keys(query).length) return false;
  if (p === '/api/game/join-options') return method === 'GET' && onlyKeys(query, ['code']) && query.code === game.joinCode;
  if (p === '/api/game/join') return method === 'POST' && !url.search &&
    onlyKeys(body, ['joinCode', 'playerName', 'cardQuantity', 'joinAsNewPlayer', 'expectedEntryMode']) &&
    body.joinCode === game.joinCode && Number.isInteger(body.cardQuantity) && body.cardQuantity >= 1 && body.cardQuantity <= 10 && (body.expectedEntryMode === undefined || body.expectedEntryMode === 'free') &&
    typeof body.playerName === 'string' && body.playerName.trim().length > 0 && body.playerName.length <= 50 &&
    (body.joinAsNewPlayer === undefined || typeof body.joinAsNewPlayer === 'boolean');
  if (p === '/api/game/player/heartbeat') return method === 'POST' && !url.search &&
    onlyKeys(body, ['gameId', 'playerId', 'connected']) && body.gameId === game.id;
  if (p === '/api/game/player/rehearsal') return method === 'GET'
    ? onlyKeys(query, ['gameId']) && query.gameId === game.id
    : method === 'POST' && !url.search && onlyKeys(body, ['gameId', 'taskId', 'response', 'note']) && body.gameId === game.id && typeof body.taskId === 'string' && ['done', 'problem'].includes(body.response) && typeof body.note === 'string' && body.note.length <= 500;
  if (p === '/api/game/player/marks') return method === 'GET'
    ? onlyKeys(query, ['gameId']) && query.gameId === game.id
    : method === 'PUT' && !url.search && onlyKeys(body, ['gameId', 'marks']) && body.gameId === game.id && Array.isArray(body.marks) && body.marks.length <= 250;
  if (p === `/api/game/${game.id}/called-tracks`) return method === 'GET' && !url.search;
  if (p === `/api/game/${game.id}/bingo`) return method === 'GET'
    ? onlyKeys(query, ['cardId', 'playerId']) && typeof query.cardId === 'string' && query.cardId.length > 0
    : method === 'POST' && !url.search && onlyKeys(body, ['cardId', 'playerId']) && typeof body.cardId === 'string' && body.cardId.length > 0;
  return false;
}

export function createPlayerGateway({ game, invite, assets, upstream = 'http://127.0.0.1:3010', getOrigin, expiresAt = Date.now() + 4 * 60 * 60 * 1000 }) {
  if (!/^[a-f0-9-]{36}$/.test(game.id) || !/^[A-Z0-9]{4,12}$/.test(game.joinCode) || !/^[a-f0-9]{64}$/.test(invite)) throw new Error('Invalid rehearsal configuration.');
  const origin = new URL(upstream);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('The BTTB upstream must be local.');
  const buckets = new Map();
  function limited(request, route) {
    const key = `${request.headers['cf-connecting-ip'] || request.socket.remoteAddress}:${route === '/access' || route === '/api/game/join' ? 'join' : 'read'}`;
    const minute = Math.floor(Date.now() / 60000);
    if (buckets.size > 10000) { for (const [key, value] of buckets) if (value.minute !== minute) buckets.delete(key); }
    if (buckets.size > 10000) return true;
    let bucket = buckets.get(key);
    if (!bucket || bucket.minute !== minute) { bucket = { minute, count: 0 }; buckets.set(key, bucket); }
    return ++bucket.count > (key.endsWith(':join') ? 20 : 600);
  }
  const server = http.createServer(async (request, response) => {
    try {
      const externalOrigin = getOrigin();
      if (!externalOrigin || request.headers.host !== new URL(externalOrigin).host) return reply(response, 403, { message: 'This rehearsal address is not active.' });
      if (Date.now() >= expiresAt) return reply(response, 410, { message: 'This rehearsal invitation has expired. Ask the host for a new link.' });
      // Reject encodings and traversal before URL normalization can hide them.
      const raw = request.url || '';
      if (!raw.startsWith('/') || raw.startsWith('//') || /[%\\#]|(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(raw.split('?')[0])) return reply(response, 404, { message: 'Not available.' });
      const url = new URL(raw, externalOrigin);
      const method = request.method;
      if (limited(request, url.pathname)) return reply(response, 429, { message: 'Too many requests. Please wait a minute.' });
      if (methodsWithBody.has(method) && (request.headers.origin !== externalOrigin || request.headers['sec-fetch-site'] === 'cross-site' || !String(request.headers['content-type']).toLowerCase().startsWith('application/json'))) return reply(response, 403, { message: 'Open your private invitation to continue.' });
      if (method === 'GET' && ['/invite', '/invite.js'].includes(url.pathname) && !url.search) {
        response.writeHead(200, { ...headers, 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
        return response.end(url.pathname.endsWith('.js') ?
          `const token=location.hash.slice(1);history.replaceState(null,'','/invite');if(token){fetch('/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:token})}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.message);location.replace(d.next)}).catch(e=>document.getElementById('message').textContent=e.message)}else{document.getElementById('message').textContent='Open the complete private invitation from your host.'}` :
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BTTB Private Rehearsal</title><body style="background:#080d19;color:white;font:18px system-ui;padding:32px;text-align:center"><h1>Bingo to the Beats</h1><p id="message">Opening your private rehearsal…</p><script src="/invite.js" defer></script></body></html>');
      }
      if (method === 'POST' && url.pathname === '/access' && !url.search) {
        const body = await readBody(request);
        if (!safeEqual(body.invite, invite)) return reply(response, 403, { message: 'This invitation is not valid. Ask your host for the complete link.' });
        response.setHeader('Set-Cookie', `${gateCookie}=${invite}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}${externalOrigin.startsWith('https:') ? '; Secure' : ''}`);
        return reply(response, 200, { next: `/join?code=${game.joinCode}` });
      }
      if (!safeEqual(cookie(request, gateCookie), invite)) return reply(response, 401, { message: 'Reopen the complete private invitation from your host.' });
      const pages = ['/join', '/game/cards', '/game/results'];
      const staticFiles = { '/player.js': ['player.js', 'text/javascript'], '/player.css': ['player.css', 'text/css'] };
      if (method === 'GET' && (pages.includes(url.pathname) || staticFiles[url.pathname])) {
        if (url.pathname === '/game/results' && url.searchParams.get('gameId') !== game.id) return reply(response, 404, { message: 'Game not available.' });
        const [file, contentType] = staticFiles[url.pathname] || ['index.html', 'text/html; charset=utf-8'];
        const content = await fs.readFile(path.join(assets, file));
        response.writeHead(200, { ...headers, 'Content-Type': contentType }); return response.end(content);
      }
      const body = methodsWithBody.has(method) ? await readBody(request) : {};
      if (!allowedPlayerRequest(method, url, body, game)) return reply(response, 404, { message: 'This action is not available in the private rehearsal.' });
      if (url.pathname === '/api/game/join') {
        const check = await fetch(`${origin.origin}/api/game/join-options?code=${game.joinCode}`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
        const options = check.ok ? await check.json() : null;
        if (!options || !(options.isPractice === true || (options.entry?.mode === 'free' && Number.isInteger(options.entry?.maxCardsPerPlayer) && options.entry.maxCardsPerPlayer >= 1 && options.entry.maxCardsPerPlayer <= 10))) return reply(response, 409, { message: 'This free rehearsal is not accepting players.' });
        body.expectedEntryMode = 'free';
      }
      const signedPlayer = cookie(request, playerCookie);
      const upstreamHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };
      // Never forward Clerk, authorization, proxy, RSC, server-action, or arbitrary cookies/headers.
      if (/^[A-Za-z0-9_.-]+$/.test(signedPlayer)) upstreamHeaders.Cookie = `${playerCookie}=${signedPlayer}`;
      const result = await fetch(`${origin.origin}${url.pathname}${url.search}`, { method, headers: upstreamHeaders,
        body: methodsWithBody.has(method) ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!result.headers.get('content-type')?.includes('application/json')) return reply(response, 502, { message: 'The game is temporarily unavailable. Please retry.' });
      const data = await result.json();
      const setCookie = result.headers.getSetCookie().find(v => v.startsWith(`${playerCookie}=`));
      if (setCookie) {
        const token = setCookie.split(';')[0].slice(playerCookie.length + 1);
        if (/^[A-Za-z0-9_.-]+$/.test(token)) response.setHeader('Set-Cookie', `${playerCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${externalOrigin.startsWith('https:') ? '; Secure' : ''}`);
      }
      reply(response, result.status, data);
    } catch (error) {
      if (!response.headersSent) reply(response, error.message === 'size' ? 413 : error instanceof SyntaxError || error.message === 'body' ? 400 : 502, { message: 'The request could not be completed. Please retry.' });
      else response.end();
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  server.on('upgrade', (_request, socket) => socket.destroy());
  return server;
}
