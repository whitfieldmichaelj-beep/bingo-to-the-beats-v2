import assert from 'node:assert/strict';
import { test } from 'node:test';
import { platformPaths, browserCommand } from './lib/platform.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const locations = {};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/serato/locations.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:locations,require,process});
test('Mac saved database and launcher paths are preserved',()=>{
 assert.deepEqual(platformPaths('darwin','/Users/dj',{}),{beta:'/Users/dj/Library/Application Support/BTTB Beta',database:'/Users/dj/Library/Application Support/prisma-dev-nodejs/default'});
});
test('Windows uses the installed Prisma data location and safe browser arguments',()=>{
 assert.deepEqual(platformPaths('win32','C:\\Users\\DJ',{}),{beta:'C:\\Users\\DJ\\AppData\\Local\\BTTB Beta',database:'C:\\Users\\DJ\\AppData\\Local\\prisma-dev-nodejs\\Data\\default'});
 assert.equal(platformPaths('win32','unused',{LOCALAPPDATA:'D:\\Local'}).database,'D:\\Local\\prisma-dev-nodejs\\Data\\default');
 assert.deepEqual(browserCommand('http://localhost:3010/dashboard','win32',{}),['C:\\Windows\\System32\\rundll32.exe',['url.dll,FileProtocolHandler','http://localhost:3010/dashboard']]);
 assert.throws(()=>browserCommand('https://other.example','win32',{}));
});
test('Serato accepts Windows libraries and rejects paths outside those libraries',()=>{
 for(const p of ['D:\\_Serato_','D:\\_Serato_\\Subcrates','d:\\music\\_serato_','C:\\Users\\DJ\\Music\\_Serato_'])assert.equal(locations.allowedSeratoPath(p,'win32','C:\\Users\\DJ',''),true,p);
 for(const p of ['D:\\Documents','D:\\_Serato_\\..\\private','C:\\Windows','D:\\_Serato_extra'])assert.equal(locations.allowedSeratoPath(p,'win32','C:\\Users\\DJ',''),false,p);
 assert.equal(locations.allowedSeratoPath('E:\\Library\\_Serato_','win32','C:\\Users\\DJ','E:\\Library\\_Serato_;F:\\Mixes\\_Serato_'),true);
});
test('Mac Serato paths remain accepted without widening unrelated locations',()=>{
 assert.equal(locations.allowedSeratoPath('/Volumes/DJ Drive/_Serato_','darwin','/Users/dj',''),true);
 assert.equal(locations.allowedSeratoPath('/Users/dj/Music/_Serato_','darwin','/Users/dj',''),true);
 assert.equal(locations.allowedSeratoPath('/Users/dj/Documents','darwin','/Users/dj',''),false);
});
