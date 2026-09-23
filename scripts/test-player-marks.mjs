import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let authenticated = true, status = 'ACTIVE', payment = 'PAID', disputed = false, fail = false;
const squares = [{id:'one',cardId:'mine',position:0,trackId:'played',marked:false}, {id:'two',cardId:'mine',position:1,trackId:'unplayed',marked:false}, {id:'other',cardId:'theirs',position:0,trackId:'played',marked:true}];
let winner = null;
const patterns = {};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/game/bingo-verification.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:patterns,require:()=>({prisma:{}})});
const tx = {
 $queryRaw: async () => [{id:'game'}],
 game: {findUnique: async () => ({status,winningRule:'single-line'}), update: async ({data}) => {status=data.status}} ,
 purchase: {findUnique: async ({where}) => {assert.equal(where.gameId_playerKey.playerKey,'player');return {id:'purchase',status:payment,disputes:[]}}},
 bingoCard: {findMany: async ({where}) => {assert.equal(where.playerKey,'player');assert.equal(where.purchaseId,'purchase');assert.equal(where.status.not,'VOID');return [{id:'mine',cardNumber:1,playerName:'Mike',squares:squares.filter(s=>s.cardId==='mine')}]},update:async()=>{}},
 winner:{findFirst:async()=>winner,upsert:async({create})=>{assert.equal(create.verified,true);winner={card:{id:'mine',playerName:'Mike',cardNumber:1}}}},
 gameTrack: {findMany: async () => [{trackId:'played'}]},
 cardSquare: {
  updateMany: async ({where,data}) => {if(fail)throw Error('database unavailable');for(const s of squares) if(where.cardId.in.includes(s.cardId)&&s.marked===where.marked&&(where.id.in?where.id.in.includes(s.id):!where.id.notIn.includes(s.id)))Object.assign(s,data)},
  findMany: async ({where}) => squares.filter(s=>where.cardId.in.includes(s.cardId)&&s.marked).map(({cardId,position})=>({cardId,position})),
 },
};
const prisma={$transaction:async fn=>fn(tx)};
const api={};
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/game/player/marks/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:api,require:id=>id==='next/server'?{NextResponse:{json:(data,options)=>({data,status:options.status})}}:id.includes('player-session')?{readPlayerSession:async()=>authenticated?{playerId:'player'}:null}:id.includes('disputes')?{hasUnavailableDispute:()=>disputed}:id.includes('bingo-verification')?patterns:{prisma},
});
const request=marks=>({nextUrl:new URL('http://localhost/api/game/player/marks?gameId=game'),json:async()=>({gameId:'game',marks})});
const save=marks=>api.PUT(request(marks));
authenticated=false;assert.equal((await save([])).status,401);authenticated=true;
assert.equal((await save([{cardId:'theirs',position:0}])).status,400);
assert.equal((await save([{cardId:'mine',position:1}])).status,400);
assert.equal((await save([null])).status,400);
assert.equal((await save([{cardId:'mine',position:0}])).status,200);
assert.equal((await api.GET(request())).data.marks.length,1,'reload restores saved marks');
assert.equal(squares[2].marked,true,'another player is unchanged');
status='COMPLETED';assert.equal((await save([])).status,409);
assert.equal((await api.GET(request())).data.marks.length,1,'completed cards retain marks');
status='CANCELLED';assert.equal((await save([])).status,409);
status='ACTIVE';assert.equal((await save([])).status,200);assert.equal(squares[0].marked,false,'unmark persists');assert.equal(squares[0].markedAt,null);
payment='REFUNDED';assert.equal((await api.GET(request())).status,403);payment='PAID';
disputed=true;assert.equal((await save([])).status,403);disputed=false;
fail=true;assert.equal((await save([])).status,500);
console.log('PASS player marks: authentication, ownership, played-song restriction, restore, completed/cancelled locks, unmark, refunds, disputes, and database failure');

fail=false;
for(let position=1;position<5;position++) squares.push({id:`win-${position}`,cardId:'mine',position,trackId:'played',marked:false});
// Replace the unplayed square at position 1 with the playable fixture square.
squares.splice(squares.findIndex(s=>s.id==='two'),1);
const row=Array.from({length:5},(_,position)=>({cardId:'mine',position}));
assert.equal((await save(row.slice(0,4))).data.gameStatus,'ACTIVE','four squares cannot win');
const won=await save(row);
assert.equal(won.status,200);
assert.equal(won.data.gameStatus,'COMPLETED');
assert.equal(won.data.winner.playerName,'Mike');
assert.equal(won.data.marks.length,5);
assert.equal((await save([])).status,409,'winner marks locked');
assert.equal((await api.GET(request())).data.winner.playerName,'Mike','winner survives reload');
console.log('PASS automatic last-square win, server winner identity, completion, and final marks');
