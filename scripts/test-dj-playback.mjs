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

const records = new Map();
const storage = {
 get length() { return records.size; },
 key: i => [...records.keys()][i] ?? null,
 getItem: k => records.get(k) ?? null,
 setItem: (k,v) => records.set(k,v),
 removeItem: k => records.delete(k),
};
failure=true;posts.length=0;
const beforeReload=queueModule.createCalledTrackQueue('resume-game',storage);
beforeReload.enqueue({id:'song-a',gameTrackId:'db-a'});
beforeReload.enqueue({id:'song-b',gameTrackId:'db-b'});
assert.equal(records.size,2,'Songs persist synchronously before the first request completes');
await settle();beforeReload.dispose();assert.equal(records.size,2,'Unmount does not discard pending saves');
const differentGame=queueModule.createCalledTrackQueue('other-game',storage);
posts.length=0;await differentGame.flush();assert.equal(posts.length,0,'Stored songs cannot replay into another game');differentGame.dispose();
records.set('bttb:pending-called:v1:resume-game:corrupt','bad json');
const afterReload=queueModule.createCalledTrackQueue('resume-game',storage);
failure=false;posts.length=0;await afterReload.flush();
assert.deepEqual(posts.map(p=>p.gameTrackIds[0]),['db-a','db-b']);
assert.equal(records.size,1,'Only acknowledged records are removed');afterReload.dispose();
const acknowledged=queueModule.createCalledTrackQueue('resume-game',storage);
posts.length=0;await acknowledged.flush();assert.equal(posts.length,0,'Successful saves do not replay on another restart');acknowledged.dispose();
// Two tabs write separate records; neither can erase the other tab's pending song.
failure=true;records.clear();
const tabA=queueModule.createCalledTrackQueue('tabs',storage),tabB=queueModule.createCalledTrackQueue('tabs',storage);
tabA.enqueue({id:'a'});tabB.enqueue({id:'b'});await settle();
assert.equal(records.size,2);failure=false;await tabA.flush();assert.equal(records.size,1);
assert.equal(JSON.parse([...records.values()][0]).id,'b');tabA.dispose();tabB.dispose();
const blockedStorage={get length(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}};
const fallback=queueModule.createCalledTrackQueue('fallback',blockedStorage);
posts.length=0;fallback.enqueue({id:'safe'});await settle();assert.equal(posts[0].providerTrackIds[0],'safe');fallback.dispose();
console.log('PASS pending songs survive reload, isolate games/tabs, tolerate corrupt or unavailable storage, and clear after acknowledgment');

// Exercise the actual console handler with the real timer engine. No React
// selection effect is run: the first selected song must start on detection.
const consoleSource=readFileSync('app/dj-console/DjConsole.tsx','utf8');
const handlerStart=consoleSource.indexOf('  function applySeratoTrack(');
const handlerEnd=consoleSource.indexOf('\n  useEffect(',handlerStart);
const handlerCode=ts.transpileModule(consoleSource.slice(handlerStart,handlerEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const firstEngine=exports.usePlaybackEngine(tracks,30,{continuous:false});
let selectedIndex=0;
const selectedSession={sessionId:'same-track-test',tracks:[{id:'first',name:'First',artist:'DJ'},{id:'second',name:'Second',artist:'DJ'}],currentIndex:0,status:'ready',playedTrackIds:[],clipLength:30};
const pendingStart={current:false},previousDetection={current:null};
const handlerContext=vm.createContext({
 playback:firstEngine,session:selectedSession,provider:'serato',providerLabels:{name:'Serato'},autoDetect:true,
 isPlaying:false,isRevealed:false,gameEndedRef:{current:false},autoStartNextRef:pendingStart,previousTrackId:previousDetection,
 findSeratoTrackIndex:()=>selectedIndex,setDetectedTrack(){},addActivity(){},setMessage(){},saveSession(next){handlerContext.session=next},broadcast(){},getRecentPlayedTracks:()=>[],
});
vm.runInContext(handlerCode,handlerContext);
const beforeSameTrack=timers.length;
vm.runInContext("applySeratoTrack({id:'live-first',title:'First',artist:'DJ',displayText:'DJ - First'})",handlerContext);
assert.equal(timers.length,beforeSameTrack+1,'Already-selected ready song starts immediately');
assert.equal(pendingStart.current,false,'No second start remains queued in the selection effect');
vm.runInContext("applySeratoTrack({id:'live-first',title:'First',artist:'DJ',displayText:'DJ - First'})",handlerContext);
assert.equal(timers.length,beforeSameTrack+1,'Duplicate detection does not restart countdown');
selectedIndex=1;
vm.runInContext("applySeratoTrack({id:'live-second',title:'Second',artist:'DJ',displayText:'DJ - Second'})",handlerContext);
assert.equal(timers.length,beforeSameTrack+2,'A different detected song also starts immediately');
console.log('PASS actual console detection starts the selected first song and subsequent songs exactly once without waiting for a React selection effect');
