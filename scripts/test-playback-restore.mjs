import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const entry = {};
vm.runInNewContext(ts.transpileModule(readFileSync("lib/game/entry.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:entry});
const prize = {};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/game/prize.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:prize});
vm.runInNewContext(ts.transpileModule(readFileSync('lib/game/playback-config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports, require: name => {if(name==='./entry')return entry;assert.equal(name,'./prize');return prize;} });
const { makePlaybackConfig, restorePlaybackConfig } = exports;
const config = makePlaybackConfig('apple', 45, [{ id: 'i.saved', appleLibraryId: 'i.saved', appleCatalogId: '12345' }]);
const roundTrip = restorePlaybackConfig(JSON.parse(JSON.stringify(config)), 'p.saved', [{ id: 'i.saved', filePath: '' }]);
assert.equal(roundTrip.source, 'apple');
assert.equal(roundTrip.clipLength, 45);
assert.equal(roundTrip.tracks[0].appleCatalogId, '12345');
assert.equal(roundTrip.tracks[0].appleLibraryId, 'i.saved');
console.log('PASS saved Apple provider, clip length, and playable IDs survive database JSON round-trip');
for (const id of ['i.vMXYYaEhgJGXxx', 'a.6764419282', '123456789']) {
  assert.equal(restorePlaybackConfig(null, 'p.MoGJAaofvZqd77', [{ id, filePath: '' }]).source, 'apple');
}
assert.equal(restorePlaybackConfig(null, 'unknown-playlist', [{ id: 'unidentified', filePath: '' }]), null);
assert.equal(restorePlaybackConfig(null, 'p.unknown', [{ id: 'unidentified', filePath: '' }]), null);
console.log('PASS legacy Apple identifiers are recognized; unknown streaming sources are not guessed');
assert.equal(restorePlaybackConfig(null, 'crate', [{ id: 'song', filePath: '/music/test.mp3' }]).source, 'serato');
assert.equal(restorePlaybackConfig(makePlaybackConfig('local', 20, []), 'folder', []).source, 'local');
assert.equal(makePlaybackConfig('apple', -1, []).clipLength, 30);
assert.equal(makePlaybackConfig('spotify', 30, [{id:'song',audioUrl:'javascript:alert(1)'}]).tracks[0].audioUrl, undefined);
console.log('PASS local/Serato restoration, clip validation, and unsafe audio URL rejection');
const tickets={kind:'tickets',description:'Two concert tickets'};
const prizeConfig=makePlaybackConfig('virtualdj',30,[],{prize:tickets});
assert.equal(restorePlaybackConfig(JSON.parse(JSON.stringify(prizeConfig)),'crate',[]).prize.description,tickets.description);
console.log('PASS host-selected non-cash prize survives save and playback restore');

const entryConfig=makePlaybackConfig('virtualdj',30,[],{entry:{mode:'free',maxCardsPerPlayer:3},prize:tickets});
const entryRestored=restorePlaybackConfig(JSON.parse(JSON.stringify(entryConfig)),'crate',[]);
assert.equal(entryRestored.entry.mode,'free');assert.equal(entryRestored.entry.maxCardsPerPlayer,3);assert.equal(entryRestored.prize.description,tickets.description);
assert.equal(entry.readGameEntry(null,false).mode,'paid');assert.equal(entry.readGameEntry(entryConfig,true).maxCardsPerPlayer,10);
console.log('PASS entry terms survive restore alongside prize metadata; legacy and practice defaults remain unchanged');
