import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
function load(file,mocks={}) {
  const exports={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>mocks[n]??require(n),process,Date});return exports;
}
const rates=load('app/lib/ratePlans.ts');
const plans=load('lib/billing/plans.ts',{'../../app/lib/ratePlans':rates});
const {reservePlayerSeat,requireMusicAccess,HostAccessError,PlayerCapacityError,reserveHostGame}=load('lib/billing/access.ts',{'@/lib/prisma':{prisma:{}},'./plans':plans});
assert.equal(rates.ratePlans.length,3);
assert.deepEqual(Array.from(rates.ratePlans,p=>[p.name,p.weeklyPrice,p.monthlyPrice,p.maximumPlayers]),[['Social',9.99,29.99,25],['Venue',39.99,119.99,100],['Event Plus',69.99,199.99,200]]);
assert.deepEqual(Array.from(plans.djPlans,p=>[p.id,p.amountCents,p.interval,p.maxPlayers]),[['serato-weekly',1995,'week',25],['serato-pro',4995,'month',75],['serato-pro-plus',6995,'month',150]]);
const active=planId=>({planId,status:'active',accessUntil:new Date(Date.now()+86400000)});
for(const plan of plans.hostPlans) {
  assert.equal(plans.activePlayerLimit(active(plan.id)),plan.maxPlayers);
  if(plan.serato)requireMusicAccess(active(plan.id),'serato',false);
  else assert.throws(()=>requireMusicAccess(active(plan.id),'serato',false),HostAccessError);
  requireMusicAccess(active(plan.id),'apple',false);
}
assert.equal(plans.activePlayerLimit({...active('venue-monthly'),status:'past_due'}),5);
assert.equal(plans.activePlayerLimit({...active('venue-monthly'),accessUntil:new Date(0)}),5);
assert.equal(plans.getHostPlan('standard-weekly'),undefined);
requireMusicAccess(null,'serato',true);
let billing={...active('social-monthly'),activeGameId:null};
let occupied=true;
const txMock={ $queryRaw:async()=>[],hostBilling:{upsert:async()=>billing,findUniqueOrThrow:async()=>billing,update:async({data})=>Object.assign(billing,data)},game:{findUnique:async()=>({status:occupied?'LIVE':'COMPLETED'})}};
assert.equal((await reserveHostGame(txMock,'host','game',250,'apple')).maxPlayers,25,'250 cards must not require 250 player spots');
await assert.rejects(()=>reserveHostGame(txMock,'host','second',25,'apple'),HostAccessError);
occupied=false;assert.equal((await reserveHostGame(txMock,'host','second',25,'apple')).maxPlayers,25);
await assert.rejects(()=>reserveHostGame(txMock,'host','third',25,'serato'),HostAccessError);
const practiceAccess=await reserveHostGame(txMock,'host','practice',5,'serato',true);
assert.equal(practiceAccess.isPractice,true);assert.equal(practiceAccess.maxPlayers,5);
await assert.rejects(()=>reserveHostGame(txMock,'host','oversized-practice',100,'serato',true),HostAccessError);
console.log('PASS explicit practice remains free with a paid plan and enforces five-player size');
console.log('PASS plan prices, paid-period limits, provider authorization, cards versus players, and one active game');
if(!process.argv.includes('--database'))process.exit(0);
require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const url=new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Database test requires a local database');
const {Pool}=require('pg'); const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000});
const token=randomUUID(),host=`capacity-${token}`,gameId=randomUUID();
let queryId=0;
function query(c,text,values=[]){return c.query({text,values,name:`cap_${token.replaceAll('-','')}_${queryId++}`});}
function adapter(c){return {
  $queryRaw:async(strings,...values)=>query(c,strings.reduce((s,v,i)=>s+(i?`$${i}`:'')+v,''),values),
  game:{findUniqueOrThrow:async()=>{const r=await query(c,'SELECT g.*,u."clerkId" FROM "Game" g JOIN "User" u ON u.id=g."hostId" WHERE g.id=$1',[gameId]);return {...r.rows[0],host:{clerkId:r.rows[0].clerkId}};}},
  hostBilling:{findUnique:async()=> (await query(c,'SELECT * FROM "HostBilling" WHERE "clerkId"=$1',[host])).rows[0]},
  gamePlayerSeat:{findUnique:async({where})=> (await query(c,'SELECT * FROM "GamePlayerSeat" WHERE "gameId"=$1 AND "playerKey"=$2',[gameId,where.gameId_playerKey.playerKey])).rows[0],count:async()=>Number((await query(c,'SELECT count(*) FROM "GamePlayerSeat" WHERE "gameId"=$1',[gameId])).rows[0].count),create:async({data})=>query(c,'INSERT INTO "GamePlayerSeat" ("gameId","playerKey") VALUES($1,$2)',[gameId,data.playerKey])}
};}
async function join(key,rollback=false){for(let i=0;i<5;i++){const c=await pool.connect();try{await query(c,'BEGIN ISOLATION LEVEL SERIALIZABLE');await reservePlayerSeat(adapter(c),gameId,key);await query(c,rollback?'ROLLBACK':'COMMIT');return;}catch(e){await query(c,'ROLLBACK');if(e.code==='40001'&&i<4)continue;throw e;}finally{c.release();}}}
try {
 await query(pool,'INSERT INTO "User" (id,"clerkId","updatedAt") VALUES ($1,$1,NOW())',[host]);
 await query(pool,'INSERT INTO "Game" (id,"hostId","playlistName","playlistTrackCount",title,"joinCode","updatedAt","hostBillingRequired","playbackConfig") VALUES ($1,$2,\'Capacity test\',25,\'Capacity test\',$3,NOW(),true,$4::jsonb)',[gameId,host,`CAP${token.replaceAll('-','').slice(0,12)}`,JSON.stringify({source:'apple'})]);
 await query(pool,'INSERT INTO "HostBilling" ("clerkId","planId",status,"accessUntil","activeGameId","updatedAt") VALUES ($1,\'social-monthly\',\'active\',NOW()+INTERVAL \'1 day\',$2,NOW())',[host,gameId]);
 for(let i=0;i<24;i++)await join(`player-${i}`);
 await join('rolled-back',true);
 let used=Number((await query(pool,'SELECT count(*) FROM "GamePlayerSeat" WHERE "gameId"=$1',[gameId])).rows[0].count);assert.equal(used,24,'failed enrollment rolls back its spot');
 const race=await Promise.allSettled([join('last-a'),join('last-b')]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.ok(race.find(r=>r.status==='rejected').reason instanceof PlayerCapacityError);
 await join('player-0'); // Same identity reconnects at capacity.
 used=Number((await query(pool,'SELECT count(*) FROM "GamePlayerSeat" WHERE "gameId"=$1',[gameId])).rows[0].count);assert.equal(used,25);
 await query(pool,'UPDATE "HostBilling" SET "planId"=\'venue-monthly\' WHERE "clerkId"=$1',[host]);
 await join('after-upgrade');
 console.log('PASS database: final-spot race, rollback, reconnect at capacity, persistent spots, and upgrade without kicking existing players');
}finally{await query(pool,'DELETE FROM "Game" WHERE id=$1',[gameId]);await query(pool,'DELETE FROM "HostBilling" WHERE "clerkId"=$1',[host]);await query(pool,'DELETE FROM "User" WHERE id=$1',[host]);await pool.end();}
