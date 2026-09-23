import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync('app/game/cards/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
for(const changed of [false,true]) {
 const session={game:{id:'finished',playlistName:'Test playlist',bingoPattern:'single-line'},player:{playerId:'p'},cards:[{id:'card',cardNumber:5,rows:5,columns:5,squares:[]}]};
 const states=[session,0,[],'','',true,true,{playerName:'Mike',cardNumber:5,cardId:'card'},true,0,'',false,changed,null,[],[],true,[]];
 let index=0; const exports={};
 vm.runInNewContext(compiled,{exports,require:id=>id==='react'?{useState:initial=>[index<states.length?states[index++]:initial,()=>{}],useMemo:f=>f(),useEffect:()=>{},useRef:v=>({current:v})}:id==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:{default:()=>null}});
 const tree=exports.default();const nodes=[];const visit=n=>{if(!n)return;if(Array.isArray(n))return n.forEach(visit);if(typeof n==='object'){nodes.push(n);visit(n.props?.children)}};visit(tree);
 const heading=nodes.find(n=>n.type==='h1');assert.equal(heading.props.children,'Mike wins!');
 assert.ok(nodes.some(n=>n.props?.href==='/game/results?gameId=finished'),'persistent result link');
 assert.ok(nodes.some(n=>n.props?.role==='status'&&String(n.props.children).includes('Card #5')),'winner announced accessibly');
 assert.ok(nodes.some(n=>n.type==='details'),'final cards retained');
}
console.log('PASS actual player completion screen: prominent winner, accessible announcement, persistent link, final cards, and session-change race');
