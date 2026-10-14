import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const settle=()=>new Promise(r=>setImmediate(r));
function harness(){
 const timers=new Map(),events=new Map(),requests=[],updates=[];let errors=0,id=0;
 const surface={setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id},clearTimeout:i=>timers.delete(i),setInterval:(f,ms)=>{timers.set(++id,{f,ms,repeat:true});return id},clearInterval:i=>timers.delete(i),addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
 const document={...surface,hidden:false},exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync('lib/game/player-song-polling.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window:surface,document,AbortController,Error,fetch:(url,{signal})=>new Promise((resolve,reject)=>{requests.push({url,signal,resolve,reject});signal.addEventListener('abort',()=>reject(new Error('aborted')));})});
 const cleanup=exports.startPlayerSongPolling('game',d=>updates.push(d),()=>errors++);
 return{requests,updates,events,timers,document,cleanup,get errors(){return errors},tick(ms){for(const [i,t] of [...timers])if(t.ms===ms){if(!t.repeat)timers.delete(i);t.f()}},resolve(i,extra={}){requests[i].resolve({ok:true,json:async()=>({ok:true,calledTrackIds:['song'],calledGameTrackIds:['called-song'],gameStatus:'LIVE',...extra})})}};
}
const h=harness();assert.equal(h.requests.length,1);
h.tick(2000);h.tick(2000);h.events.get('focus')();assert.equal(h.requests.length,1,'slow requests never overlap');
h.resolve(0);await settle();assert.equal(h.updates[0].calledTrackIds[0],'song');
h.document.hidden=true;h.tick(2000);assert.equal(h.requests.length,1);
h.document.hidden=false;h.events.get('visibilitychange')();assert.equal(h.requests.length,2,'returning phone tab refreshes immediately');
h.requests[1].reject(new Error('offline'));await settle();assert.equal(h.errors,1);
h.events.get('online')();assert.equal(h.requests.length,3,'reconnect retries');
h.tick(10000);await settle();assert.equal(h.errors,2,'hung request times out');
h.tick(2000);assert.equal(h.requests.length,4,'timeout does not lock polling');
h.resolve(3,{gameStatus:'COMPLETED'});await settle();h.tick(2000);h.events.get('focus')();assert.equal(h.requests.length,4,'ended game stops polling');h.cleanup();assert.equal(h.timers.size,0);assert.equal(h.events.size,0);
const stale=harness();stale.cleanup();stale.resolve(0);await settle();assert.equal(stale.updates.length,0,'unmounted card never receives an old response');
console.log('PASS player polling: no overlap, phone-tab resume, reconnect, timeout recovery, final state, and stale-response cleanup.');
