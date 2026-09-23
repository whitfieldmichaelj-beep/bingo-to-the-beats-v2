import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const providers={};vm.runInNewContext(compile('lib/dj/providers.ts'),{exports:providers});
for(const [search,saved,blocked,expected] of [
 ['?provider=virtualdj','serato',false,'virtualdj'],
 ['?provider=rekordbox','serato',true,'rekordbox'],
 ['', 'virtualdj',false,'virtualdj'],
 ['',null,true,'serato'],
]){
 let state;const effects=[],loads=[],exports={};
 const jsx=(type,props)=>({type,props});
 vm.runInNewContext(compile('app/serato/page.tsx'),{exports,URLSearchParams,window:{location:{search}},localStorage:{getItem(){if(blocked)throw Error('Unavailable');return saved}},require:id=>{
  if(id==='react')return {useState:initial=>[state===undefined?(state=initial):state,v=>state=v],useEffect:f=>effects.push(f)};
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(id.includes('lib/dj/providers'))return providers;
  if(id.includes('useSeratoWorkspace'))return {useSeratoWorkspace:p=>{loads.push(p);return {status:{isHydrated:false}}}};
  return {};
 }});
 const initial=exports.default();assert.equal(initial.type,'main');assert.equal(loads.length,0,'No library loads before selection is resolved');
 effects[0]();const restored=exports.default();assert.equal(restored.props.provider,expected);restored.type(restored.props);assert.deepEqual(loads,[expected],'Only the selected provider mounts, including when storage is blocked');
}
console.log('PASS DJ workspace startup: URL/preference selection, no unwanted Serato load, blocked-storage fallback');
