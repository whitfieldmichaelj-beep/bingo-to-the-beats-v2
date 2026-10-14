import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function compile(file){return ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;}
const states=[],effects=[],timers=new Map();let cursor=0,timerId=0;
const component={};
vm.runInNewContext(compile('components/dj-console/DjMiniView.tsx'),{exports:component,require:id=>id.endsWith('.css')?{}:id==='react'?{...React,useState:initial=>{const i=cursor++;if(!(i in states)) states[i]=initial;return[states[i],v=>{states[i]=v;}];},useEffect:f=>effects.push(f)}:require(id),window:{setTimeout:(f,ms)=>{assert.equal(ms,15000);timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id)},Number,Math});
let opened=0,mode;
const props={mode:'standard',onModeChange:value=>{mode=value;},onOpenConsole:()=>opened++,gameCode:'DEMO01',gameStatus:'LIVE',connection:'connected',providerName:'VirtualDJ',providerConnected:true,track:{name:'Test Song',artist:'Test Artist'},progress:45,secondsRemaining:17,songStatus:'Bingo countdown',calledCount:18,totalSongs:80,players:[{playerId:'one',playerName:'Tester <One>',connected:true,cardNumbers:[2,8],cardQuantity:2},{playerId:'offline',playerName:'Offline',connected:false,cardNumbers:[11],cardQuantity:1}],claim:null};
function render(p=props){cursor=0;effects.length=0;return component.default(p);}
function buttons(node,result=[]){if(!node||typeof node!=='object')return result;if(node.type==='button')result.push(node);React.Children.forEach(node.props?.children,child=>buttons(child,result));return result;}
let tree=render();let html=renderToStaticMarkup(tree);
assert.match(html,/Tester &lt;One&gt; — Card #2/);assert.match(html,/Card #8/);assert.doesNotMatch(html,/Offline/);assert.match(html,/1 players · 2 cards/);assert.match(html,/18 \/ 80/);
buttons(tree).find(x=>x.props.children==='Compact').props.onClick();assert.equal(mode,'compact');
buttons(tree).find(x=>x.props.children==='Pause ticker').props.onClick();assert.match(renderToStaticMarkup(render()),/is-paused/);
const claim={id:'a',playerName:'Test Winner',cardNumber:8};
html=renderToStaticMarkup(render({...props,claim}));assert.match(html,/role="alert"/);assert.doesNotMatch(html,/Tester &lt;One&gt;/);effects.forEach(f=>f());
for(const f of timers.values())f();
tree=render({...props,claim});html=renderToStaticMarkup(tree);assert.doesNotMatch(html,/role="alert"/);assert.match(html,/Tester &lt;One&gt;/);assert.match(html,/Review BINGO/);
buttons(tree).find(x=>Array.isArray(x.props.children)&&x.props.children.includes('Open Full BTTB')).props.onClick();assert.equal(opened,1);
assert.match(renderToStaticMarkup(render({...props,claim:{...claim,id:'b'}})),/role="alert"/);
assert.doesNotMatch(renderToStaticMarkup(render({...props,claim:null})),/role="alert"/);
html=renderToStaticMarkup(render({...props,mode:'compact',gameStatus:'COMPLETE',connection:'error',providerConnected:false,progress:999}));assert.match(html,/dj-mini--compact/);assert.match(html,/Connection lost/);assert.match(html,/Disconnected/);assert.match(html,/value="100"/);
console.log('PASS mini view: real card numbers, disconnected filtering, escaped names, modes, countdown bounds, paused ticker, timed claim takeover, next claim, persistent review and full-console control');

const repository={};let selected;
const date=new Date();
const purchases=[{playerKey:'one',playerName:'Tester',status:'PAID',amount:0,refundedAmount:0,cards:[{id:'card-b',cardNumber:8},{id:'card-a',cardNumber:2}],disputes:[],createdAt:date}];
vm.runInNewContext(compile('lib/game/player-repository.ts'),{exports:repository,require:id=>id==='@/lib/prisma'?{prisma:{gameSession:{findMany:async()=>[{sessionKey:'one',playerName:'Tester',connected:true,joinedAt:date,lastSeenAt:date}]},purchase:{findMany:async options=>{selected=options.include.cards.select;return purchases;}}}}:id.includes('disputes')?{hasUnavailableDispute:()=>false}:id==='node:crypto'?require(id):{},Date,Map,Set,Math,Number});
const roster=await repository.listPlayers('test-game');assert.equal(selected.cardNumber,true);assert.deepEqual(Array.from(roster.players[0].cardNumbers),[8,2]);assert.deepEqual(Array.from(roster.players[0].cardIds),['card-b','card-a']);assert.equal(roster.players[0].cardQuantity,2);
console.log('PASS roster read returns actual stored card numbers without changing IDs or quantities');


assert.match(renderToStaticMarkup(render({...props,claimConnectionLost:true})),/BINGO checks interrupted/);
assert.doesNotMatch(renderToStaticMarkup(render({...props,claimConnectionLost:false})),/BINGO checks interrupted/);
console.log("PASS mini view surfaces BINGO-check failure and clears it on recovery");
