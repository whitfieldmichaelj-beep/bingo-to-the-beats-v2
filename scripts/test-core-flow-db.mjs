// Isolated real-database rehearsal. Auth and the music catalog are controlled fixtures;
// production creation, persistence, enrollment, status, song and Bingo code execute unchanged.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const host=`core-flow-${randomUUID()}`, prefix=`core-flow-${randomUUID()}`;
let requestHost=host;
const mocks={
 'server-only':{},
 '@clerk/nextjs/server':{auth:async()=>({isAuthenticated:Boolean(requestHost),userId:requestHost})},
 '@/lib/auth/local-library':{localLibraryAccessResponse:async()=>null},
 '@/lib/dj/bridge':{getDjAdapter:async()=>({loadPlaylist:async()=>({id:prefix,name:'Isolated core-flow rehearsal',trackCount:40,tracks:Array.from({length:40},(_,i)=>({id:`${prefix}-${i}`,title:`Rehearsal song ${i}`,artist:'Fixture artist',filePath:`/fixture/${prefix}/${i}.mp3`,fileName:`song-${i}.mp3`}))})})},
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
const {POST:status}=load('app/api/game/[gameId]/status/route.ts');
const {POST:call,GET:called}=load('app/api/game/[gameId]/called-tracks/route.ts');
const {PATCH:setPrize}=load('app/api/game/[gameId]/prize/route.ts');
const {joinPlayer}=load('lib/game/player-repository.ts');
const {findGameById}=load('lib/game/repository.ts');
const {submitBingoClaim,reviewBingoClaim}=load('lib/game/bingo-verification.ts');
const snapshot=async()=>{
 const game=await prisma.game.findUnique({where:{joinCode:'HE294R'},include:{tracks:{orderBy:{id:'asc'}},cards:{orderBy:{id:'asc'},include:{squares:{orderBy:{id:'asc'}}}},winners:{orderBy:{id:'asc'}}}});
 assert.equal(game?.status,'COMPLETED');return createHash('sha256').update(JSON.stringify(game)).digest('hex');
};
let gameId;const before=await snapshot();
const request=body=>({json:async()=>body});
let ctx;
const transition=async value=>{const r=await status(request({status:value}),ctx);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body};
try{
 const response=await create(request({provider:'virtualdj',playlistId:prefix,cardCount:5,bingoPattern:'four-corners',clipLength:30}));
 const created=await response.json();assert.equal(response.status,200,JSON.stringify(created));gameId=created.game.id;ctx={params:Promise.resolve({gameId})};
 let game=await findGameById(gameId);assert.equal(game.cards.length,50);assert.equal(game.tracks.length,40);assert.equal(game.bingoPattern,'four-corners');assert.equal(game.playbackConfig.source,'virtualdj');
 assert.equal(new Set(game.cards.map(c=>c.signature)).size,50);for(const c of game.cards)assert.equal(new Set(c.squares.map(s=>s.trackId)).size,25);
 console.log('PASS create through actual handler, persist settings, 40 songs and fifty unique 25-square cards');
 const playerId=randomUUID();const input={gameId,joinCode:game.joinCode,playerId,playerName:'Isolated rehearsal player',quantity:1};
 const joined=await joinPlayer(input);assert.ok(joined.assignment);assert.equal(joined.assignment.purchaseStatus,'PAID');const cardId=joined.cards[0].id;
 const rejoins=await Promise.all([joinPlayer(input),joinPlayer(input)]);for(const r of rejoins)assert.equal(r.assignment.purchaseId,joined.assignment.purchaseId);
 assert.equal(await prisma.purchase.count({where:{gameId}}),1);assert.equal(await prisma.gamePlayerSeat.count({where:{gameId}}),1);
 console.log('PASS allocation and concurrent reconnect retain one player, purchase and card');
 const originalConfig=JSON.parse(JSON.stringify(game.playbackConfig));
 const prize={kind:'tickets',description:'Two concert tickets for the Twitch giveaway'};
 requestHost=null;assert.equal((await setPrize(request({prize}),ctx)).status,401);
 requestHost='different-host';assert.equal((await setPrize(request({prize}),ctx)).status,404);
 requestHost=host;
 for(const invalid of [{kind:'unknown',description:'Anything'},{kind:'tickets',description:''},{kind:'cash',description:'x'.repeat(201)}]) assert.equal((await setPrize(request({prize:invalid}),ctx)).status,400);
 for(const kind of ['tickets','gift-card','merchandise','experience','cash','other','none']) {
   const response=await setPrize(request({prize:{kind,description:'Host-selected reward'}}),ctx);assert.equal(response.status,200,await response.text());
 }
 assert.equal((await setPrize(request({prize}),ctx)).status,200);
 const restoredPrize=await findGameById(gameId);assert.deepEqual(restoredPrize.playbackConfig.prize,prize);
 const {prize:ignoredPrize,...keptConfig}=restoredPrize.playbackConfig;assert.deepEqual(keptConfig,originalConfig);
 assert.deepEqual((await (await called({},ctx)).json()).prize,prize,'public caller/player polling receives the saved prize');
 const {GET:prizeJoinOptions}=load('app/api/game/join-options/route.ts');
 assert.deepEqual((await (await prizeJoinOptions({nextUrl:new URL(`http://localhost/api/game/join-options?code=${game.joinCode}`)})).json()).prize,prize,'prize is visible before joining');
 console.log('PASS host prize types, validation, ownership, non-cash persistence, unchanged playback settings, and public prize display data');
 const started=await transition('active');await transition('paused');await transition('active');game=await findGameById(gameId);assert.equal(game.status,'active');assert.equal(game.startedAt,started.game.startedAt);
 assert.equal((await setPrize(request({prize:{kind:'cash',description:'Changed prize'}}),ctx)).status,409,'started game cannot change the announced prize');
 console.log('PASS start/pause/resume persist and restore original start time');
 assert.equal((await submitBingoClaim(gameId,cardId,playerId)).ok,false);
 const card=game.cards.find(c=>c.id===cardId);const ids=[0,4,20,24].map(i=>card.squares[i].gameTrackId);
 const calls=await Promise.all([call(request({gameTrackIds:ids}),ctx),call(request({gameTrackIds:ids}),ctx)]);const saves=await Promise.all(calls.map(r=>r.json()));assert.equal(saves.reduce((n,r)=>n+r.updated,0),4);
 const state=await (await called({},ctx)).json();assert.equal(state.calledGameTrackIds.length,4);
 const claim=await submitBingoClaim(gameId,cardId,playerId);assert.equal(claim.ok,true);assert.equal(claim.claim.status,'pending');
 const reviewed=await reviewBingoClaim(gameId,claim.claim.id,host,'verify');assert.equal(reviewed.ok,true);assert.equal(reviewed.claim.status,'verified');
 const retry=await reviewBingoClaim(gameId,claim.claim.id,host,'verify');assert.equal(retry.claim.verifiedAt,reviewed.claim.verifiedAt);assert.equal((await reviewBingoClaim(gameId,claim.claim.id,host,'reject')).code,'CLAIM_LOCKED');
 const complete=await findGameById(gameId);assert.equal(complete.status,'completed');assert.equal(complete.calledTrackIds.length,4);
 assert.deepEqual(complete.playbackConfig.prize,prize,'history keeps the prize with the confirmed winner');
 assert.equal((await setPrize(request({prize}),ctx)).status,409,'completed prize is immutable');
 await transition('completed');assert.equal((await findGameById(gameId)).completedAt,complete.completedAt);
 assert.equal((await status(request({status:'active'}),ctx)).status,409);assert.equal((await call(request({gameTrackIds:[game.tracks.find(t=>!ids.includes(t.gameTrackId)).gameTrackId]}),ctx)).status,409);
 console.log('PASS duplicate song calls, ineligible claim rejection, valid claim, host verification, saved winner, completion and post-completion locks');

 // Automatic closing: real creation/restore/join/status/song code, isolated host only.
 const {expireGames,GAME_IDLE_LIMIT_MS}=load('lib/game/expiration.ts');
 const {createGame:persistGame}=load('lib/game/repository.ts');
 const {GET:restore}=load('app/api/game/restore/route.ts');
 const {GET:joinOptions}=load('app/api/game/join-options/route.ts');
 const makeGame=async()=>{const r=await create(request({provider:'virtualdj',playlistId:prefix,cardCount:5,bingoPattern:'four-corners',clipLength:30}));const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b.game;};
 const previous=await makeGame();
 const previousInput={gameId:previous.id,joinCode:previous.joinCode,playerId:randomUUID(),playerName:'Replacement fixture player',quantity:1};
 const previousJoin=await joinPlayer(previousInput);assert.ok(previousJoin.assignment);
 const paidBefore=await prisma.bingoCard.findUnique({where:{id:previousJoin.cards[0].id},include:{squares:{orderBy:{id:'asc'}}}});
 const pendingKey=randomUUID();
 const pending=await prisma.purchase.create({data:{id:randomUUID(),gameId:previous.id,playerKey:pendingKey,playerName:'Unpaid fixture',quantity:1,amount:5,status:'PENDING'}});
 const pendingCard=await prisma.bingoCard.findFirst({where:{gameId:previous.id,status:'AVAILABLE'}});
 await prisma.bingoCard.update({where:{id:pendingCard.id},data:{purchaseId:pending.id,playerKey:pendingKey,status:'ASSIGNED'}});
 const doomed={...await findGameById(previous.id),id:randomUUID(),joinCode:'FAIL'+randomUUID().slice(0,6).toUpperCase()};
 // Duplicate GameTrack IDs fail after the tentative cancellation, exercising rollback.
 await assert.rejects(()=>persistGame(doomed,host,{practice:true}));
 assert.equal((await prisma.game.findUnique({where:{id:previous.id}})).status,'READY');
 assert.equal((await prisma.hostBilling.findUnique({where:{clerkId:host}})).activeGameId,previous.id);
 assert.equal(await prisma.game.count({where:{id:doomed.id}}),0);
 console.log('PASS failed replacement creation rolls back old-game cancellation and billing selection');
 const replacement=await makeGame();
 assert.equal((await prisma.game.findUnique({where:{id:previous.id}})).status,'CANCELLED');
 assert.equal((await prisma.game.findUnique({where:{id:replacement.id}})).status,'READY');
 assert.equal((await prisma.game.findUnique({where:{id:gameId}})).status,'COMPLETED');
 assert.deepEqual(await prisma.bingoCard.findUnique({where:{id:previousJoin.cards[0].id},include:{squares:{orderBy:{id:'asc'}}}}),paidBefore);
 assert.equal((await prisma.purchase.findUnique({where:{id:pending.id}})).status,'CANCELLED');
 assert.equal((await prisma.bingoCard.findUnique({where:{id:pendingCard.id}})).status,'VOID');
 assert.equal(await prisma.gameSession.count({where:{gameId:previous.id,connected:true}}),0);
 const historyResponse=await restore({nextUrl:new URL(`http://localhost/api/game/restore?gameId=${previous.id}`)});
 assert.equal(historyResponse.status,200);
 const history=await historyResponse.json();assert.equal(history.readOnly,true);assert.equal(history.game.status,'completed');assert.equal(history.game.cards.length,50);
 assert.equal((await joinOptions({nextUrl:new URL(`http://localhost/api/game/join-options?code=${previous.joinCode}`)})).status,409);
 await assert.rejects(()=>joinPlayer(previousInput),/ended/);
 assert.equal((await status(request({status:'active'}),{params:Promise.resolve({gameId:previous.id})})).status,409);
 console.log('PASS replacement closes prior games, keeps read-only history, disconnects players, freezes unpaid cards, preserves paid cards and blocks reactivation/joining');
 const now=new Date(Date.now()+3600000);
 const cutoff=new Date(now.getTime()-GAME_IDLE_LIMIT_MS);
 await prisma.game.update({where:{id:replacement.id},data:{updatedAt:new Date(cutoff.getTime()+1)}});
 await expireGames({id:replacement.id},now);
 assert.equal((await prisma.game.findUnique({where:{id:replacement.id}})).status,'READY','one millisecond before deadline stays open');
 await expireGames({id:replacement.id},new Date(now.getTime()+1));
 const expired=await prisma.game.findUnique({where:{id:replacement.id}});
 assert.equal(expired.status,'CANCELLED','deadline is enforced inclusively');
 await expireGames({id:replacement.id},new Date(now.getTime()+10000));
 assert.equal((await prisma.game.findUnique({where:{id:replacement.id}})).completedAt.toISOString(),expired.completedAt.toISOString(),'expiry retry preserves the cancellation timestamp');
 const recent=await makeGame();
 await prisma.game.update({where:{id:recent.id},data:{updatedAt:new Date(cutoff.getTime()-3600000)}});
 await prisma.gameTrack.update({where:{id:recent.tracks[0].gameTrackId},data:{called:true,calledAt:now}});
 await expireGames({id:recent.id},now);
 assert.equal((await prisma.game.findUnique({where:{id:recent.id}})).status,'READY','recent legacy song calls count as host activity');
 console.log('PASS exact 24-hour boundary, stable cancellation timestamp, and recent-song activity protection');
 const concurrent=await Promise.all([makeGame(),makeGame()]);
 const active=await prisma.game.findMany({where:{id:{in:concurrent.map(g=>g.id)}}});
 assert.equal(active.filter(g=>g.status==='READY').length,1);
 assert.equal(active.filter(g=>g.status==='CANCELLED').length,1);
 console.log('PASS simultaneous replacement creation leaves exactly one open game for the host');

 // Entry price and prizes are independent. Exercise actual routes on new games only.
 const {PATCH:setEntry,GET:getEntry}=load('app/api/game/[gameId]/entry/route.ts');
 const {POST:enroll}=load('app/api/game/join/route.ts');
 const {POST:checkout}=load('app/api/checkout/route.ts');
 const {PUT:mark}=load('app/api/game/player/marks/route.ts');
 const {NextRequest}=require('next/server');
 const routeRequest=(path,body,cookie)=>new NextRequest(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const entryContext=id=>({params:Promise.resolve({gameId:id})});
 const fullGame=async()=>{
   const previous=process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED;
   try {
     process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED='false';
     const r=await create(request({provider:'virtualdj',playlistId:prefix,cardCount:25,bingoPattern:'four-corners',clipLength:30}));
     const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b.game;
   } finally {if(previous===undefined)delete process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED;else process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED=previous;}
 };
 const practiceGame=active.find(g=>g.status==='READY');
 assert.equal((await setEntry(request({entry:{mode:'paid',maxCardsPerPlayer:1}}),entryContext(practiceGame.id))).status,400);
 const freeGame=await fullGame();const freeCtx=entryContext(freeGame.id);
 assert.deepEqual((await (await getEntry({},freeCtx)).json()).entry,{mode:'paid',maxCardsPerPlayer:10},'legacy full-game terms stay paid');
 const freeEntry={mode:'free',maxCardsPerPlayer:2};
 requestHost=null;assert.equal((await setEntry(request({entry:freeEntry}),freeCtx)).status,401);
 requestHost='foreign-host';assert.equal((await getEntry({},freeCtx)).status,404);assert.equal((await setEntry(request({entry:freeEntry}),freeCtx)).status,404);
 requestHost=host;
 for(const entry of [null,{mode:'free',maxCardsPerPlayer:0},{mode:'free',maxCardsPerPlayer:11},{mode:'free',maxCardsPerPlayer:'2'},{mode:'unknown',maxCardsPerPlayer:2}]) assert.equal((await setEntry(request({entry}),freeCtx)).status,400);
 assert.equal((await setEntry(request({entry:freeEntry}),freeCtx)).status,200);
 assert.equal((await setPrize(request({prize}),freeCtx)).status,200);
 assert.deepEqual((await (await prizeJoinOptions({nextUrl:new URL(`http://localhost/api/game/join-options?code=${freeGame.joinCode}`)})).json()).entry,freeEntry);
 const joinBody={joinCode:freeGame.joinCode,playerName:'Free concert ticket player',cardQuantity:2,expectedEntryMode:'free'};
 assert.equal((await enroll(routeRequest('/api/game/join',{...joinBody,cardQuantity:3}))).status,400);
 assert.equal((await enroll(routeRequest('/api/game/join',{...joinBody,expectedEntryMode:'paid'}))).status,409,'stale payment choice cannot create an enrollment');
 assert.equal(await prisma.purchase.count({where:{gameId:freeGame.id}}),0);
 let responseFree=await enroll(routeRequest('/api/game/join',joinBody));const freePlayer=await responseFree.json();
 assert.equal(responseFree.status,200,JSON.stringify(freePlayer));assert.equal(freePlayer.player.purchaseStatus,'PAID');assert.equal(freePlayer.player.amountCents,0);assert.equal(freePlayer.cards.length,2);
 const freeCookie=responseFree.headers.get('set-cookie').split(';')[0];
 const freeCheckout=await checkout(routeRequest('/api/checkout',{purchaseId:freePlayer.player.purchaseId},freeCookie));
 assert.equal(freeCheckout.status,200);const freeCheckoutBody=await freeCheckout.json();assert.equal(freeCheckoutBody.paid,true);assert.equal(freeCheckoutBody.checkoutUrl,undefined);
 const freeReconnects=await Promise.all([1,2,10].map(cardQuantity=>enroll(routeRequest('/api/game/join',{...joinBody,cardQuantity},freeCookie))));
 for(const r of freeReconnects){const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));assert.equal(b.player.purchaseId,freePlayer.player.purchaseId);assert.equal(b.player.cardQuantity,2);assert.deepEqual(b.cards.map(c=>c.id),freePlayer.cards.map(c=>c.id));}
 assert.equal(await prisma.purchase.count({where:{gameId:freeGame.id}}),1);
 assert.equal((await setEntry(request({entry:{mode:'paid',maxCardsPerPlayer:10}}),freeCtx)).status,409);
 assert.equal((await (await getEntry({},freeCtx)).json()).locked,true);
 // Full free games do not inherit the five-player practice limit.
 for(let i=0;i<5;i++) {const r=await enroll(routeRequest('/api/game/join',{...joinBody,playerName:`Additional free player ${i}`,cardQuantity:1}));assert.equal(r.status,200,await r.text());}
 assert.equal(await prisma.purchase.count({where:{gameId:freeGame.id}}),6);
 assert.equal(await prisma.bingoCard.count({where:{gameId:freeGame.id,status:'ACTIVE'}}),7);
 console.log('PASS free non-practice event, six players, two-card cap, zero-charge checkout, direct API rejection and concurrent reconnect without extra cards');
 assert.equal((await status(request({status:'active'}),freeCtx)).status,200);
 const freeRestored=await findGameById(freeGame.id);const winningCard=freeRestored.cards.find(c=>c.id===freePlayer.cards[0].id);const corners=[0,4,20,24];
 assert.equal((await call(request({gameTrackIds:corners.map(i=>winningCard.squares[i].gameTrackId)}),freeCtx)).status,200);
 const marks=await mark(routeRequest('/api/game/player/marks',{gameId:freeGame.id,marks:corners.map(position=>({cardId:winningCard.id,position}))},freeCookie));
 const marked=await marks.json();assert.equal(marks.status,200,JSON.stringify(marked));assert.equal(marked.gameStatus,'COMPLETED');assert.equal(marked.winner.cardId,winningCard.id);
 const freeComplete=await findGameById(freeGame.id);assert.deepEqual(freeComplete.playbackConfig.entry,freeEntry);assert.deepEqual(freeComplete.playbackConfig.prize,prize);
 assert.equal((await setEntry(request({entry:freeEntry}),freeCtx)).status,409);
 console.log('PASS songs plus the matching card automatically confirm the free-game winner; prize, entry settings and results remain saved');
 const paidGame=await fullGame();const paidCtx=entryContext(paidGame.id);
 assert.equal((await setEntry(request({entry:{mode:'paid',maxCardsPerPlayer:2}}),paidCtx)).status,200);
 assert.equal((await setPrize(request({prize}),paidCtx)).status,200);
 const paidRequest={joinCode:paidGame.joinCode,playerName:'Paid non-cash prize player',cardQuantity:2,expectedEntryMode:'paid'};
 assert.equal((await enroll(routeRequest('/api/game/join',{...paidRequest,cardQuantity:3}))).status,400);
 const paidResponse=await enroll(routeRequest('/api/game/join',paidRequest));const paid=await paidResponse.json();
 assert.equal(paidResponse.status,200,JSON.stringify(paid));assert.equal(paid.player.amountCents,900);assert.equal(paid.player.purchaseStatus,'PENDING');assert.equal(paid.cards.length,0);
 assert.equal((await setEntry(request({entry:freeEntry}),paidCtx)).status,409,'even pending payment locks the entry terms');
 console.log('PASS non-cash prize can use paid entry, existing prices apply, payment gates cards, and reserved purchases cannot be repriced');
 const raceGame=await fullGame();const raceCtx=entryContext(raceGame.id);
 assert.equal((await setEntry(request({entry:freeEntry}),raceCtx)).status,200);
 const [raceSave,raceJoin]=await Promise.all([
   setEntry(request({entry:{mode:'paid',maxCardsPerPlayer:1}}),raceCtx),
   enroll(routeRequest('/api/game/join',{joinCode:raceGame.joinCode,playerName:'Entry race player',cardQuantity:1,expectedEntryMode:'free'}))
 ]);
 const races=[raceSave.status,raceJoin.status];assert.ok(races.includes(200)&&races.includes(409),JSON.stringify(races));
 const racePurchases=await prisma.purchase.findMany({where:{gameId:raceGame.id}});
 if(raceJoin.status===200){assert.equal(racePurchases.length,1);assert.equal(Number(racePurchases[0].amount),0);}else assert.equal(racePurchases.length,0);
 console.log('PASS entry-setting change racing enrollment cannot charge a player who selected free entry');

}finally{
 if(gameId)await prisma.game.delete({where:{id:gameId}});
 await prisma.hostBilling.deleteMany({where:{clerkId:host}});await prisma.user.deleteMany({where:{clerkId:host}});
 await prisma.track.deleteMany({where:{providerTrackId:{startsWith:prefix}}});
 assert.equal(await snapshot(),before,'HE294R must remain byte-for-byte unchanged');
 console.log('PASS HE294R unchanged; only this run’s temporary records removed');
 await prisma.$disconnect();if(globalThis.prismaPool)await globalThis.prismaPool.end();
}
