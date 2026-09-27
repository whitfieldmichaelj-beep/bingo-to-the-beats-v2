import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
function load(file,mocks={}) {
 const exports={};
 const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(compiled.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 vm.runInNewContext(compiled.outputText,{exports,require:id=>mocks[id]??require(id),Symbol,Error});
 return exports;
}
const cleanup=load('lib/database/local-statement-cleanup.ts');
const name=i=>`bttb_test_${i.toString(36)}_1234567890abcdef`;
const sql='SELECT $1::int AS number';
function harness({queryFailure=false,closeFailure=false,duplicateCallback=false}={}) {
 const pool=new EventEmitter(),events=[],prepared=new Set();let skip=false;
 const wire={parsedStatements:{},stream:{cork(){},uncork(){}},
  parse({name,text}){events.push(['parse',name]);prepared.add(name);wire.parsedStatements[name]=text},
  bind(request){events.push(['bind',request.portal,request.statement])},
  describe(){events.push(['describe'])},
  execute(){events.push(['execute']);if(queryFailure)skip=true},
  close({type,name}){if(closeFailure)throw new Error('close failed');events.push([skip?'close-skipped':'close',type,name]);if(!skip)prepared.delete(name)},
  sync(){events.push(['sync']);skip=false}
 };
 let ended=0;
 const client={connection:wire,end:async()=>{ended++},query(config,values,callback){
  if(config instanceof pg.Query){
   if(!config.text){assert.equal(config.query_timeout,5000);config.submit(wire);setImmediate(()=>config.handleReadyForQuery(wire));return config;}
   events.push(['query',config.text,config.name,values,config.values]);config.submit(wire);
   const result={rows:config._rowMode==='array'?[[7]]:[{number:7}],fields:[{name:'number'}],rowCount:1};
   const error=queryFailure?Object.assign(new Error('division by zero'),{code:'22012'}):null;
   setImmediate(()=>{if(typeof config.callback==='function'){config.callback(error,result);if(duplicateCallback)config.callback(error,result)}else config.handleReadyForQuery(wire)});
   return config;
  }
  const selected=typeof values==='function'?values:callback??config?.callback;
  const request=typeof config==='string'?{text:config}:config;
  events.push(['query',request.text,request.name,values,request.values]);
  if(request.name){prepared.add(request.name);wire.parsedStatements[request.name]=request.text;}
  const result={rows:[{number:7}],fields:[{name:'number'}],rowCount:1};
  if(selected){setImmediate(()=>selected(null,result));return undefined;}
  return Promise.resolve(result);
 }};
 const original=client.query;
 cleanup.installLocalStatementCleanup(pool);pool.emit('connect',client);pool.emit('acquire',client);
 return {pool,client,wire,prepared,events,original,ended:()=>ended};
}

test('promise result waits for Close/Sync and clears only its own client cache',async()=>{
 const h=harness();h.prepared.add('unrelated');h.wire.parsedStatements.unrelated='other';
 const result=await h.client.query({name:name(1),text:sql,values:[7]});
 assert.equal(result.rows[0].number,7);assert.equal(h.prepared.has(name(1)),false);
 assert.equal(Object.hasOwn(h.wire.parsedStatements,name(1)),false);
 assert.equal(h.prepared.has('unrelated'),true);assert.equal(h.wire.parsedStatements.unrelated,'other');
 assert.deepEqual(h.events.map(e=>e[0]),['query','parse','bind','describe','execute','close','sync']);
 assert.equal(h.events.find(e=>e[0]==='bind')[1],name(1));
});
test('original caller configuration, row mode and parameter arrays are preserved',async()=>{
 const h=harness(),values=[7],config=Object.freeze({name:name(2),text:sql,values,rowMode:'array'});
 const r=await h.client.query(config);assert.deepEqual(r.rows,[[7]]);assert.equal(h.events[0][4],values);
 assert.equal(config.values,values);assert.equal('callback' in config,false);
});
for(const mode of ['second argument','third argument','config callback'])test(`callback API: ${mode}`,async()=>{
 const h=harness();let calls=0;
 await new Promise((resolve,reject)=>{
  const cb=(err,result)=>{calls++;if(err)return reject(err);assert.equal(h.prepared.size,0);assert.equal(result.rows[0].number,7);resolve()};
  const config={name:name(3),text:sql,values:[7]};
  const returned=mode==='second argument'?h.client.query(config,cb):mode==='third argument'?h.client.query(config,[7],cb):h.client.query({...config,callback:cb});
  assert.equal(returned,undefined);
 });assert.equal(calls,1);
});
test('a SQL error is preserved after resource cleanup',async()=>{
 const h=harness({queryFailure:true});await assert.rejects(h.client.query({name:name(4),text:sql}),{code:'22012'});
 assert.equal(h.prepared.size,0);assert.equal(h.ended(),0);
});
test('a cleanup error retires only its own connection and rejects success',async()=>{
 const h=harness({closeFailure:true});await assert.rejects(h.client.query({name:name(5),text:sql}),/close failed/);
 assert.equal(h.ended(),1);
});
test('cleanup failure does not hide the original SQL error code',async()=>{
 const h=harness({queryFailure:true});let syncs=0;const sync=h.wire.sync;h.wire.sync=()=>{sync();if(++syncs===1)h.wire.close=()=>{throw new Error('retry close failed')}};await assert.rejects(h.client.query({name:name(6),text:sql}),{code:'22012'});assert.equal(h.ended(),1);
});
test('late duplicate query callbacks cannot repeat cleanup or delivery',async()=>{
 const h=harness({duplicateCallback:true});let calls=0;
 await new Promise((resolve,reject)=>h.client.query({name:name(7),text:sql},err=>{calls++;err?reject(err):resolve()}));
 assert.equal(calls,1);assert.equal(h.events.filter(e=>e[0]==='close').length,1);
});
for(const config of [sql,{text:sql,values:[7]},{name:'some_other_component',text:sql},{name:name(8)}])test(`unmanaged queries remain unchanged: ${JSON.stringify(config)}`,async()=>{
 const h=harness();await h.client.query(config);assert.equal(h.events.some(e=>e[0]==='close'),false);
});
test('stream/submittable queries are not transformed',()=>{
 const h=harness(),q=new pg.Query('SELECT 1');let submitted=false;
 q.submit=()=>{submitted=true};q.handleReadyForQuery=()=>{};q.query_timeout=5000;
 assert.equal(h.client.query(q),q);assert.equal(submitted,true);assert.equal(h.events.some(e=>e[0]==='close'),false);
});
test('repeated imports/connect/acquire events never double-wrap clients',async()=>{
 const h=harness();const first=h.client.query;
 for(let i=0;i<10;i++){cleanup.installLocalStatementCleanup(h.pool);h.pool.emit('connect',h.client);h.pool.emit('acquire',h.client)}
 assert.equal(h.client.query,first);assert.equal(h.pool.listenerCount('connect'),1);assert.equal(h.pool.listenerCount('acquire'),1);
 await h.client.query({name:name(9),text:sql});assert.equal(h.events.filter(e=>e[0]==='close').length,1);
});
test('multiple outstanding unique calls each close their own resource',async()=>{
 const h=harness();const results=await Promise.all(Array.from({length:50},(_,i)=>h.client.query({name:name(100+i),text:sql,values:[i]})));
 assert.equal(results.length,50);assert.equal(h.prepared.size,0);assert.equal(Object.keys(h.wire.parsedStatements).length,0);
 assert.equal(new Set(h.events.filter(e=>e[0]==='close').map(e=>e[2])).size,50);
});
for(const url of ['postgres://localhost:51214/postgres','postgres://127.0.0.1:51214/postgres','postgres://localhost:5432/postgres','postgres://db.example:51214/postgres'])test(`actual Prisma bootstrap scopes cleanup correctly: ${new URL(url).host}`,()=>{
 let hooks=0;const pools=[];
 class Pool extends EventEmitter{constructor(config){super();this.config=config;pools.push(this)}}
 class PrismaPg{constructor(pool,options){this.pool=pool;this.options=options}}
 class PrismaClient{constructor(options){this.options=options}}
 const exports={};const compiled=ts.transpileModule(readFileSync('lib/prisma.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const context={exports,process:{env:{DATABASE_URL:url,NODE_ENV:'development'},pid:42},URL,
 require:id=>({'@/app/generated/prisma/client':{PrismaClient},'@prisma/adapter-pg':{PrismaPg},'pg':{Pool},'./database/local-statement-cleanup':{installLocalStatementCleanup(){hooks++}}})[id]??require(id)};
 vm.runInNewContext(compiled,context);
 const local=new URL(url).port==='51214'&&['localhost','127.0.0.1'].includes(new URL(url).hostname);
 assert.equal(hooks,local?1:0);assert.equal(pools.length,1);
 const generate=exports.prisma.options.adapter.options.statementNameGenerator;
 const one=generate(),two=generate();assert.notEqual(one,two);assert.match(one,/^bttb_[a-z0-9]+_[a-z0-9]+_[a-f0-9]{16}$/);
});
