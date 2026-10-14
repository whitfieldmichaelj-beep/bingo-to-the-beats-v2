import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { fixtureWriter } from './lib/fixture-writer.mjs';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const base = process.env.BASE_URL || 'http://localhost:3010';
for (const url of [base, process.env.DATABASE_URL]) assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname), 'Local rehearsal only');
const secret = process.env.BTTB_PLAYER_SESSION_SECRET;
assert.ok(secret?.length >= 32);
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
const { query, insertRows } = fixtureWriter(pool);
const snapshot = async () => {
  const { rows } = await query(`SELECT row_to_json(g) AS game,
    (SELECT json_agg(t ORDER BY t.id) FROM "GameTrack" t WHERE t."gameId"=g.id) AS tracks,
    (SELECT json_agg(c ORDER BY c.id) FROM "BingoCard" c WHERE c."gameId"=g.id) AS cards,
    (SELECT json_agg(s ORDER BY s.id) FROM "CardSquare" s JOIN "BingoCard" c ON c.id=s."cardId" WHERE c."gameId"=g.id) AS squares,
    (SELECT json_agg(w ORDER BY w.id) FROM "Winner" w WHERE w."gameId"=g.id) AS winners
    FROM "Game" g WHERE g."joinCode"='HE294R'`);
  assert.equal(rows[0]?.game.status, 'COMPLETED');
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
const player = async number => {
  const id = `join-burst-${randomUUID()}`;
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(id)
    .setIssuer('bingo-to-the-beats').setAudience('bttb-player').setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(secret));
  return { id, name: `Burst player ${number}`, cookie: `bttb-player-session=${token}` };
};
let attempts = 0;
try {
  const before = await snapshot();
  const source = (await query('SELECT g.* FROM "Game" g WHERE (SELECT count(*) FROM "BingoCard" c WHERE c."gameId"=g.id)>=5 ORDER BY g."createdAt" LIMIT 1')).rows[0];
  assert.ok(source);
  const tracks = (await query('SELECT * FROM "GameTrack" WHERE "gameId"=$1', [source.id])).rows;
  const cards = (await query('SELECT * FROM "BingoCard" WHERE "gameId"=$1 ORDER BY "cardNumber" LIMIT 5', [source.id])).rows;
  const squares = (await query('SELECT * FROM "CardSquare" WHERE "cardId"=ANY($1::text[])', [cards.map(c=>c.id)])).rows;
  for (let round = 1; round <= 3; round++) {
    const gameId = randomUUID(), host = `join-burst-host-${randomUUID()}`, code = `J${randomUUID().replaceAll('-','').slice(0,9).toUpperCase()}`;
    const idMap = new Map(cards.map(c=>[c.id,randomUUID()]));
    const join = async p => {
      attempts++;
      const response = await fetch(`${base}/api/game/join`, { method:'POST', headers:{'Content-Type':'application/json',Cookie:p.cookie},
        body:JSON.stringify({joinCode:code,playerName:p.name,cardQuantity:1}), signal:AbortSignal.timeout(30000) });
      const body = await response.json();
      return {status:response.status,body};
    };
    const burst = async players => {
      // Settle every request before cleanup, even when an assertion will fail.
      const results = await Promise.allSettled(players.map(join));
      for (const result of results) assert.equal(result.status,'fulfilled',result.reason?.message);
      return results.map(r=>r.value);
    };
    try {
      await insertRows('User', [{id:host,clerkId:host,updatedAt:new Date()}]);
      await insertRows('Game', [{...source,createdAt:new Date(),updatedAt:new Date(),id:gameId,hostId:host,joinCode:code,title:'Isolated concurrent-join rehearsal',status:'READY',currentTrackId:null,startedAt:null,completedAt:null,isPractice:true,hostBillingRequired:true,requestedCardCount:5}]);
      await insertRows('HostBilling', [{clerkId:host,activeGameId:gameId,updatedAt:new Date()}]);
      await insertRows('GameTrack', tracks.map(t=>({...t,id:randomUUID(),gameId,called:false,calledAt:null,playedAt:null})));
      await insertRows('BingoCard', cards.map(c=>({...c,id:idMap.get(c.id),gameId,status:'AVAILABLE',playerName:null,playerKey:null,purchaseId:null})));
      await insertRows('CardSquare', squares.map(s=>({...s,id:randomUUID(),cardId:idMap.get(s.cardId),marked:false,markedAt:null})));
      const players = await Promise.all(Array.from({length:5},(_,i)=>player(i+1)));
      const first = await burst(Array(10).fill(players[0]));
      for (const r of first) assert.equal(r.status,200,JSON.stringify(r.body));
      const original = first[0].body.player;
      for (const r of first) {
        assert.equal(r.body.player.playerId,players[0].id);
        assert.equal(r.body.player.purchaseId,original.purchaseId);
        assert.deepEqual(r.body.player.cardIds,original.cardIds);
      }
      const others = await burst(players.slice(1));
      for (const r of others) assert.equal(r.status,200,JSON.stringify(r.body));
      const expected = new Map([first[0],...others].map(r=>[r.body.player.playerId,r.body.player]));
      const retries = await burst(Array.from({length:30},(_,i)=>players[i%players.length]));
      for (const r of retries) {
        assert.equal(r.status,200,JSON.stringify(r.body));
        const original = expected.get(r.body.player.playerId);
        assert.ok(original);
        assert.equal(r.body.player.purchaseId,original.purchaseId);
        assert.deepEqual(r.body.player.cardIds,original.cardIds);
      }
      const extra = await join(await player(6));assert.equal(extra.status,409,JSON.stringify(extra.body));
      for (const table of ['Purchase','GamePlayerSeat','GameSession']) {
        const {rows} = await query(`SELECT count(*)::int AS count FROM "${table}" WHERE "gameId"=$1`,[gameId]);
        assert.equal(rows[0].count,5,`${table} must contain exactly five players`);
      }
      const assigned = (await query('SELECT id,"playerKey","purchaseId" FROM "BingoCard" WHERE "gameId"=$1 AND "playerKey" IS NOT NULL',[gameId])).rows;
      assert.equal(assigned.length,5);assert.equal(new Set(assigned.map(c=>c.playerKey)).size,5);
      for(const c of assigned)assert.ok(expected.get(c.playerKey).cardIds.includes(c.id));
      console.log(`PASS round ${round}: simultaneous first join, distinct players, 30 parallel reconnects, full-game rejection; no duplicate players, purchases or cards`);
    } finally {
      await query('DELETE FROM "Game" WHERE id=$1',[gameId]);
      await query('DELETE FROM "HostBilling" WHERE "clerkId"=$1',[host]);
      await query('DELETE FROM "User" WHERE id=$1',[host]);
    }
  }
  assert.equal(await snapshot(),before,'HE294R must remain unchanged');
  console.log(`PASS ${attempts} HTTP join attempts across three isolated games; HE294R unchanged; test records removed`);
} finally { await pool.end(); }
