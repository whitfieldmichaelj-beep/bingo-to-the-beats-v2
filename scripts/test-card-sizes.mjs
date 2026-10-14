import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const cache = new Map();
const mocks = {};
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('./') || id.startsWith('../')) return load(resolve(dirname(file), id + '.ts'));
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
    return require(id);
  }, console, Date, URL, Set, Map, Buffer });
  return exports;
}
const { patternGroups, parseCardSize } = load('lib/game/card-layout.ts');
const { createGameFromPlaylist } = load('lib/game/service.ts');
const { evaluateGameBalance } = load('lib/game/balance-validator.ts');
const clean = value => JSON.parse(JSON.stringify(value));
const playlist = count => ({ id: 'fixture', name: 'Size test', tracks: Array.from({length: count}, (_,i) => ({ id: `t${i}`, title: `Song ${i}`, artist: 'Test', filePath: `/fixture/${i}`, fileName: `${i}.mp3` })) });
assert.equal(parseCardSize(undefined),5);
for (const value of [null,0,4,6,'3',NaN,{},[]]) assert.throws(()=>parseCardSize(value),/3×3 or 5×5/);
for (const size of [3,5]) {
 const count=size*size;
 const game=createGameFromPlaylist(playlist(count+15),'any-line',20,size);
 assert.equal(game.songsPerCard,count);
 assert.equal(game.cardCapacity.songsPerCard,count);
 assert.equal(game.cards.length,20);
 assert.equal(new Set(game.cards.map(c=>c.signature)).size,20);
 for(const card of game.cards) {
  assert.equal(card.rows,size);assert.equal(card.columns,size);assert.equal(card.squareCount,count);
  assert.equal(card.squares.length,count);assert.equal(new Set(card.squares.map(s=>s.trackId)).size,count);
  card.squares.forEach((square,i)=>{assert.equal(square.row,Math.floor(i/size));assert.equal(square.column,i%size);assert.equal(square.squareIndex,i);});
 }
 assert.throws(()=>createGameFromPlaylist(playlist(count-1),'any-line',1,size),/At least/);
 const minimum=createGameFromPlaylist(playlist(count),'any-line',1,size);
 assert.equal(minimum.cardCapacity.uniqueSongSelections,'1');
 assert.equal(patternGroups('any-line',size).length,2*size+2);
 assert.equal(patternGroups('across',size).length,size);
 assert.equal(patternGroups('down',size).length,size);
 assert.equal(patternGroups('diagonal',size).length,2);
 assert.deepEqual(clean(patternGroups('four-corners',size)),[[0,size-1,size*(size-1),count-1]]);
 assert.equal(patternGroups('x-pattern',size)[0].length,size*2-1);
 assert.equal(patternGroups('blackout',size)[0].length,count);
 for(const pattern of ['single-line','any-line','across','down','diagonal','four-corners','x-pattern','blackout','full-card']) {
  for(const group of patternGroups(pattern,size)) {
   assert.equal(new Set(group).size,group.length);
   assert.ok(group.every(i=>i>=0&&i<count));
  }
  const balance=evaluateGameBalance({rows:size,columns:size,uniqueSongCount:count+15,requestedCardCount:1,bingoPattern:pattern});
  assert.equal(balance.songsPerCard,count);
  assert.equal(balance.winningPathsPerCard,patternGroups(pattern,size).length);
  assert.equal(balance.minimumMarksToWin,patternGroups(pattern,size)[0].length);
  assert.notEqual(balance.status,'blocked');
 }
 assert.equal(evaluateGameBalance({rows:size,columns:size,uniqueSongCount:count-1,requestedCardCount:1,bingoPattern:'any-line'}).status,'blocked');
}
assert.equal(createGameFromPlaylist(playlist(25)).cards[0].rows,5,'old clients retain 5×5 default');
assert.deepEqual(clean(patternGroups('diagonal',3)),[[0,4,8],[2,4,6]]);
assert.deepEqual(clean(patternGroups('x-pattern',3)),[[0,4,8,2,6]]);
assert.equal(patternGroups('any-line',4).length,0,'invalid dimensions cannot win');

// Exercise authoritative verification with called tracks and stored card dimensions.
let storedCard, called=[];
mocks['@/lib/prisma']={prisma:{bingoCard:{findFirst:async()=>storedCard},gameTrack:{findMany:async()=>called.map(trackId=>({trackId}))}}};
mocks['./expiration']={};
const { verifyCard }=load('lib/game/bingo-verification.ts');
for(const size of [3,5]) {
 storedCard={rows:size,columns:size,game:{winningRule:'any-line'},squares:Array.from({length:size*size},(_,position)=>({position,trackId:`t${position}`,track:{title:'Test',artist:'Fixture'}}))};
 called=Array.from({length:size-1},(_,i)=>`t${i}`);assert.equal((await verifyCard('game','card')).eligible,false);
 called.push(`t${size-1}`);assert.equal((await verifyCard('game','card')).eligible,true);
 storedCard.game.winningRule='blackout';assert.equal((await verifyCard('game','card')).eligible,false);
 called=storedCard.squares.map(s=>s.trackId);assert.equal((await verifyCard('game','card')).eligible,true);
}
console.log('PASS 3×3 and 5×5 generation, defaults, input validation, every winning pattern, balance advice, and server verification.');

// Exercise creation endpoints without touching a real host or database.
let savedGames=[];
mocks['@clerk/nextjs/server']={auth:async()=>({userId:'fixture-host',isAuthenticated:true})};
mocks['@/lib/game/repository']={createGame:async game=>{savedGames.push(game);return game;}};
mocks['@/lib/billing/access']={HostAccessError:class extends Error {}};
mocks['next/server']={NextResponse:{json:(data,options={})=>({data,status:options.status??200})}};
mocks['@/lib/http/request-origin']={requestOrigin:()=> 'http://fixture.local'};
const streaming=load('app/api/game/create-streaming/route.ts');
const imported=load('app/api/game/create/serato-import/route.ts');
const request=body=>({json:async()=>body,text:async()=>JSON.stringify(body),headers:{get:()=> 'http://fixture.local'}});
for(const size of [3,5]) {
 const tracks=playlist(size*size).tracks.map(t=>({...t,name:t.title}));
 const response=await streaming.POST(request({source:'apple',playlistId:'fixture',cardCount:2,cardSize:size,tracks}));
 assert.equal(response.status,200);assert.equal(response.data.game.cards[0].squareCount,size*size);
 const importedResponse=await imported.POST(request({cardCount:5,cardSize:size,tracks}));
 assert.equal(importedResponse.status,200);assert.equal(savedGames.at(-1).cards[0].squareCount,size*size);
 const shortage=await streaming.POST(request({source:'apple',playlistId:'fixture',cardCount:2,cardSize:size,tracks:tracks.slice(1)}));
 assert.equal(shortage.status,400);
}
const beforeInvalid=savedGames.length;
for(const cardSize of [4,'3',null]) {
 assert.equal((await streaming.POST(request({cardSize}))).status,400);
 assert.equal((await imported.POST(request({cardSize,tracks:[]}))).status,400);
}
assert.equal(savedGames.length,beforeInvalid,'invalid card sizes never persist');
const legacy=await streaming.POST(request({source:'spotify',playlistId:'fixture',cardCount:1,tracks:playlist(25).tracks.map(t=>({...t,name:t.title}))}));
assert.equal(legacy.data.game.cards[0].rows,5);
console.log('PASS streaming and DJ import endpoints: both sizes, minimum song counts, invalid-size rejection, and legacy default.');
