// Explicit operator-only read/protocol check. No application-table writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import pg from 'pg';
import ts from 'typescript';
import {PrismaPg} from '@prisma/adapter-pg';
import env from '@next/env';
env.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const address=new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(address.hostname)&&address.port==='51214','Requires the explicitly identified local Prisma bridge');
const queries=process.argv.includes('--quick')?200:5000;
const require=createRequire(import.meta.url),exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/database/local-statement-cleanup.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Symbol,Error});
const namespace='probe'+randomUUID().replaceAll('-','').slice(0,12);
let serial=0;
const nextName=()=>`bttb_${namespace}_${(++serial).toString(36)}_${randomUUID().replaceAll('-','').slice(0,16)}`;
const ownPrefix=`bttb_${namespace}_`;
const config={connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,query_timeout:10000,idleTimeoutMillis:100,maxUses:40};
const observer=new pg.Client(config),control=new pg.Client(config),controlNames=[];
const pools=[],adapters=[];
const close=(client,name)=>new Promise((resolve,reject)=>{
 const q=new pg.Query('',e=>e?reject(e):resolve());q.query_timeout=5000;
 q.submit=wire=>{wire.close({type:'S',name});wire.sync()};client.query(q);
});
const ownCount=async()=>Number((await observer.query(`SELECT count(*)::int AS count FROM pg_prepared_statements WHERE name LIKE '${ownPrefix}%'`)).rows[0].count);
try{
 await observer.connect();await control.connect();
 const initial=await ownCount();assert.equal(initial,0);
 for(let i=0;i<20;i++){const name=nextName();controlNames.push(name);const r=await control.query({name,text:'SELECT $1::int AS n',values:[i]});assert.equal(r.rows[0].n,i)}
 await control.end();
 const retained=await ownCount();
 console.log('CONTROL after TCP disconnect: retained test statements =',retained,'of 20');
 assert.equal(retained,20,'This diagnostic should reproduce the observed local bridge retention');
 for(const name of controlNames)await close(observer,name);
 assert.equal(await ownCount(),0);
 console.log('PASS isolated control reproduction cleaned up only its own 20 names.');
 for(let i=0;i<4;i++){
  const pool=new pg.Pool(config);exports.installLocalStatementCleanup(pool);pools.push(pool);
  adapters.push(await new PrismaPg(pool,{statementNameGenerator:nextName}).connect());
 }
 const argumentTypes=[{scalarType:'int',dbType:'int4',arity:'scalar'},{scalarType:'string',dbType:'text',arity:'scalar'},{scalarType:'string',dbType:'text',arity:'scalar'}];
 const started=performance.now();let done=0;
 await Promise.all(adapters.map(async(adapter,worker)=>{
  for(let i=worker;i<queries;i+=adapters.length){
   const label=`quotes ' and values $1 ${i}`;
   const r=await adapter.queryRaw({sql:'SELECT $1::int AS n, $2::text AS label, $3::text AS nullable',args:[i,label,null],argTypes:argumentTypes});
   assert.deepEqual(r.rows,[[i,label,null]]);done++;
  }
 }));
 assert.equal(done,queries);assert.equal(await ownCount(),0);
 console.log(`PASS ${queries} real Prisma adapter queries across four TCP pools; values/row results correct; zero test statements retained after pool recycling. ${(performance.now()-started).toFixed(0)} ms`);
 // Mix successful and failing statements across sockets. Error cleanup must
 // not cross-contaminate another query's value, portal, or response.
 await Promise.all(adapters.map(async(adapter,worker)=>{
  for(let j=0;j<100;j++){
   if(j%10===0){await assert.rejects(adapter.queryRaw({sql:'SELECT 1/0',args:[],argTypes:[]}));}
   const expected=worker*10000+j;
   const r=await adapter.queryRaw({sql:'SELECT $1::int AS n',args:[expected],argTypes:[argumentTypes[0]]});
   assert.equal(r.rows[0][0],expected);
  }
 }));
 assert.equal(await ownCount(),0);
 console.log('PASS 400 concurrent follow-up reads with 40 interleaved SQL errors; no incorrect results or retained test statements.');
 const c=await pools[0].connect();
 try{
  const read=(text,values=[])=>c.query({name:nextName(),text,values});
  await read('BEGIN READ ONLY');
  assert.equal((await read("SELECT current_setting('transaction_read_only') AS mode")).rows[0].mode,'on');
  await assert.rejects(read('SELECT 1/0'),{code:'22012'});
  await read('ROLLBACK');
  assert.equal((await read('SELECT $1::int AS n',[99])).rows[0].n,99);
  await assert.rejects(read('SELECT $1::int',['bad-int']),{code:'22P02'});
  await assert.rejects(read('SELEC invalid'),{code:'42601'});
  const callback=await new Promise((resolve,reject)=>c.query({name:nextName(),text:'SELECT $1::text AS text',values:['callback'],rowMode:'array'},(e,r)=>e?reject(e):resolve(r)));
  assert.deepEqual(callback.rows,[['callback']]);
  assert.equal(Object.keys(c.connection.parsedStatements).filter(n=>n.startsWith(ownPrefix)).length,0);
  console.log('PASS read-only transaction, failed-transaction Close, rollback, conversion/syntax errors, callback arrays and local cache cleanup.');
 }finally{try{await c.query('ROLLBACK')}catch{}c.release()}
 for(const a of adapters)await a.dispose();
 for(const p of pools)await p.end();
 assert.equal(await ownCount(),0);
 console.log('PASS all new physical connections closed with zero owned statements remaining. No game records were used or changed.');
}catch(e){console.error('DB VALIDATION FAILED:',e.code??e.name,e.message);process.exitCode=1;}
finally{
 for(const a of adapters){try{await a.dispose()}catch{}}
 for(const p of pools){if(!p.ending)try{await p.end()}catch{}}
 try{await control.end()}catch{}
 // Clean up any remaining names created by this probe, never another caller's.
 try{const names=(await observer.query(`SELECT name FROM pg_prepared_statements WHERE name LIKE '${ownPrefix}%'`)).rows;for(const {name} of names){if(name.startsWith(ownPrefix))await close(observer,name)}}catch{}
 await observer.end().catch(()=>{});
}
