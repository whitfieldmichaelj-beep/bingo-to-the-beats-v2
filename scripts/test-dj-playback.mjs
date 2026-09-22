import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let now=0;const states=[],timers=[];const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('hooks/usePlaybackEngine.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,require:id=>id==='react'?{useRef:v=>({current:v}),useState:v=>[v,x=>states.push(x)],useCallback:f=>f,useMemo:f=>f(),useEffect:()=>{}}:{spotifyPlayback:()=>{throw Error('Serato must not command Spotify')}},
 window:{setInterval:f=>{timers.push(f);return timers.length},clearInterval:()=>{},cancelAnimationFrame:()=>{}},Date:{now:()=>now},Math,Number,Error,console,
});
const tracks=[{id:'first',source:'serato',title:'First',artist:'DJ'},{id:'second',source:'serato',title:'Second',artist:'DJ'}];
const engine=exports.usePlaybackEngine(tracks,30,{continuous:false});
engine.goToTrack(1);await engine.start();assert.ok(states.includes('countdown'));assert.equal(timers.length,1);
now=31000;timers[0]();await Promise.resolve();assert.ok(states.includes('revealed'));assert.equal(timers.length,1,'Must wait for Serato instead of starting the next timer');
console.log('PASS DJ timer follows selected track, reveals at zero, and waits for the next Serato detection without another audio player');
const sync={};const selected=[];
vm.runInNewContext(ts.transpileModule(readFileSync('hooks/useCalledTrackSync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:sync,require:id=>id==='react'?{useRef:v=>({current:v}),useEffect:f=>f()}:{createCalledTrackQueue:()=>({enqueue:t=>selected.push(t.id),flush(){},dispose(){}})},window:{setInterval(){},clearInterval(){}},console});
sync.useCalledTrackSync('game',[{id:'first'},{id:'second'},{id:'third'}],2,true);
assert.deepEqual(selected,['third']);
sync.useCalledTrackSync('game',[{id:'first'},{id:'second'}],1,false);assert.equal(selected.length,1);
console.log('PASS out-of-order DJ songs do not call earlier or skipped songs; an unstarted selection calls nothing');
const queueModule={};const posts=[];let failure=true;let unmatched=false;
vm.runInNewContext(ts.transpileModule(readFileSync('lib/game/called-track-queue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:queueModule,AbortController,fetch:async(url,options)=>{posts.push({url,...JSON.parse(options.body)});return {ok:!failure,json:async()=>({ok:true,matched:unmatched?0:1})}},
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const queue=queueModule.createCalledTrackQueue('game-a');
queue.enqueue({id:'first'});await settle();
queue.enqueue({id:'third'});await settle();
failure=false;posts.length=0;await queue.flush();
assert.deepEqual(posts.map(p=>p.providerTrackIds[0]),['first','third'],'Failed earlier songs survive a song change');
posts.length=0;queue.enqueue({id:'first'});await queue.flush();assert.equal(posts.length,0,'Acknowledged songs are not reposted');
unmatched=true;queue.enqueue({id:'unknown'});await settle();posts.length=0;await queue.flush();assert.equal(posts.length,1,'Zero matches must not acknowledge a song');
queue.dispose();posts.length=0;queue.enqueue({id:'later'});await queue.flush();assert.equal(posts.length,0,'Unmounted game stops saving');
const other=queueModule.createCalledTrackQueue('game-b');unmatched=false;other.enqueue({id:'first'});await settle();assert.ok(posts[0].url.includes('game-b'));other.dispose();
console.log('PASS song-save retries, deduplication, unmatched responses and game isolation');
const origins={};vm.runInNewContext(ts.transpileModule(readFileSync('lib/http/player-join-origin.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:origins,URL});
for(const [browser,configured,expected] of [
 ['http://localhost:3001','http://192.168.1.239:3000','http://192.168.1.239:3001'],
 ['http://192.168.1.239:3001','http://192.168.1.239:3000','http://192.168.1.239:3001'],
 ['http://localhost:3001','https://bttb.example','https://bttb.example'],
 ['https://host.example','https://join.example','https://join.example'],
 ['http://localhost:3001','invalid','http://localhost:3001'],
 ['http://localhost:3001','javascript:alert(1)','http://localhost:3001'],
]) assert.equal(origins.playerJoinOrigin(browser,configured),expected);
console.log('PASS local join links follow the active port and public configured domains remain unchanged');
