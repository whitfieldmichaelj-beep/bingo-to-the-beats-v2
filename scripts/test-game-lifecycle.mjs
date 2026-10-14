import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test } from 'node:test';
const compiled = ts.transpileModule(readFileSync('app/api/game/[gameId]/status/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(options={}) {
  let game={id:'test',status:'READY',startedAt:null,completedAt:null,...options.game};
  let locked=false, updates=0, cleanups=0;
  const tracks=[{called:false,calledAt:null}];
  const gameDelegate={
    findFirst:async()=>options.foreign?null:{...game},
    update:async({data})=>{assert.ok(locked);updates++;Object.assign(game,data);return {...game}},
  };
  const cleanup={updateMany:async()=>{assert.ok(locked);cleanups++;if(options.failCleanup)throw Error('failed');return {count:1}}};
  const prisma={game:gameDelegate,$transaction:async cb=>{
    if(options.beforeLock)options.beforeLock(game,tracks);
    const before={...game};
    try{return await cb({
      $queryRaw:async()=>{locked=true;return [{id:'test'}]},
      game:gameDelegate,purchase:cleanup,bingoCard:cleanup,gameSession:cleanup,
      gameTrack:{update:async()=>{throw Error('History must not be rewritten')},updateMany:async()=>{throw Error('History must not be rewritten')}},
    })}catch(e){game=before;throw e}finally{locked=false}
  }};
  class HostAccessError extends Error {status=403}
  const exports={};
  vm.runInNewContext(compiled,{exports,Date,console:{error(){}},require:id=>({
    '@clerk/nextjs/server':{auth:async()=>({isAuthenticated:!options.unauthenticated,userId:'host'})},
    'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status??200})}},
    '@/lib/game/expiration':{expireGameInTransaction:async()=>false},
    '@/lib/prisma':{prisma},
    '@/lib/billing/access':{HostAccessError,requireGameHostAccess:async()=>{if(options.denied)throw new HostAccessError('Denied')}},
  })[id]});
  return {post:status=>exports.POST({json:async()=>({status})},{params:Promise.resolve({gameId:'test'})}),game:()=>game,tracks,counts:()=>({updates,cleanups})};
}
test('start, pause, resume, end and retries preserve timestamps',async()=>{
 const h=harness();assert.equal((await h.post('active')).status,200);const start=h.game().startedAt;assert.ok(start);
 await h.post('paused');assert.equal(h.game().status,'PAUSED');await h.post('active');assert.equal(h.game().startedAt,start);
 await h.post('completed');const end=h.game().completedAt;assert.ok(end);assert.equal(h.counts().cleanups,3);
 await h.post('completed');assert.equal(h.game().completedAt,end);assert.equal(h.counts().cleanups,3);
 assert.equal((await h.post('active')).status,409);assert.equal((await h.post('paused')).status,409);
});
test('concurrent call saved before completion is preserved',async()=>{
 const h=harness({beforeLock:(_,tracks)=>{tracks[0]={called:true,calledAt:'saved-before-lock'}}});
 assert.equal((await h.post('completed')).status,200);assert.equal(h.tracks[0].calledAt,'saved-before-lock');assert.equal(h.tracks[0].called,true);
});
test('completion while waiting for lock cannot be reopened or retimestamped',async()=>{
 const end=new Date('2026-09-01');const h=harness({beforeLock:g=>{g.status='COMPLETED';g.completedAt=end}});
 assert.equal((await h.post('active')).status,409);await h.post('completed');assert.equal(h.game().completedAt,end);assert.equal(h.counts().updates,0);
});
test('cancelled and completed reference games are immutable',async()=>{
 for(const state of ['COMPLETED','CANCELLED']){const h=harness({game:{status:state}});for(const status of ['active','paused','completed'])await h.post(status);assert.equal(h.counts().updates,0);assert.equal(h.counts().cleanups,0)}
});
test('auth, ownership, malformed status and access failures cannot write',async()=>{
 for(const [options,expected] of [[{unauthenticated:true},401],[{foreign:true},404],[{denied:true},403]]){const h=harness(options);assert.equal((await h.post('active')).status,expected);assert.equal(h.counts().updates,0)}
 const h=harness();assert.equal((await h.post('unknown')).status,400);
});
test('host can end game even when access expires',async()=>{assert.equal((await harness({denied:true}).post('completed')).status,200)});
test('cleanup failure rolls back completion',async()=>{const h=harness({failCleanup:true});assert.equal((await h.post('completed')).status,500);assert.equal(h.game().status,'READY');assert.equal(h.game().completedAt,null)});

test('console waits for saved start/pause and stops on failed requests',async()=>{
 const source=ts.createSourceFile('DjConsole.tsx',readFileSync('app/dj-console/DjConsole.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let control;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='updateStatus')control=node;ts.forEachChild(node,visit)}visit(source);assert.ok(control);
 const code=ts.transpileModule(`${control.getText(source)}\nexports.updateStatus=updateStatus;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const events=[];let success=true,release;const exports={};
 vm.runInNewContext(code,{exports,session:{sessionId:'new-game',source:'local',status:'ready'},gameEndedRef:{current:false},
   setMessage:message=>events.push(message),
   fetch:async(_url,options)=>{events.push(JSON.parse(options.body).status);await new Promise(resolve=>{release=resolve});return {ok:success,json:async()=>({ok:success,message:'Database unavailable'})}},
   playback:{status:'ready',start:async()=>events.push('playback-start'),pause:()=>events.push('playback-pause')},
 });
 const starting=exports.updateStatus('playing');assert.deepEqual(events,['active']);release();await starting;assert.deepEqual(events,['active','playback-start']);
 success=false;events.length=0;const pausing=exports.updateStatus('paused');release();await pausing;assert.deepEqual(events,['paused','Database unavailable']);
 success=true;events.length=0;const paused=exports.updateStatus('paused');release();await paused;assert.deepEqual(events,['paused','playback-pause']);
});
