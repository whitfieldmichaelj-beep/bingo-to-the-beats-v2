import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(file,hook,args){
 const timers=new Map(),events=new Map(),requests=[],updates=[],effects=[];let id=0;
 const surface={setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id},clearTimeout:i=>timers.delete(i),setInterval:(f,ms)=>{timers.set(++id,{f,ms,repeat:true});return id},clearInterval:i=>timers.delete(i),addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
 const document={...surface,hidden:false},navigator={onLine:true},exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({useState:v=>[v,x=>updates.push(x)],useRef:v=>({current:v}),useCallback:f=>f,useEffect:f=>effects.push(f)}),window:surface,document,navigator,AbortController,DOMException,Error,fetch:(url,{signal})=>new Promise((resolve,reject)=>{requests.push({url,signal,resolve});signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))} )});
 const result=exports[hook](...args);const cleanup=effects[0]();
 return {result,cleanup,requests,updates,timers,events,document,navigator, tick(ms){for(const [id,t] of [...timers])if(t.ms===ms){if(!t.repeat)timers.delete(id);t.f()}},resolve(i){requests[i].resolve({ok:true,json:async()=>({ok:true,claims:[{id:'winner'}],players:[{playerId:'one'}]})})}};
}
for(const [file,hook,live,ended,pollMs] of [
 ['hooks/useBingoClaims.ts','useBingoClaims',['a',1500,true],['a',1500,false],1500],
 ['hooks/useGameRoster.ts','useGameRoster',['a',70,10000,true],['a',70,10000,false],10000],
]){
 const h=harness(file,hook,live);assert.equal(h.requests.length,1);
 h.events.get('focus')();h.events.get('online')();assert.equal(h.requests.length,1,'No overlapping requests');
 h.resolve(0);await settle();h.document.hidden=true;h.tick(pollMs);assert.equal(h.requests.length,1,'Hidden page stays quiet');
 h.document.hidden=false;h.events.get('visibilitychange')();assert.equal(h.requests.length,2,'Returning refreshes');
 h.cleanup();const before=h.updates.length;h.resolve(1);await settle();assert.equal(h.updates.length,before,'Unmount prevents stale updates');assert.equal(h.timers.size,0);
 const final=harness(file,hook,ended);final.resolve(0);await settle();assert.ok(final.updates.some(x=>Array.isArray(x)?x[0]?.id==='winner':x?.players?.length===1),'Final results loaded');
 final.events.get('focus')();final.tick(pollMs);assert.equal(final.requests.length,1,'Completed game stops polling');final.cleanup();
 const timeout=harness(file,hook,live);timeout.tick(10000);await settle();timeout.events.get('focus')();assert.equal(timeout.requests.length,2,'Timed-out request permits recovery');timeout.cleanup();await settle();
}
console.log('PASS console polling: no overlap, hidden-page pause, final results, cleanup, timeout recovery');
