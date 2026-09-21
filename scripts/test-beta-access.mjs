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
const paths=['app/api/music/local/scan','app/api/music/local/folders','app/api/music/local/playlists','app/api/music/local/game','app/api/serato/drives','app/api/serato/library','app/api/serato/playlists','app/api/serato/crates','app/music/local/playlist','app/api/game/create/local','app/api/game/create','app/api/audio/artwork','app/api/audio/stream'];
const denied={status:403};
for(const path of paths){const route=load(`${path}/route.ts`,{'next/server':next,'@/lib/auth/local-library':{localLibraryAccessResponse:async()=>denied}});for(const method of ['GET','HEAD','POST'])if(route[method])assert.equal(await route[method]({}),denied,`${path} ${method} must deny before filesystem/database access`);}
let game={isPractice:true,status:'DRAFT'};
let reads=0;
const route=load('app/api/game/join-options/route.ts',{'next/server':next,'@/lib/prisma':{prisma:{game:{findUnique:async()=>{reads++;return game;}}}}});
const request=code=>({nextUrl:new URL(`http://localhost/api/game/join-options?code=${code}`)});
assert.equal((await route.GET(request('x'))).status,400);assert.equal(reads,0);
assert.equal((await route.GET(request('ABCD12'))).body.isPractice,true);
game={isPractice:false,status:'ACTIVE'};assert.equal((await route.GET(request('ABCD12'))).body.isPractice,false);
for(const status of ['COMPLETED','CANCELLED']){game.status=status;assert.equal((await route.GET(request('ABCD12'))).status,409);}
game=null;assert.equal((await route.GET(request('ABCD12'))).status,404);
console.log('PASS local library owner isolation, fail-closed setup, all disk routes deny before access, and practice/paid/ended join options');
