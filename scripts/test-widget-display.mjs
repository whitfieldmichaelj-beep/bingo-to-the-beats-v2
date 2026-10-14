import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let now=1000,tree,receive,tick;const commands=[];
function MiniView(){return null;}
vm.runInNewContext(ts.transpileModule(readFileSync('native/dj-widget/client.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
 exports:{},Date:{now:()=>now},window:{setInterval:f=>tick=f,bttbWidget:{receive:f=>receive=f,send:(type,value)=>commands.push({type,value})}},document:{getElementById:()=>({getBoundingClientRect:()=>({height:150})})},ResizeObserver:class{observe(){}},
 require:id=>id==='react-dom/client'?{createRoot:()=>({render:node=>tree=node})}:id.endsWith('/DjMiniView')?{__esModule:true,default:MiniView}:require(id),
});
const data={updatedAt:now,mode:'standard',connection:'connected',providerConnected:true,songStatus:'Bingo countdown',secondsRemaining:20,progress:33,players:[],claim:null};
const mini=()=>React.Children.toArray(tree.props.children).find(child=>child.type===MiniView);
receive(data);assert.equal(mini().props.connection,'connected');assert.doesNotMatch(renderToStaticMarkup(tree),/updates paused/);
now=10001;tick();assert.equal(mini().props.connection,'error');assert.equal(mini().props.providerConnected,false);assert.equal(mini().props.secondsRemaining,20,'Stale display retains the last known countdown instead of making up progress');assert.equal(mini().props.songStatus,'Last received countdown');assert.match(renderToStaticMarkup(tree),/updates paused/);
receive({...data,updatedAt:now,secondsRemaining:9});assert.equal(mini().props.connection,'connected');assert.equal(mini().props.secondsRemaining,9);assert.doesNotMatch(renderToStaticMarkup(tree),/updates paused/);
mini().props.onModeChange('compact');assert.equal(mini().props.mode,'compact');assert.equal(commands.at(-1).type,'mode');receive({...data,updatedAt:now,mode:'standard'});assert.equal(mini().props.mode,'compact','Keep the requested size until the console acknowledges it');receive({...data,updatedAt:now,mode:'compact'});assert.equal(mini().props.mode,'compact');
mini().props.onOpenConsole();assert.equal(commands.at(-1).type,'console');assert.match(renderToStaticMarkup(tree),/Opening full BTTB/);now+=6000;tick();assert.match(renderToStaticMarkup(tree),/Return to your open BTTB browser tab/);const close=React.Children.toArray(tree.props.children).find(child=>child.type==='button');close.props.onClick();assert.equal(commands.at(-1).type,'close');
console.log('PASS widget display: stale/recovered status, truthful countdown, mode acknowledgement, delayed console return and accessible close');
