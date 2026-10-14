import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const slots=[],effects=[],requests=[],timers=new Map(),events=new Map();let cursor=0,tree,opened=0,modeChanges=0;
 const props={gameId:'test-game',mode:'standard',onModeChange:()=>modeChanges++,onOpenConsole:()=>opened++,players:[],claim:null};
 const window={focus(){},setInterval:f=>{timers.set(1,f);return 1},clearInterval:id=>timers.delete(id),addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync('components/dj-console/FloatingMiniView.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,window,crypto:{randomUUID:()=> 'client'},AbortSignal,Error,
  fetch:(_url,options)=>new Promise(resolve=>requests.push({body:JSON.parse(options.body),resolve})),
  require:id=>id==='react'?{...React,useRef:initial=>{const i=cursor++;return slots[i]??=( {current:initial} );},useState:initial=>{const i=cursor++;if(!slots[i])slots[i]={value:initial};return[slots[i].value,value=>slots[i].value=value];},useEffect:(effect,deps)=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((value,index)=>value!==old.deps?.[index])){effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:effect()}});}}}:id==='./DjMiniView'?{__esModule:true,default:()=>null}:id==='@/lib/dj-widget/snapshot'?{widgetSnapshot:()=>({gameCode:'TEST'})}:require(id)});
 function render(){cursor=0;tree=exports.default(props);while(effects.length)effects.shift()();return tree;}
 render();
 return{window,requests,render,open:()=>{render();tree.props.children[0].props.onFloat?.()},tick:()=>timers.get(1)?.(),hide:()=>events.get('pagehide')?.(),unmount:()=>slots.forEach(slot=>slot.cleanup?.()),
  reply:async(index,data)=>{requests[index].resolve({ok:true,json:async()=>({ok:true,...data})});await settle();render()},opened:()=>opened,modeChanges:()=>modeChanges};
}
{
 const h=harness();h.open();h.open();assert.equal(h.requests.length,1,'Rapid double open launches only once');await h.reply(0,{id:'one'});assert.equal(h.window.bttbDesktopWidgetActive,true);
 h.tick();assert.equal(h.requests[1].body.id,'one');h.hide();assert.equal(h.requests[2].body.action,'close');
 h.open();await h.reply(3,{id:'two'});assert.equal(h.window.bttbDesktopWidgetActive,true);
 await h.reply(1,{closed:true});assert.equal(h.window.bttbDesktopWidgetActive,true,'An old closed response must not close the reopened widget');assert.equal(h.requests.filter(r=>r.body.action==='close'&&r.body.id==='two').length,0);
 h.unmount();assert.equal(h.requests.at(-1).body.id,'two');assert.equal(h.window.bttbDesktopWidgetActive,false);
}
{
 const h=harness();h.open();await h.reply(0,{id:'one'});h.tick();h.hide();h.open();await h.reply(3,{id:'two'});
 await h.reply(1,{command:{id:'old-command',type:'console'}});assert.equal(h.opened(),0,'A delayed command from the old widget cannot navigate the new session');
 h.tick();await h.reply(4,{command:{id:'new-command',type:'console'}});assert.equal(h.opened(),1);assert.equal(h.window.bttbDesktopWidgetActive,false);
}
{
 const h=harness();h.open();h.unmount();await h.reply(0,{id:'late'});assert.equal(h.window.bttbDesktopWidgetActive,false);assert.equal(h.requests.at(-1).body.action,'close');assert.equal(h.requests.at(-1).body.id,'late');
}
console.log('PASS widget controller: duplicate-open guard, stale-response/command isolation, full-console return, late-open cleanup');
