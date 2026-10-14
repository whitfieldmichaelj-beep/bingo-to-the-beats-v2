import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseResponds, ensureSavedDatabase, savedDatabaseOptions } from './lib/saved-database.mjs';

const connectionString = 'postgresql://user:password@localhost:51214/template1';
const saved = { name:'default', version:'1', port:51213, databasePort:51214, shadowDatabasePort:51215 };
function harness(overrides={}) {
  const calls=[]; let count=0;
  const server={close:async()=>calls.push('close')};
  return {calls,server,options:{connectionString,probe:async()=>++count>1,
    start:async options=>{calls.push(options);return server;},
    readFile:async()=>JSON.stringify(saved),access:async file=>calls.push(file),
    isPortFree:async()=>true,log:()=>{},...overrides}};
}
test('reuses a responding database without reading or writing its files',async()=>{
  const h=harness({probe:async()=>true});assert.equal(await ensureSavedDatabase(h.options),null);assert.deepEqual(h.calls,[]);
});
test('read-only preflight does not start a stopped database',async()=>{
  const h=harness({checkOnly:true,probe:async()=>false});await assert.rejects(ensureSavedDatabase(h.options),/stopped/);assert.deepEqual(h.calls,[]);
});
test('starts only the existing persistent database with its saved ports',async()=>{
  const h=harness();assert.equal(await ensureSavedDatabase(h.options),h.server);
  assert.match(h.calls[0],/\.pglite[\\/]PG_VERSION$/);
  assert.deepEqual(h.calls[1],{name:'default',persistenceMode:'stateful',debug:false,port:51213,databasePort:51214,shadowDatabasePort:51215,streamsPort:51216});
});
test('missing or corrupt saved files are never replaced with an empty database',async()=>{
  for(const override of [{readFile:async()=>{throw Error('missing')}},{readFile:async()=>'{broken'},{access:async()=>{throw Error('missing data')}}]){
    const h=harness(override);await assert.rejects(ensureSavedDatabase(h.options),/Nothing was created or reset/);assert.equal(h.calls.length,0);
  }
});
test('host, instance, schema version and configured port must match',()=>{
  for(const value of ['postgresql://u:p@remote.example:51214/db','https://localhost:51214/db','postgresql://u:p@localhost:12345/db'])assert.throws(()=>savedDatabaseOptions(value,saved));
  for(const change of [{name:'other'},{version:'2'},{port:51214},{shadowDatabasePort:0},{experimental:{streams:{serverUrl:'invalid'}}}])assert.throws(()=>savedDatabaseOptions(connectionString,{...saved,...change}));
});
test('an occupied database port never causes another service to be stopped',async()=>{
  const h=harness({isPortFree:async()=>false});await assert.rejects(ensureSavedDatabase(h.options),/No existing service was stopped/);assert.equal(h.calls.filter(x=>typeof x==='object').length,0);assert.ok(!h.calls.includes('close'));
});
test('failed health check closes only the server started by this invocation',async()=>{
  const h=harness({probe:async()=>false});await assert.rejects(ensureSavedDatabase(h.options),/connection check failed/);assert.equal(h.calls.at(-1),'close');
});
test('a healthy startup returns ownership to the launcher for graceful shutdown',async()=>{
  const h=harness();const owned=await ensureSavedDatabase(h.options);assert.ok(!h.calls.includes('close'));await owned.close();assert.equal(h.calls.at(-1),'close');
});
test('database probe uses only SELECT 1 and releases its connection',async()=>{
  const calls=[];
  class Pool{async connect(){return{query:async sql=>calls.push(sql),release:()=>calls.push('release')}}async end(){calls.push('end')}}
  assert.equal(await databaseResponds(Pool,connectionString),true);assert.deepEqual(calls,['SELECT 1','release','end']);
});
