import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const panel={},refs=[];let index=0,error='BINGO check timed out',reported='unset',completed=0;
vm.runInNewContext(ts.transpileModule(readFileSync('components/game/BingoVerificationPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
 exports:panel,require:id=>id==='react'?{...React,useRef:value=>refs[index++]??(refs[index-1]={current:value}),useState:value=>[value,()=>{}],useEffect:effect=>effect()}:id==='@/hooks/useBingoClaims'?{useBingoClaims:()=>({claims:[],error,refresh:async()=>{}})}:require(id),
});
function render(showReview=true){index=0;return panel.default({gameId:'game',showReview,onConnectionErrorChange:value=>reported=value,onWinnerVerified:()=>completed++});}
assert.equal(render(false),null,'Mini View suppresses the full review UI');assert.equal(reported,error,'Mini View must receive BINGO connection failures');
assert.match(renderToStaticMarkup(render()),/BINGO checks interrupted/);assert.equal(completed,0,'A connection failure never completes the game');
error=null;assert.equal(render(),null);assert.equal(reported,null,'A successful retry clears the warning');assert.equal(completed,0);
console.log('PASS BINGO connection: mini/full-console warning, recovery, and no completion side effects');
