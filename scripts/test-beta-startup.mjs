import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import vm from 'node:vm';
import ts from 'typescript';
import { privateIPv4, chooseAddress, parseOptions, betaEnvironment, BETA_KEY, BETA_KIND, validateConfiguration, redactor, sourceFingerprint, portAvailable, readReady } from './lib/beta-startup.mjs';

const row = address => ({ internal: false, family: 'IPv4', address });
const env = { DATABASE_URL: 'postgresql://user:password@localhost:51214/db', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-pub', CLERK_SECRET_KEY: 'test-secret', BTTB_LOCAL_LIBRARY_OWNER_ID: 'test-owner', BTTB_PLAYER_SESSION_SECRET: 'x'.repeat(32) };
const run = 'a'.repeat(32);

test('accepts only private IPv4 addresses', () => {
  for (const host of ['10.1.2.3','172.16.0.1','172.31.255.254','192.168.1.50']) assert.equal(privateIPv4(host),true);
  for (const host of ['8.8.8.8','127.0.0.1','169.254.1.2','172.15.0.1','172.32.0.1','192.168.1.999','localhost','192.168.1.2/path',undefined]) assert.equal(privateIPv4(host),false);
});

test('discovers current LAN rather than using a stale configured address', () => {
  assert.equal(chooseAddress({en0:[row('192.168.2.9')]},{configured:'http://192.168.1.239:3001'}),'192.168.2.9');
});

test('current default physical interface wins over another network', () => {
  assert.equal(chooseAddress({en0:[row('192.168.2.9')],en1:[row('10.0.0.3')]},{preferredInterface:'en0',configured:'http://10.0.0.3:3001'}),'192.168.2.9');
});

test('does not silently choose a VPN instead of physical Wi-Fi', () => {
  assert.equal(chooseAddress({en0:[row('192.168.2.9')],utun4:[row('10.8.0.1')]},{preferredInterface:'utun4'}),'192.168.2.9');
});

test('ambiguous networks require a current explicit selection', () => {
  const interfaces={en0:[row('192.168.2.9')],en1:[row('10.0.0.3')]};
  assert.throws(()=>chooseAddress(interfaces),/More than one/);
  assert.equal(chooseAddress(interfaces,{requested:'10.0.0.3'}),'10.0.0.3');
  assert.throws(()=>chooseAddress(interfaces,{requested:'10.0.0.4'}),/not a current/);
});

test('offline or public-only adapters fail closed', () => {
  assert.throws(()=>chooseAddress({lo0:[{...row('127.0.0.1'),internal:true}],en0:[row('8.8.8.8')]}),/No private/);
});

test('options reject malformed ports, public hosts and unknown switches', () => {
  assert.deepEqual(parseOptions([]),{port:3010,check:false,open:true});
  assert.equal(parseOptions(['--check','--no-open','--port','3014']).check,true);
  for(const args of [['--port','22'],['--port','65536'],['--port','3010;bad'],['--host','8.8.8.8'],['--host'],['--unsafe']]) assert.throws(()=>parseOptions(args));
});

test('configuration requires local database and existing auth/owner/player settings', () => {
  validateConfiguration(env,'24.18.0');
  for(const name of ['DATABASE_URL','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','CLERK_SECRET_KEY','BTTB_LOCAL_LIBRARY_OWNER_ID','BTTB_PLAYER_SESSION_SECRET']) assert.throws(()=>validateConfiguration({...env,[name]:''},'24.18.0'));
  for(const address of ['postgresql://u:p@remote.example/db','https://localhost/db','file:///db']) assert.throws(()=>validateConfiguration({...env,DATABASE_URL:address},'24.18.0'),/local PostgreSQL/);
  assert.throws(()=>validateConfiguration(env,'20.0.0'),/Node.js 22/);
});

test('child environment forces no-charge settings without modifying the original', () => {
  const original={...env,STRIPE_SECRET_KEY:'sk_live_do_not_use',STRIPE_WEBHOOK_SECRET:'whsec_live_do_not_use',BTTB_HOST_SUBSCRIPTIONS_ENABLED:'true',BTTB_DEV_PAYMENT_BYPASS:'true',NODE_ENV:'production',NEXT_PUBLIC_APP_URL:'https://original.example'};
  const before={...original};const child=betaEnvironment(original,'192.168.2.9',3010,run);
  assert.deepEqual(original,before);
  assert.equal(child.STRIPE_SECRET_KEY,BETA_KEY);assert.equal(child.BTTB_HOST_SUBSCRIPTIONS_ENABLED,'false');assert.equal(child.BTTB_DEV_PAYMENT_BYPASS,'false');
  assert.equal(child.BTTB_PHONE_TEST,'1');assert.equal(child.BTTB_PRIVATE_BETA,'1');assert.equal(child.NODE_ENV,'development');
  assert.equal(child.NEXT_PUBLIC_APP_URL,'http://192.168.2.9:3010');assert.equal(child.BTTB_PLAYER_SESSION_SECRET,original.BTTB_PLAYER_SESSION_SECRET);
  assert.match(child.STRIPE_WEBHOOK_SECRET,/^whsec_[a-f0-9]{64}$/);assert.notEqual(child.STRIPE_WEBHOOK_SECRET,betaEnvironment(original,'192.168.2.9',3010,run).STRIPE_WEBHOOK_SECRET,'Each launch rejects prior or publicly known test webhook signatures');
});

test('environment refuses invalid network, port or run identity', () => {
  for(const input of [['8.8.8.8',3010,run],['192.168.2.9',0,run],['192.168.2.9',3010,'not-an-id']]) assert.throws(()=>betaEnvironment(env,...input));
});

test('logs redact configured secrets, database URLs and payment keys', () => {
  const clean=redactor(env)(`${env.DATABASE_URL} ${env.CLERK_SECRET_KEY} ${env.BTTB_PLAYER_SESSION_SECRET} sk_live_abc123 whsec_sensitive`);
  for(const value of [env.DATABASE_URL,env.CLERK_SECRET_KEY,env.BTTB_PLAYER_SESSION_SECRET,'sk_live_abc123','whsec_sensitive']) assert.equal(clean.includes(value),false);
});

test('occupied ports are not taken over',async()=>{
  const server=createServer();server.listen(0,'0.0.0.0');await once(server,'listening');
  try{assert.equal(await portAvailable(server.address().port),false);assert.equal(server.listening,true);}finally{await new Promise(r=>server.close(r));}
});

test('readiness requires this exact no-charge session identity',async()=>{
  const good={kind:BETA_KIND,runId:run,noLiveCharges:true};
  assert.equal(await readReady(3010,run,async()=>({ok:true,json:async()=>good})),true);
  for(const data of [{...good,runId:'b'.repeat(32)},{...good,noLiveCharges:false},{...good,kind:'unrelated-server'}]) assert.equal(await readReady(3010,run,async()=>({ok:true,json:async()=>data})),false);
  assert.equal(await readReady(3010,run,async()=>{throw Error('offline')}),false);
});

const routeSource=readFileSync('app/api/beta/health/route.ts','utf8');
function health(input) {
  class NextResponse{constructor(body,options={}){this.body=body;this.status=options.status??200;}static json(body,options={}){return new this(body,options);}}
  const exports={};vm.runInNewContext(ts.transpileModule(routeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,process:{env:input},require:()=>({NextResponse})});
  return exports.GET();
}

test('health endpoint is unavailable in ordinary development and hosted builds',()=>{
  assert.equal(health(env).status,404);
  assert.equal(health({...betaEnvironment(env,'192.168.2.9',3010,run),NODE_ENV:'production'}).status,503);
});

test('health endpoint rechecks all safety flags and never returns credentials or paths',()=>{
  const safe=betaEnvironment(env,'192.168.2.9',3010,run);const result=health(safe);
  assert.equal(result.status,200);assert.deepEqual(JSON.parse(JSON.stringify(result.body)),{kind:BETA_KIND,runId:run,noLiveCharges:true});
  for(const [key,value] of [['STRIPE_SECRET_KEY','sk_live_bad'],['BTTB_PHONE_TEST','0'],['BTTB_HOST_SUBSCRIPTIONS_ENABLED','true'],['BTTB_DEV_PAYMENT_BYPASS','true'],['BTTB_BETA_RUN_ID','']]) assert.equal(health({...safe,[key]:value}).status,503);
  assert.equal(JSON.stringify(result.body).includes(env.CLERK_SECRET_KEY),false);
});

test('runtime files are ignored and actual source edits change the startup fingerprint',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'bttb fingerprint # '));
  try{
    execFileSync('git',['init','-q',root]);writeFileSync(path.join(root,'.gitignore'),'.next-private-beta/\n.env*\n');writeFileSync(path.join(root,'code.ts'),'export const n=1;');
    execFileSync('git',['add','.'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],{cwd:root});
    const a=sourceFingerprint(root);writeFileSync(path.join(root,'.env.local'),'SECRET=private');assert.equal(sourceFingerprint(root),a);
    writeFileSync(path.join(root,'code.ts'),'export const n=2;');assert.notEqual(sourceFingerprint(root),a);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('launcher help works without starting servers or needing account setup',()=>{
  const text=execFileSync(process.execPath,['scripts/start-private-beta.mjs','--help'],{encoding:'utf8'});
  assert.match(text,/no live charges/);assert.match(text,/preflight only/);
});
