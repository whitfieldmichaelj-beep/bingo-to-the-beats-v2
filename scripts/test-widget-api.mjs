import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const local={};vm.runInNewContext(compile('lib/dj-widget/local-access.ts'),{exports:local,URL});
const route={};let userId='host',ownsGame=true,opened=0,ownershipChecks=0;
class WidgetError extends Error{}
vm.runInNewContext(compile('app/api/dj-widget/route.ts'),{exports:route,Response,JSON,Number,Error,SyntaxError,Array,console,require:id=>id==='@clerk/nextjs/server'?{auth:async()=>({userId})}:id==='@/lib/prisma'?{prisma:{game:{findFirst:async query=>{ownershipChecks++;assert.equal(query.where.host.clerkId,'host');return ownsGame?{id:'game'}:null}}}}:id==='@/lib/dj-widget/local-access'?local:id==='@/lib/dj-widget/session'?{WidgetError,serializedWidgetSession:async()=>{opened++;return{id:'test-display'}}}:require(id)});
const request=(body={action:'start',gameId:'game'},overrides={})=>new Request('http://localhost:3010/api/dj-widget',{method:'POST',headers:{host:'localhost:3010',origin:'http://localhost:3010','content-type':'application/json',...overrides},body:JSON.stringify(body)});
assert.equal((await route.POST(request({}, {origin:'https://other.example'}))).status,403);assert.equal(opened,0);assert.equal(ownershipChecks,0);
userId=null;assert.equal((await route.POST(request())).status,401);assert.equal(opened,0);
userId='host';ownsGame=false;assert.equal((await route.POST(request())).status,404);assert.equal(opened,0);
ownsGame=true;assert.equal((await route.POST(request({action:'start'}))).status,400);assert.equal(opened,0);
assert.equal((await route.POST(request({}, {'content-length':'500001'}))).status,413);assert.equal(opened,0);
const result=await route.POST(request());assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await result.json()).id,'test-display');assert.equal(opened,1);
console.log('PASS widget API: origin, sign-in, game ownership, input bounds and no-store response before any desktop launch');
