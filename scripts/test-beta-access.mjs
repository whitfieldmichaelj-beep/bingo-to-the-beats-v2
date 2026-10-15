import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,mocks) {const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>mocks[n]??{},process,console});return exports;}
const next={NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
let userId=null;
const access=load('lib/auth/local-library.ts',{'@clerk/nextjs/server':{auth:async()=>({userId})},'next/server':next});
const previous=process.env.BTTB_LOCAL_LIBRARY_OWNER_ID;
try {
process.env.BTTB_LOCAL_LIBRARY_OWNER_ID='owner';
assert.equal((await access.localLibraryAccessResponse()).status,401);
userId='other';assert.equal((await access.localLibraryAccessResponse()).status,403);
userId='owner';assert.equal(await access.localLibraryAccessResponse(),null);
delete process.env.BTTB_LOCAL_LIBRARY_OWNER_ID;assert.equal((await access.localLibraryAccessResponse()).status,503);
}finally{if(previous===undefined)delete process.env.BTTB_LOCAL_LIBRARY_OWNER_ID;else process.env.BTTB_LOCAL_LIBRARY_OWNER_ID=previous;}
const paths=['app/api/music/local/scan','app/api/music/local/folders','app/api/music/local/playlists','app/api/music/local/game','app/api/serato/drives','app/api/serato/library','app/api/serato/playlists','app/api/serato/crates','app/music/local/playlist','app/api/game/create/local','app/api/audio/artwork','app/api/audio/stream'];
const denied={status:403};
for(const path of paths){const route=load(`${path}/route.ts`,{'next/server':next,'@/lib/auth/local-library':{localLibraryAccessResponse:async()=>denied}});for(const method of ['GET','HEAD','POST'])if(route[method])assert.equal(await route[method]({}),denied,`${path} ${method} must deny before filesystem/database access`);}
let adapterCalls=0;
class HostAccessError extends Error {}
const createMocks=hosted=>({
  'next/server':next,
  '@/lib/game/card-layout':{parseCardSize:()=>5},
  '@/lib/dj/bridge':{getDjAdapter:async()=>{adapterCalls++;return{loadPlaylist:async()=>null};}},
  '@/lib/dj/providers':{isDjProvider:()=>true},
  '@/lib/serato/song-filter':{excludedDjSong:()=>false},
  '@/lib/auth/local-library':{localLibraryAccessResponse:async()=>denied},
  '@/lib/companion/library':{companionPlaylists:async()=>null},
  '@/lib/companion/hosted':{
    hostedCompanionRequired:()=>hosted,
    COMPANION_NOT_CONNECTED_MESSAGE:'Companion required',
  },
  '@/lib/billing/access':{HostAccessError},
  '@/lib/game/playback-config':{makePlaybackConfig:()=>({})},
  '@/lib/game/beta-limits':{BETA_GAME_CARD_LIMIT:100,betaCardLimitMessage:()=>"100-card beta limit"},
  '@clerk/nextjs/server':{auth:async()=>({isAuthenticated:true,userId:'other'})},
  '@/lib/game/repository':{createGame:async()=>{throw new Error('must not persist');}},
  '@/lib/game/service':{createGameFromPlaylist:()=>{throw new Error('must not create');},getUniquePlaylistTrackCount:()=>0},
  '@/lib/game/balance-validator':{evaluateGameBalance:()=>({status:'ok',recommendations:[]})},
});
const createRequest={json:async()=>({cardSize:5,playlistId:'crate',provider:'serato',cardCount:25})};
const localCreateRoute=load('app/api/game/create/route.ts',createMocks(false));
assert.equal(await localCreateRoute.POST(createRequest),denied,'local Serato creation keeps the protected local-library fallback when no Companion snapshot exists');
assert.equal(adapterCalls,0,'denied local fallback must not read the DJ filesystem');
const hostedCreateRoute=load('app/api/game/create/route.ts',createMocks(true));
const hostedMissing=await hostedCreateRoute.POST(createRequest);
assert.equal(hostedMissing.status,409,'hosted Serato must require a Companion instead of falling back to server disk');
assert.equal(hostedMissing.body.code,'BTTB_COMPANION_REQUIRED');
assert.equal(adapterCalls,0,'hosted Companion-required path must never read the server DJ filesystem');
let game={isPractice:true,status:'DRAFT'};
let reads=0;
const route=load('app/api/game/join-options/route.ts',{'next/server':next,'@/lib/game/entry':load('lib/game/entry.ts',{}),'@/lib/game/prize':load('lib/game/prize.ts',{}),'@/lib/game/expiration':{expireGames:async()=>{}},'@/lib/prisma':{prisma:{game:{findUnique:async()=>{reads++;return game;}}}}});
const request=code=>({nextUrl:new URL(`http://localhost/api/game/join-options?code=${code}`)});
assert.equal((await route.GET(request('x'))).status,400);assert.equal(reads,0);
assert.equal((await route.GET(request('ABCD12'))).body.isPractice,true);
game={isPractice:false,status:'ACTIVE'};assert.equal((await route.GET(request('ABCD12'))).body.isPractice,false);
for(const status of ['COMPLETED','CANCELLED']){game.status=status;assert.equal((await route.GET(request('ABCD12'))).status,409);}
game=null;assert.equal((await route.GET(request('ABCD12'))).status,404);
console.log('PASS local library owner isolation, fail-closed setup, all disk routes deny before access, and practice/paid/ended join options');
