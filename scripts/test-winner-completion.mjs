import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let state,eligible=true,inactive=false,competing=false,failEnd=false;
const fixture=()=>({status:'READY',completedAt:null,verified:false,deleted:false});
const prisma={
 game:{findFirst:async()=>({id:'game'})},
 winner:{findFirst:async({where})=>where.id==='claim'?{id:'claim',cardId:'card',card:{status:'ACTIVE',purchase:{status:'PAID'}}}:null,
 findUnique:async()=>null,delete:async()=>{state.deleted=true}},
 bingoCard:{findFirst:async()=>({game:{winningRule:'any-line'},squares:Array.from({length:25},(_,position)=>({position,trackId:String(position),track:{title:'Song',artist:'Artist'}}))})},
 gameTrack:{findMany:async()=>eligible?Array.from({length:25},(_,i)=>({trackId:String(i)})):[]},
 $transaction:async fn=>{const before={...state};try{return await fn({
 $queryRaw:async()=>[{id:'game'}],
 winner:{findFirst:async()=>competing?{id:'other'}:null,update:async()=>{state.verified=true}},
 bingoCard:{updateMany:async()=>({count:inactive?0:1})},
 game:{updateMany:async()=>{if(failEnd)throw Error('completion failed');if(state.status!=='COMPLETED'){state.status='COMPLETED';state.completedAt=new Date()}return {count:1}}},
 })}catch(e){state=before;throw e}},
};
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('lib/game/bingo-verification.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({prisma})});
const review=action=>exports.reviewBingoClaim('game','claim','host',action);
state=fixture();assert.equal((await review('verify')).ok,true);assert.equal(state.status,'COMPLETED');assert.equal(state.verified,true);const end=state.completedAt;await review('verify');assert.equal(state.completedAt,end);
state=fixture();await review('reject');assert.equal(state.status,'READY');assert.equal(state.verified,false);
state=fixture();eligible=false;assert.equal((await review('verify')).code,'NOT_ELIGIBLE');assert.equal(state.status,'READY');eligible=true;
state=fixture();inactive=true;assert.equal((await review('verify')).code,'CARD_INACTIVE');assert.equal(state.status,'READY');inactive=false;
state=fixture();competing=true;assert.equal((await review('verify')).code,'WINNER_EXISTS');assert.equal(state.verified,false);assert.equal(state.status,'READY');competing=false;
state=fixture();failEnd=true;await assert.rejects(()=>review('verify'),/completion failed/);assert.equal(state.verified,false);assert.equal(state.status,'READY');
console.log('PASS winner and game completion commit together; rejection, ineligible/inactive cards, competing winners, retries and rollback are protected');
const panel={};let claims=[],completed=0,refIndex=0;const refs=[];
vm.runInNewContext(ts.transpileModule(readFileSync('components/game/BingoVerificationPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
 exports:panel,require:id=>id==='react'?{useRef:v=>refs[refIndex++]??(refs[refIndex-1]={current:v}),useState:v=>[v,()=>{}],useEffect:f=>f()}:id==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:{useBingoClaims:()=>({claims,refresh:async()=>{}})},
});
function render(){refIndex=0;panel.default({gameId:'game',onWinnerVerified:()=>completed++})}
render();assert.equal(completed,0);claims=[{id:'pending',status:'pending',pattern:'any-line',winningSquares:[],createdAt:new Date().toISOString()}];render();assert.equal(completed,0);
claims=[{id:'winner',status:'verified'}];render();render();assert.equal(completed,1,'A verified winner synchronizes completion once, including after reload');
console.log('PASS console recovery ends a verified game once and never ends one merely for a pending claim');
