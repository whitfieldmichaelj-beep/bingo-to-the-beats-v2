import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const filter={};vm.runInNewContext(ts.transpileModule(readFileSync("lib/serato/song-filter.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:filter});
for (const title of ["Song (Acapella)","Song (A Cappella)","Song_Instrumental", "Song (Intro Outro)"]) assert.equal(filter.excludedDjSong(title),true);
assert.equal(filter.excludedDjSong("Envy (Clean)"),false);
let saved, userId='host';let serial=0;
class HostAccessError extends Error {}
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/game/create/serato-import/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:id=>{
 const mocks={
 "@/lib/serato/song-filter":filter,
 '@clerk/nextjs/server':{auth:async()=>({userId})},'next/server':{NextResponse:{json:(data,options={})=>({data,status:options.status??200})}},'node:crypto':{randomUUID:()=>`id-${++serial}`},
 '@/lib/game/repository':{createGame:async(game,host,options)=>{saved={game,host,options};return {id:'saved-game'}}},
 '@/lib/game/service':{createGameFromPlaylist:(playlist,pattern,cardCount)=>({playlist,pattern,cardCount})},
 '@/lib/game/playback-config':{makePlaybackConfig:(source,clipLength)=>({source,clipLength})},
 '@/lib/billing/access':{HostAccessError},'@/lib/http/request-origin':{requestOrigin:()=> 'https://beta.test'}};
 if(!(id in mocks))throw Error(id);return mocks[id];}});
const tracks=Array.from({length:25},(_,i)=>({title:`Song ${i}`,artist:'Artist',filePath:'/private/file.mp3'}));
const req=(body,origin='https://beta.test')=>({text:async()=>JSON.stringify(body),headers:{get:()=>origin}});
assert.equal((await exports.POST(req({tracks,cardCount:5}))).status,200);
assert.equal(saved.host,'host');assert.equal(saved.options.practice,true);assert.equal(saved.game.playbackConfig.source,'serato');assert.equal(saved.game.playlist.tracks[0].filePath,'');
assert.equal((await exports.POST(req({tracks:tracks.slice(0,24),cardCount:5}))).status,400);
assert.equal((await exports.POST(req({tracks:Array(25).fill(tracks[0]),cardCount:5}))).status,400);
assert.equal((await exports.POST(req({tracks,cardCount:5000}))).status,400);
assert.equal((await exports.POST(req({tracks,cardCount:5},'https://untrusted.test'))).status,403);
assert.equal((await exports.POST(req({tracks:[...tracks,{title:'Envy (Instrumental)',artist:'Fat Joe'}],cardCount:5}))).status,200);assert.equal(saved.game.playlist.tracks.length,25);
assert.equal((await exports.POST(req({tracks:[...tracks.slice(0,24),{title:'Song (Acapella)',artist:'DJ'}],cardCount:5}))).status,400);
userId=null;assert.equal((await exports.POST(req({tracks,cardCount:5}))).status,401);
console.log('PASS DJ import: host ownership, Serato source, metadata-only tracks, minimum unique songs, capacity and origin/auth guards');
