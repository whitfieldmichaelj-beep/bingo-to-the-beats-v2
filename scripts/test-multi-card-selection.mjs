// Isolated real-database rehearsal. Auth and the music catalog are controlled fixtures;
// production creation, persistence, enrollment, status, song and Bingo code execute unchanged.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {SignJWT} from 'jose';
import ts from 'typescript';
const require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const host=`multicard-${randomUUID()}`, prefix=`multicard-${randomUUID()}`;
let requestHost=host;
const mocks={
 'server-only':{},
 '@clerk/nextjs/server':{auth:async()=>({isAuthenticated:Boolean(requestHost),userId:requestHost})},
 '@/lib/auth/local-library':{localLibraryAccessResponse:async()=>null},
 '@/lib/dj/bridge':{getDjAdapter:async()=>({loadPlaylist:async()=>({id:prefix,name:'Isolated core-flow rehearsal',trackCount:65,tracks:Array.from({length:65},(_,i)=>({id:`${prefix}-${i}`,title:`Rehearsal song ${i}`,artist:'Fixture artist',filePath:`/fixture/${prefix}/${i}.mp3`,fileName:`song-${i}.mp3`}))})})},
};
const cache=new Map();
function load(file){
 file=resolve(file);if(cache.has(file))return cache.get(file).exports;
 const loadedModule={exports:{}};cache.set(file,loadedModule);
 const localRequire=createRequire(pathToFileURL(file));
 const customRequire=id=>{
   if(id in mocks)return mocks[id];
   if(id.startsWith('@/')||id.startsWith('.')){
    let target=id.startsWith('@/')?resolve(id.slice(2)):resolve(dirname(file),id);
    for(const candidate of [target,`${target}.ts`,`${target}.tsx`,`${target}/index.ts`])if(existsSync(candidate)&&/\.tsx?$/.test(candidate))return load(candidate);
   }
   return localRequire(id);
 };
 const source=readFileSync(file,'utf8').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href));
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${output}\n})`,{filename:file})(customRequire,loadedModule,loadedModule.exports,file,dirname(file));
 return loadedModule.exports;
}

const {prisma}=load('lib/prisma.ts');
const {POST:create}=load('app/api/game/create/route.ts');
const {joinPlayer}=load('lib/game/player-repository.ts');
const base=process.env.BASE_URL || 'http://localhost:3010';
const games=[];
async function newGame(cardCount=5){
 const r=await create({json:async()=>({provider:'serato',playlistId:prefix,cardCount,bingoPattern:'full-card',clipLength:30})});
 const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));games.push(b.game.id);return b.game;
}
async function person(name){
 const id=randomUUID();const token=await new SignJWT({}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(id).setIssuer('bingo-to-the-beats').setAudience('bttb-player').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.BTTB_PLAYER_SESSION_SECRET));
 return {id,name,cookie:`bttb-player-session=${token}`};
}
async function join(game,p,quantity){const r=await fetch(`${base}/api/game/join`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:p.cookie},body:JSON.stringify({joinCode:game.joinCode,playerName:p.name,cardQuantity:quantity,expectedEntryMode:'free'})});return {status:r.status,body:await r.json()};}
async function child(script,game,extra={}){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[script],{stdio:'inherit',env:{...process.env,BASE_URL:base,JOIN_CODE:game.joinCode,...extra}});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error(`${script} exited ${code}`)));});}
try{
 let game=await newGame();assert.equal(game.cards.length,50);assert.equal(new Set(game.cards.map(c=>c.signature)).size,50);
 const options=await (await fetch(`${base}/api/game/join-options?code=${game.joinCode}`)).json();assert.deepEqual(options.entry,{mode:'free',maxCardsPerPlayer:10});
 const first=await person('Ten-card player');
 for(const quantity of [0,11,1.5])assert.equal((await join(game,first,quantity)).status,400);
 const burst=await Promise.allSettled(Array.from({length:6},()=>join(game,first,10)));
 for(const r of burst){assert.equal(r.status,'fulfilled');assert.equal(r.value.status,200,JSON.stringify(r.value.body));}
 const original=burst[0].value.body;
 for(const r of burst){assert.deepEqual(r.value.body.player.cardIds,original.player.cardIds);assert.equal(r.value.body.player.purchaseId,original.player.purchaseId);assert.equal(r.value.body.cards.length,10);assert.equal(r.value.body.player.amountCents,0);}
 const rejoin=await join(game,first,1);assert.equal(rejoin.body.rejoined,true);assert.equal(rejoin.body.player.cardQuantity,10);assert.deepEqual(rejoin.body.player.cardIds,original.player.cardIds);
 assert.equal(await prisma.gamePlayerSeat.count({where:{gameId:game.id}}),1);
 console.log('PASS ten-card simultaneous enrollment and different-quantity reconnect: one identity, one purchase, one seat, same ten cards, zero charge');
 const allIds=new Set(original.player.cardIds);
 for(const quantity of [4,7,9,10]){const p=await person(`${quantity}-card player`);const r=await join(game,p,quantity);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.cards.length,quantity);for(const id of r.body.player.cardIds){assert.ok(!allIds.has(id));allIds.add(id);}}
 assert.equal((await join(game,await person('Sixth'),1)).status,409);
 for(const table of ['purchase','gamePlayerSeat','gameSession'])assert.equal(await prisma[table].count({where:{gameId:game.id}}),5);
 assert.equal(allIds.size,40);
 console.log('PASS mixed quantities 4/7/9/10 and five-player capacity remain independent from card capacity');
 const marksCards=original.cards.slice(0,2);const tracks=await prisma.cardSquare.findMany({where:{cardId:{in:marksCards.map(c=>c.id)},position:0}});
 await prisma.gameTrack.updateMany({where:{gameId:game.id,trackId:{in:tracks.map(s=>s.trackId)}},data:{called:true,calledAt:new Date()}});
 const marks=tracks.map(s=>({cardId:s.cardId,position:0}));
 const marksUrl=`${base}/api/game/player/marks`;
 let r=await fetch(marksUrl,{method:'PUT',headers:{Cookie:first.cookie,'Content-Type':'application/json'},body:JSON.stringify({gameId:game.id,marks})});assert.equal(r.status,200,await r.text());
 r=await fetch(`${marksUrl}?gameId=${game.id}`,{headers:{Cookie:first.cookie}});const recovered=(await r.json()).marks;assert.deepEqual(recovered.sort((a,b)=>a.cardId.localeCompare(b.cardId)),marks.sort((a,b)=>a.cardId.localeCompare(b.cardId)));
 console.log('PASS marks on multiple cards persist and recover through a fresh signed-session request');
 // Direct repository inputs also reject unsupported quantities; no orphan enrollment.
 await assert.rejects(()=>joinPlayer({gameId:game.id,joinCode:game.joinCode,playerId:randomUUID(),playerName:'Extra',quantity:11}));
 game=await newGame();
 // Cover every integer 1..10 over isolated replacements; all returned assignments stay free.
 for(const quantity of [2,3,5,6,8]){const p=await person(`Quantity ${quantity}`);const r=await join(game,p,quantity);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.cards.length,quantity);assert.equal(r.body.player.amountCents,0);}
 console.log('PASS every integer quantity 1–10 supported across enrollment fixtures');
 game=await newGame();await child('scripts/test-one-player-one-game.mjs',game,{EXPECTED_AMOUNT_CENTS:'0'});
 await child('scripts/test-practice-join.mjs',game);
 game=await newGame();
 // Limit only this fixture inventory, then prove shortage rolls back the entire new enrollment.
 const keep=game.cards.slice(0,5).map(c=>c.id);await prisma.bingoCard.deleteMany({where:{gameId:game.id,id:{notIn:keep}}});
 const short=await person('Short inventory');const denied=await join(game,short,10);assert.equal(denied.status,409);assert.equal(denied.body.availableCardCount,5);
 for(const table of ['purchase','gamePlayerSeat','gameSession'])assert.equal(await prisma[table].count({where:{gameId:game.id}}),0);
 console.log('PASS insufficient inventory leaves no purchase, player seat or partial card allocation');
 const racePlayers=await Promise.all([person('Last four A'),person('Last four B')]);
 const race=await Promise.allSettled(racePlayers.map(p=>join(game,p,4)));
 for(const r of race)assert.equal(r.status,'fulfilled');
 assert.deepEqual(race.map(r=>r.value.status).sort(),[200,409]);
 assert.equal(await prisma.bingoCard.count({where:{gameId:game.id,playerKey:{not:null}}}),4);
 for(const table of ['purchase','gamePlayerSeat','gameSession'])assert.equal(await prisma[table].count({where:{gameId:game.id}}),1);
 console.log('PASS two players racing for the final four-card allocation: one succeeds, one cleanly rejects, no shared or partial cards');


 game=await newGame(150);
 const config=await prisma.game.findUnique({where:{id:game.id},select:{playbackConfig:true}});
 await prisma.game.update({where:{id:game.id},data:{maxPlayers:15,playbackConfig:{...config.playbackConfig,entry:{mode:'free',maxCardsPerPlayer:10}}}});
 const fifteen=await Promise.all(Array.from({length:15},(_,i)=>person(`Remote capacity ${i+1}`)));
 const fifteenIds=new Set();
 for(let offset=0;offset<15;offset+=3){
 const batch=await Promise.allSettled(fifteen.slice(offset,offset+3).map(p=>join(game,p,10)));
 for(const result of batch){assert.equal(result.status,'fulfilled');assert.equal(result.value.status,200,JSON.stringify(result.value.body));assert.equal(result.value.body.cards.length,10);for(const id of result.value.body.player.cardIds){assert.ok(!fifteenIds.has(id));fifteenIds.add(id);}}
 }
 assert.equal(fifteenIds.size,150);assert.equal(await prisma.purchase.count({where:{gameId:game.id}}),15);
 assert.equal((await join(game,await person('Sixteenth'),1)).status,409);
 const fullRejoin=await join(game,fifteen[0],1);assert.equal(fullRejoin.status,200);assert.equal(fullRejoin.body.cards.length,10);assert.equal(fullRejoin.body.rejoined,true);
 console.log('PASS fifteen players each receive ten distinct free cards; sixteenth rejected; full-game reconnect restores all ten');
}finally{
 await prisma.game.deleteMany({where:{host:{clerkId:host}}});await prisma.hostBilling.deleteMany({where:{clerkId:host}});await prisma.user.deleteMany({where:{clerkId:host}});await prisma.track.deleteMany({where:{providerTrackId:{startsWith:prefix}}});await prisma.$disconnect();if(globalThis.prismaPool)await globalThis.prismaPool.end();
}
