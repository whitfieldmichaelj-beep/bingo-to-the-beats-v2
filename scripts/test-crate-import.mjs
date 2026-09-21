import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const exports={};
const track={id:'song',title:'Song',artist:'Artist',filePath:'/Volumes/External/Music/song.mp3'};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/serato/smart-crates.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,Buffer,require:id=>id==='./service'?{getSeratoLibrary:async()=>({libraries:[{tracks:[track]}]})}:require(id),Date});
function tagged(tag,body){const head=Buffer.alloc(8);head.write(tag);head.writeUInt32BE(body.length,4);return Buffer.concat([head,body]);}
function utf16be(text){const b=Buffer.from(text,'utf16le');b.swap16();return b;}
const crate=Buffer.concat([tagged('vrsn',utf16be('1.0/Serato ScratchLive Crate')),tagged('otrk',tagged('ptrk',utf16be(track.filePath)))]);
assert.equal(exports.extractSeratoCratePaths(crate)[0],track.filePath);
assert.equal((await exports.readUploadedSeratoCrate(crate))[0].title,'Song');
await assert.rejects(exports.readUploadedSeratoCrate(tagged('vrsn',Buffer.from('rules only'))),/no saved song list/);
await assert.rejects(exports.readUploadedSeratoCrate(tagged('otrk',tagged('ptrk',utf16be('/Volumes/Missing/other.mp3')))),/could not be matched/);
const root='/Users/djmikedoelo/Music/_Serato_/SmartCrates';
if(process.argv.includes('--local')){
const name=readdirSync(root).find(name=>name.endsWith('.scrate'));
const paths=exports.extractSeratoCratePaths(readFileSync(`${root}/${name}`));assert.ok(paths.length>0);console.log(`PASS real smart-crate structure: ${paths.length} saved track paths read`);
}
const route={};let denied=null;
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/serato/import/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports:route,Buffer,File,require:id=>({'next/server':{NextResponse:{json:(data,opts={})=>({data,status:opts.status??200})}},'@/lib/auth/local-library':{localLibraryAccessResponse:async()=>denied},'@/lib/http/request-origin':{requestOrigin:()=> 'http://localhost:3000'},'@/lib/serato/smart-crates':{readUploadedSeratoCrate:exports.readUploadedSeratoCrate}})[id]});
const req=name=>({headers:{get:()=> 'http://localhost:3000'},formData:async()=>({get:()=>new File([crate],name)})});
for(const extension of ['crate','scrate']){const response=await route.POST(req(`set.${extension}`));assert.equal(response.status,200);assert.equal(response.data.tracks[0].title,'Song');assert.equal(response.data.tracks[0].filename,'');}
assert.equal((await route.POST(req('bad.txt'))).status,400);
denied={status:403};assert.equal((await route.POST({})).status,403);
console.log('PASS .crate/.scrate upload, library matching, missing/rule-only errors, extension validation and library owner guard');
