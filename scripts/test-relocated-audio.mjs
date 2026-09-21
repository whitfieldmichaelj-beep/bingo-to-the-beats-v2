import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/audio/relocated-file.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require});
const {findRelocatedAudio}=exports;
const root=await mkdtemp(path.join(tmpdir(),'bttb-audio-'));
try {
  await mkdir(path.join(root,'All Music'));
  const song=path.join(root,'All Music','Artist - Song (Clean).mp3');
  await writeFile(song,'fixture');
  await writeFile(path.join(root,'All Music','._Artist - Song (Clean).mp3'),'metadata');
  assert.equal(await findRelocatedAudio('/old/Artist_-_Song_(Clean).mp3',root),song);
  assert.equal(await findRelocatedAudio('/old/Artist - Song (Dirty).mp3',root),null);
  assert.equal(await findRelocatedAudio('/old/Artist - Song (Clean).mp3',''),null);
  await writeFile(path.join(root,'Artist - Song (Clean).mp3'),'duplicate');
  assert.equal(await findRelocatedAudio('/old/Artist - Song (Clean).mp3',root),null);
  console.log('PASS relocated audio: underscore normalization, mix preservation, missing root, metadata exclusion, and ambiguous duplicates');
} finally {await rm(root,{recursive:true,force:true});}
