import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),'Local database required');
const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
const base=process.env.BASE_URL||'http://localhost:3001';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Local app required');
const gameId=randomUUID(),host=`practice-test-${randomUUID()}`,code=`P${randomUUID().replaceAll('-','').slice(0,9).toUpperCase()}`;
async function insert(table,row){const keys=Object.keys(row);await pool.query(`INSERT INTO "${table}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(k=>row[k]));}
try{
const source=(await pool.query('SELECT * FROM "Game" WHERE "joinCode"=$1',[process.env.JOIN_CODE||'NU3C9E'])).rows[0];assert.ok(source);
await insert('User',{id:host,clerkId:host,updatedAt:new Date()});
await insert('Game',{...source,id:gameId,hostId:host,joinCode:code,title:'Isolated free practice test',winningRule:'single-line',status:'READY',currentTrackId:null,startedAt:null,completedAt:null,isPractice:true,hostBillingRequired:true,requestedCardCount:5});
await insert('HostBilling',{clerkId:host,activeGameId:gameId,updatedAt:new Date()});
for(const track of (await pool.query('SELECT * FROM "GameTrack" WHERE "gameId"=$1',[source.id])).rows)await insert('GameTrack',{...track,id:randomUUID(),gameId});
const original=(await pool.query('SELECT * FROM "BingoCard" WHERE "gameId"=$1 LIMIT 1',[source.id])).rows[0];assert.ok(original);
const cardId=randomUUID();await insert('BingoCard',{...original,id:cardId,gameId,cardNumber:1,status:'AVAILABLE',playerName:null,playerKey:null,purchaseId:null});
for(const square of (await pool.query('SELECT * FROM "CardSquare" WHERE "cardId"=$1',[original.id])).rows)await insert('CardSquare',{...square,id:randomUUID(),cardId,marked:false,markedAt:null});
for(let number=2;number<=5;number++) {
 const additionalId=randomUUID();
 await insert('BingoCard',{...original,id:additionalId,gameId,cardNumber:number,status:'AVAILABLE',playerName:null,playerKey:null,purchaseId:null});
 for(const square of (await pool.query('SELECT * FROM "CardSquare" WHERE "cardId"=$1',[original.id])).rows) await insert('CardSquare',{...square,id:randomUUID(),cardId:additionalId,marked:false,markedAt:null});
}
let result=await fetch(`${base}/api/game/join-options?code=${code}`);assert.equal(result.status,200);assert.equal((await result.json()).isPractice,true);
const join=quantity=>fetch(`${base}/api/game/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({joinCode:code,playerName:'Practice tester',cardQuantity:quantity})});
result=await join(6);assert.equal(result.status,400,await result.text());
result=await join(1);const body=await result.json();assert.equal(result.status,200,JSON.stringify(body));assert.equal(body.player.purchaseStatus,'PAID');assert.equal(body.player.amountCents,0);assert.equal(body.cards.length,1);
const cookie=result.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
result=await fetch(`${base}/api/game/join`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({joinCode:code,playerName:'Practice tester',cardQuantity:1})});
const rejoined=await result.json();assert.equal(rejoined.rejoined,true);assert.equal(rejoined.player.purchaseId,body.player.purchaseId);
assert.equal(Number((await pool.query('SELECT count(*) FROM "GamePlayerSeat" WHERE "gameId"=$1',[gameId])).rows[0].count),1);
const otherPlayers=[];
for(let number=2;number<=5;number++) {
 const response=await join(1);const joined=await response.json();assert.equal(response.status,200,JSON.stringify(joined));
 otherPlayers.push({cookie:response.headers.get('set-cookie').split(';')[0],cardId:joined.cards[0].id});
}
assert.equal(Number((await pool.query('SELECT count(*) FROM "GamePlayerSeat" WHERE "gameId"=$1',[gameId])).rows[0].count),5);
assert.equal((await join(1)).status,409,'sixth player is blocked at practice capacity');
// Exercise persistence through the real signed player session and database.
const marksUrl = `${base}/api/game/player/marks`;
const readMarks = () => fetch(`${marksUrl}?gameId=${gameId}`, { headers: { Cookie: cookie } });
const writeMarks = marks => fetch(marksUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ gameId, marks }) });
assert.equal((await fetch(`${marksUrl}?gameId=${gameId}`)).status, 401);
await pool.query('UPDATE "GameTrack" SET called=false, "calledAt"=NULL WHERE "gameId"=$1', [gameId]);
const square = (await pool.query('SELECT * FROM "CardSquare" WHERE "cardId"=$1 ORDER BY position LIMIT 1', [cardId])).rows[0];
const selection = [{ cardId, position: square.position }];
assert.equal((await writeMarks(selection)).status, 400, 'uncalled songs cannot be marked');
assert.equal((await writeMarks([{ cardId: original.id, position: square.position }])).status, 400, 'cards outside this purchase cannot be edited');
await pool.query('UPDATE "GameTrack" SET called=true, "calledAt"=NOW() WHERE "gameId"=$1 AND "trackId"=$2', [gameId, square.trackId]);
result = await writeMarks(selection); assert.equal(result.status, 200, await result.text());
let stored = (await pool.query('SELECT marked, "markedAt" FROM "CardSquare" WHERE id=$1', [square.id])).rows[0];
assert.equal(stored.marked, true); assert.ok(stored.markedAt);
assert.deepEqual((await (await readMarks()).json()).marks, selection, 'fresh request restores saved marks');
result = await writeMarks([]); assert.equal(result.status, 200);
assert.deepEqual((await (await readMarks()).json()).marks, [], 'cleared marks remain cleared');
result = await writeMarks(selection); assert.equal(result.status, 200);
const row = (await pool.query('SELECT position, "trackId" FROM "CardSquare" WHERE "cardId"=$1 AND position < 5 ORDER BY position', [cardId])).rows;
await pool.query('UPDATE "GameTrack" SET called=true, "calledAt"=NOW() WHERE "gameId"=$1 AND "trackId"=ANY($2::text[])', [gameId, row.map(s=>s.trackId)]);
const winningMarks = row.map(s=>({cardId,position:s.position}));
result=await writeMarks(winningMarks.slice(0,4)); assert.equal(result.status,200); assert.notEqual((await result.json()).gameStatus,'COMPLETED');
result=await writeMarks(winningMarks); const won=await result.json(); assert.equal(result.status,200,JSON.stringify(won)); assert.equal(won.gameStatus,'COMPLETED'); assert.equal(won.winner.playerName,'Practice tester');
const publicState=await (await fetch(`${base}/api/game/${gameId}/called-tracks`)).json();
const presence=await fetch(`${base}/api/game/player/heartbeat`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({gameId,connected:true})});
assert.equal((await presence.json()).winner.cardId,cardId,'completion heartbeat includes the winner');
const resultPage=await fetch(`${base}/game/results?gameId=${gameId}`);assert.equal(resultPage.status,200);assert.match(await resultPage.text(),/Practice tester.*wins!/,'results remain accessible without a player cookie');
assert.equal(publicState.gameStatus,'COMPLETED'); assert.equal(publicState.winner.cardId,cardId,'other player screens receive the winner');
assert.equal((await pool.query('SELECT verified FROM "Winner" WHERE "cardId"=$1',[cardId])).rows[0].verified,true);
assert.equal((await writeMarks([])).status, 409, 'completed games reject changes');
assert.equal((await (await readMarks()).json()).marks.length,5,'completed cards retain winning selections');
for(const player of otherPlayers) {
 const response=await fetch(`${base}/api/game/player/heartbeat`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:player.cookie},body:JSON.stringify({gameId,connected:true})});
 const final=await response.json();assert.equal(final.gameStatus,'COMPLETED');assert.equal(final.winner.cardId,cardId);
 const saved=await (await fetch(`${marksUrl}?gameId=${gameId}`,{headers:{Cookie:player.cookie}})).json();assert.equal(saved.marks.length,0,'another player marks remain untouched');assert.equal(saved.winner.cardId,cardId);
}
console.log('PASS five independent player sessions: capacity, reconnect, winner reaches every player, isolated marks, no payment checkout');
console.log('PASS real automatic BINGO: last square, verified winner, completion, public announcement, saved final card');
console.log('PASS real player mark persistence: signed session, ownership, called-song eligibility, database save, restore, clear, and completion lock');
console.log('PASS real free-practice join: correct options, invalid quantity 400, one free active card, reconnect without a second purchase or player spot');
}finally{await pool.query('DELETE FROM "Game" WHERE id=$1',[gameId]);await pool.query('DELETE FROM "HostBilling" WHERE "clerkId"=$1',[host]);await pool.query('DELETE FROM "User" WHERE id=$1',[host]);await pool.end();}
