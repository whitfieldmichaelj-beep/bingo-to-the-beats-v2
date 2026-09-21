import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(){
 const calls=[], states=[], intervals=[]; let resolve,reject;
 const pending=new Promise((yes,no)=>{resolve=yes;reject=no});
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync('hooks/usePlaybackEngine.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports,require:(id)=> id==='react'?{useRef:v=>({current:v}),useState:v=>[v,x=>states.push(x)],useCallback:f=>f,useMemo:f=>f(),useEffect:()=>{}}:{spotifyPlayback:(...args)=>{calls.push(args);return args[0]==='pause'?Promise.resolve():pending}},
 window:{setInterval:f=>{intervals.push(f);return intervals.length},clearInterval:()=>{},cancelAnimationFrame:()=>{}},Date,Math,Number,Error,console,
 });
 const engine=exports.usePlaybackEngine([{id:'1234567890123456789012',source:'spotify',title:'Test',artist:'Test'}],30,{continuous:false});
 return {engine,calls,states,intervals,resolve,reject};
}
let h=harness();let started=h.engine.start();assert.equal(h.intervals.length,0);assert.equal(h.calls[0][2],60000);h.resolve();await started;assert.equal(h.intervals.length,1);assert.ok(h.states.includes('playing'));h.engine.pause();assert.equal(h.calls.at(-1)[0],'pause');
h=harness();started=h.engine.start();h.reject(new Error('No active device'));await started;assert.equal(h.intervals.length,0);assert.ok(h.states.includes('No active device'));assert.ok(h.states.includes('paused'));
h=harness();started=h.engine.start();h.engine.pause();h.resolve();await started;assert.equal(h.intervals.length,0);
h=harness();await h.engine.restoreCheckpoint({secondsRemaining:12});started=h.engine.resume();assert.equal(h.calls[0][2],78000);h.resolve();await started;
console.log('PASS Spotify waits for acceptance, reports failure, cancels pending start on pause, and resumes at the saved position');
const route={};let upstreamStatus=204, sent, signedIn=true;
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/spotify/player/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports:route,AbortSignal,console,require:id=>id==='@clerk/nextjs/server'?{auth:async()=>({userId:signedIn?'host':null})}:id==='@/lib/http/request-origin'?{requestOrigin:()=> 'http://127.0.0.1:3000'}:id==='next/server'?{NextResponse:{json:(data,options={})=>({data,status:options.status??200})}}:{getValidSpotifyAccessToken:async()=>({accessToken:'test-only'}),setSpotifyTokenCookies:()=>{}},fetch:async(url,options)=>{sent={url,options};return {ok:upstreamStatus===204,status:upstreamStatus}}
});
const request=(body,origin='http://127.0.0.1:3000')=>({headers:{get:()=>origin},json:async()=>({deviceId:"test-device",...body})});
assert.equal((await route.POST(request({action:'play',trackId:'1234567890123456789012'}))).status,200);
assert.equal(sent.options.method,'PUT');assert.equal(JSON.parse(sent.options.body).uris[0],'spotify:track:1234567890123456789012');
upstreamStatus=404;assert.match((await route.POST(request({action:'pause'}))).data.error,/selected Spotify device/);
upstreamStatus=403;assert.match((await route.POST(request({action:'resume'}))).data.error,/Premium/);
assert.equal((await route.POST(request({action:'play',trackId:'bad'}))).status,400);
assert.equal((await route.POST(request({action:'pause'},'https://another-site.test'))).status,403);
signedIn=false;assert.equal((await route.POST(request({action:'pause'}))).status,401);
console.log('PASS Spotify server command, device and permission errors, track validation, sign-in and origin guards');

assert.match(sent.url, /device_id=test-device/);
signedIn=true;assert.equal((await route.POST(request({action:'play',trackId:'1234567890123456789012',deviceId:null}))).status,400);
console.log('PASS playback targets the selected device and rejects requests without a destination');
const client={};let requests=[];
vm.runInNewContext(ts.transpileModule(readFileSync('lib/music/spotify/playback-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:client,AbortSignal,Error,fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})}}});
await assert.rejects(client.spotifyPlayback('play','1234567890123456789012'),/Choose this computer/);
await client.spotifyPlayback('pause');assert.equal(requests.length,0);
client.selectSpotifyDevice('computer-A');const pending=client.spotifyPlayback('play','1234567890123456789012');client.selectSpotifyDevice('computer-B');await pending;assert.equal(requests[0].deviceId,'computer-A');
await client.spotifyPlayback('pause');assert.equal(requests[1].deviceId,'computer-B');
console.log('PASS client requires explicit selection and captures destination before queuing commands');
