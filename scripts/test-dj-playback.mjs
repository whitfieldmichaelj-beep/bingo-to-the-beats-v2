import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let now=0;const states=[],timers=[];const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('hooks/usePlaybackEngine.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports,require:id=>id==='react'?{useRef:v=>({current:v}),useState:v=>[v,x=>states.push(x)],useCallback:f=>f,useMemo:f=>f(),useEffect:()=>{}}:{spotifyPlayback:()=>{throw Error('Serato must not command Spotify')}},
 window:{setInterval:f=>{timers.push(f);return timers.length},clearInterval:()=>{},cancelAnimationFrame:()=>{}},Date:{now:()=>now},Math,Number,Error,console,
});
const tracks=[{id:'first',source:'serato',title:'First',artist:'DJ'},{id:'second',source:'serato',title:'Second',artist:'DJ'}];
const engine=exports.usePlaybackEngine(tracks,30,{continuous:false});
engine.goToTrack(1);await engine.start();assert.ok(states.includes('countdown'));assert.equal(timers.length,1);
now=31000;timers[0]();await Promise.resolve();assert.ok(states.includes('revealed'));assert.equal(timers.length,1,'Must wait for Serato instead of starting the next timer');
console.log('PASS DJ timer follows selected track, reveals at zero, and waits for the next Serato detection without another audio player');
const sync={};const posts=[];
vm.runInNewContext(ts.transpileModule(readFileSync('hooks/useCalledTrackSync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:sync,require:()=>({useRef:v=>({current:v}),useEffect:f=>f()}),fetch:async(url,options)=>{posts.push(JSON.parse(options.body));return {ok:true}},console});
sync.useCalledTrackSync('game',[{id:'first'},{id:'second'},{id:'third'}],2,true);
assert.deepEqual(posts[0].providerTrackIds,['third']);
sync.useCalledTrackSync('game',[{id:'first'},{id:'second'}],1,false);assert.equal(posts.length,1);
console.log('PASS out-of-order DJ songs do not call earlier or skipped songs; an unstarted selection calls nothing');
